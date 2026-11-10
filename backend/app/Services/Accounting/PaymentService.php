<?php

namespace App\Services\Accounting;

use App\Models\Accounting\BankAccount;
use App\Models\Accounting\Document;
use App\Models\Accounting\Payment;
use App\Models\Company;
use App\Support\AccountRole;
use App\Support\AppTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Tahsilat ve ödeme yaşam döngüsü.
 *
 * Fiş mantığı: tahsilatta banka borçlanır, müşteri alacaklanır. Ödemede
 * tedarikçi borçlanır, banka alacaklanır. Banka masrafı ayrı gider satırı
 * olur — tahsilat tutarını azaltmaz, çünkü müşterinin borcu tam kapanmıştır.
 *
 * Dağıtılmayan tutar avans hesabına gider; "kim için ne kadar" bilgisi
 * kaybolmasın diye cari etiketi korunur.
 */
class PaymentService
{
    public function __construct(
        private readonly AccountRoleService $roles,
        private readonly SequenceService $sequences,
        private readonly JournalService $journal,
        private readonly AuditService $audit,
        private readonly ApprovalMatrixService $approvals,
    ) {}

    public function createDraft(Company $company, array $data, array $allocations = []): Payment
    {
        $hesap = BankAccount::where('company_id', $company->id)->findOrFail($data['bank_account_id']);

        if (! $hesap->is_active) {
            throw ValidationException::withMessages(['bank_account_id' => "{$hesap->name} hesabı pasif."]);
        }

        $tutar   = round((float) $data['amount'], 2);
        $paraBir = $data['currency'] ?? $hesap->currency;
        $kur     = (float) ($data['exchange_rate'] ?? 1);

        if ($paraBir !== $company->functionalCurrency() && $kur <= 0) {
            throw ValidationException::withMessages([
                'exchange_rate' => "Ödeme $paraBir cinsinden; defter para birimi {$company->functionalCurrency()}. Kur zorunlu.",
            ]);
        }

        return DB::transaction(function () use ($company, $data, $hesap, $tutar, $paraBir, $kur, $allocations) {
            $odeme = Payment::create([
                'company_id'      => $company->id,
                'direction'       => $data['direction'],
                'bank_account_id' => $hesap->id,
                'partner_id'      => $data['partner_id'] ?? null,
                'counter_account_id' => $data['counter_account_id'] ?? null,
                'payment_date'    => $data['payment_date'] ?? AppTime::today()->toDateString(),
                'amount'          => $tutar,
                'currency'        => $paraBir,
                'exchange_rate'   => $kur,
                'amount_fc'       => round($tutar * $kur, 2),
                'method'          => $data['method'] ?? null,
                'reference'       => $data['reference'] ?? null,
                'description'     => $data['description'] ?? null,
                'bank_charge'     => round((float) ($data['bank_charge'] ?? 0), 2),
                'status'          => 'draft',
                'prepared_by'     => auth()->id(),
                'meta'            => $data['meta'] ?? [],
            ]);

            if ($allocations) {
                $this->allocate($odeme, $allocations);
            }

            $this->audit->logModel($odeme, 'payment.created', [
                'direction' => $odeme->direction, 'amount' => (string) $odeme->amount,
            ]);

            return $odeme->fresh('allocations');
        });
    }

    /**
     * Ödemeyi belgelere dağıtır.
     *
     * Toplam dağıtım ödeme tutarını aşamaz. Kısmi tahsilat belgeyi
     * "partially_settled" yapar; tamamı kapanınca "settled".
     *
     * @param  array<int, array{document_id: string, amount: float}>  $satirlar
     */
    public function allocate(Payment $odeme, array $satirlar): Payment
    {
        if (! $odeme->isEditable()) {
            throw ValidationException::withMessages([
                'status' => 'Deftere işlenmiş ödemenin dağıtımı değiştirilemez.',
            ]);
        }

        return DB::transaction(function () use ($odeme, $satirlar) {
            // Önceki dağıtımları geri al; belgelerin kapanan tutarı düzelsin.
            foreach ($odeme->allocations as $eski) {
                $this->adjustSettlement($eski->document_id, -(float) $eski->allocated_amount);
            }
            $odeme->allocations()->delete();

            $toplam = 0.0;

            foreach ($satirlar as $satir) {
                $tutar = round((float) $satir['amount'], 2);

                if ($tutar <= 0) {
                    continue;
                }

                /** @var Document $belge */
                $belge = Document::where('company_id', $odeme->company_id)->findOrFail($satir['document_id']);

                if (! $belge->status->affectsLedger()) {
                    throw ValidationException::withMessages([
                        'allocations' => "{$belge->number} belgesi deftere işlenmemiş; ödeme uygulanamaz.",
                    ]);
                }

                if ($odeme->partner_id && $belge->partner_id && $belge->partner_id !== $odeme->partner_id) {
                    throw ValidationException::withMessages([
                        'allocations' => "{$belge->number} belgesi başka bir cariye ait.",
                    ]);
                }

                $kalan = $belge->outstanding();

                if ($tutar > $kalan + 0.01) {
                    throw ValidationException::withMessages([
                        'allocations' => sprintf('%s belgesine en fazla %s uygulanabilir, %s denendi.',
                            $belge->number, number_format($kalan, 2, ',', '.'), number_format($tutar, 2, ',', '.')),
                    ]);
                }

                // Gerçekleşen kur farkı: belge kuru ile tahsilat kuru farklıysa.
                $kurFarki = round(
                    $tutar * ((float) $odeme->exchange_rate - (float) $belge->exchange_rate),
                    2,
                );

                $odeme->allocations()->create([
                    'document_id'      => $belge->id,
                    'allocated_amount' => $tutar,
                    'fx_difference'    => $kurFarki,
                ]);

                $this->adjustSettlement($belge->id, $tutar);
                $toplam += $tutar;
            }

            if ($toplam > (float) $odeme->amount + 0.01) {
                throw ValidationException::withMessages([
                    'allocations' => sprintf('Dağıtım toplamı (%s) ödeme tutarını (%s) aşıyor.',
                        number_format($toplam, 2, ',', '.'), number_format((float) $odeme->amount, 2, ',', '.')),
                ]);
            }

            $odeme->forceFill(['allocated_amount' => round($toplam, 2)])->save();

            return $odeme->fresh('allocations');
        });
    }

    /**
     * Onaya gönderir.
     *
     * Eşiği aşan ödemeler ayrı onay ister; eşik altı doğrudan onaylanmış
     * sayılır ama hazırlayan yine kendi ödemesini post edemez.
     */
    public function submitForApproval(Payment $odeme): Payment
    {
        if (! $odeme->isEditable()) {
            throw ValidationException::withMessages(['status' => 'Bu ödeme onaya gönderilemez.']);
        }

        $odeme->forceFill(['status' => 'pending_approval'])->save();
        $this->audit->logModel($odeme, 'payment.submitted');

        return $odeme->fresh();
    }

    /**
     * Onaylar.
     *
     * Görev ayrılığı: hazırlayan kendi ödemesini onaylayamaz (doküman §10,
     * "hazırlayan/onaylayan ayrımı").
     */
    public function approve(Payment $odeme, ?string $not = null): Payment
    {
        // Görev ayrılığı kontrolü onay matrisinin içinde yapılıyor; burada
        // ayrıca sabit bir kontrol tutmuyoruz çünkü o, gerekçeli istisnayı
        // görmez ve istisnası olan kullanıcıyı da engellerdi.
        $kullanici = auth()->user();

        if (! $kullanici) {
            // Oturumsuz çağrı (konsol, kuyruk): en azından hazırlayanı engelle.
            if ($odeme->prepared_by) {
                throw ValidationException::withMessages([
                    'approve' => 'Onay için oturum gerekiyor.',
                ]);
            }
        } else {
            $this->approvals->approve(
                company:    $odeme->company,
                eylem:      'payment.post',
                kayit:      $odeme,
                tutar:      (float) $odeme->amount,
                kullanici:  $kullanici,
                hazirlayan: $odeme->prepared_by,
                not:        $not,
            );
        }

        $odeme->forceFill([
            'status'      => 'approved',
            'approved_by' => auth()->id(),
            'approved_at' => now(),
        ])->save();

        $this->audit->logModel($odeme, 'payment.approved', ['amount' => (string) $odeme->amount]);

        return $odeme->fresh();
    }

    /**
     * Deftere işler: numara atar, fiş üretir, belgeleri kapatır.
     */
    public function post(Payment $odeme, ?string $postingDate = null): Payment
    {
        if ($odeme->status === 'posted') {
            throw ValidationException::withMessages(['status' => 'Ödeme zaten deftere işlenmiş.']);
        }

        if ($odeme->status === 'cancelled') {
            throw ValidationException::withMessages(['status' => 'İptal edilmiş ödeme işlenemez.']);
        }

        $hesap = $odeme->bankAccount;

        // Onay matrisi: tutara göre kaç kişinin onayladığı. Şirket matris
        // tanımlamamışsa kural bulunmaz ve kontrol etkisiz kalır.
        $this->approvals->assertSatisfied($odeme->company, 'payment.post', $odeme, (float) $odeme->amount);

        // Banka hesabı seviyesindeki basit eşik; matristen bağımsız çalışır.
        if ($hesap->needsApproval((float) $odeme->amount) && $odeme->status !== 'approved') {
            throw ValidationException::withMessages([
                'status' => sprintf('%s tutarındaki ödeme %s eşiğini aşıyor; önce onaylanmalı.',
                    number_format((float) $odeme->amount, 2, ',', '.'),
                    number_format((float) $hesap->approval_threshold, 2, ',', '.')),
            ]);
        }

        return DB::transaction(function () use ($odeme, $postingDate) {
            $odeme->load(['allocations.document', 'bankAccount', 'partner', 'company']);

            $numara = $odeme->number ?: $this->sequences->next(
                companyId: $odeme->company_id,
                key:       'payment:' . $odeme->direction,
                prefix:    $odeme->isIncoming() ? 'TAH' : 'ODE',
                year:      (int) $odeme->payment_date->format('Y'),
            );

            $satirlar = $this->buildLines($odeme);

            $fis = $this->journal->createDraft($odeme->company, [
                'journal_type' => $odeme->bankAccount->isCash() ? 'cash' : 'bank',
                'document_date'=> $odeme->payment_date->toDateString(),
                'posting_date' => $postingDate ?: $odeme->payment_date->toDateString(),
                'description'  => ($odeme->isIncoming() ? 'Tahsilat' : 'Ödeme') . " $numara"
                                  . ($odeme->partner ? " — {$odeme->partner->displayName()}" : ''),
                'reference'    => $odeme->reference ?: $numara,
                'source_type'  => 'PAYMENT',
                'source_id'    => $odeme->id,
            ], $satirlar);

            $fis = $fis->fresh();
            $fis->load('lines.account');
            $fis->forceFill(['status' => 'approved', 'approved_by' => auth()->id(),
                             'approved_at' => now(), 'content_hash' => $fis->computeContentHash()])->save();
            $fis = $this->journal->post($fis->fresh());

            $odeme->forceFill([
                'number'           => $numara,
                'status'           => 'posted',
                'journal_entry_id' => $fis->id,
                'posted_at'        => now(),
            ])->save();

            $this->audit->logModel($odeme, 'payment.posted', [
                'number' => $numara, 'journal_no' => $fis->journal_no,
                'amount' => (string) $odeme->amount, 'allocated' => (string) $odeme->allocated_amount,
            ]);

            return $odeme->fresh(['allocations', 'journalEntry']);
        });
    }

    public function cancel(Payment $odeme, string $gerekce): Payment
    {
        if ($odeme->status === 'posted') {
            throw ValidationException::withMessages([
                'status' => 'Deftere işlenmiş ödeme iptal edilemez; ters kayıt gerekir.',
            ]);
        }

        return DB::transaction(function () use ($odeme, $gerekce) {
            foreach ($odeme->allocations as $d) {
                $this->adjustSettlement($d->document_id, -(float) $d->allocated_amount);
            }
            $odeme->allocations()->delete();

            $odeme->forceFill(['status' => 'cancelled', 'allocated_amount' => 0])->save();
            $this->audit->logModel($odeme, 'payment.cancelled', [], $gerekce);

            return $odeme->fresh();
        });
    }

    /**
     * Fiş satırlarını kurar.
     *
     * Tahsilat: banka borç (tutar - masraf), masraf gider borç, cari alacak.
     * Ödeme: cari borç, banka alacak (tutar + masraf), masraf gider borç.
     */
    private function buildLines(Payment $odeme): array
    {
        $company = $odeme->company;
        $kur     = (float) $odeme->exchange_rate;
        $tutarFc = round((float) $odeme->amount * $kur, 2);
        $masraf  = round((float) $odeme->bank_charge * $kur, 2);
        $gelen   = $odeme->isIncoming();

        $satirlar = [];

        // Banka/kasa tarafı: tahsilatta masraf düşülerek girer.
        $bankaTutar = $gelen ? round($tutarFc - $masraf, 2) : round($tutarFc + $masraf, 2);

        $satirlar[] = [
            'account_id'  => $odeme->bankAccount->account_id,
            'description' => $odeme->bankAccount->name,
            'debit'       => $gelen ? $bankaTutar : 0.0,
            'credit'      => $gelen ? 0.0 : $bankaTutar,
        ];

        if ($masraf > 0) {
            $satirlar[] = [
                'account_id'  => $this->roles->accountId($company, AccountRole::DEFAULT_EXPENSE),
                'description' => 'Banka masrafı',
                'debit'       => $masraf,
                'credit'      => 0.0,
            ];
        }

        // Cari tarafı: dağıtılan kısım kontrol hesabına, kalanı avansa.
        //
        // Kapatılan belge DEFTERDE KENDİ KURUYLA duruyor. Tahsilat kuruyla
        // kapatmaya kalkarsak cari bakiyesi kapanmaz ve fiş dengesizleşir:
        // 1200 USD'lik fatura 0,925 kurla 1110 EUR yazıldıysa, 0,88 kurla
        // tahsil edilince cariden 1110 düşmeli, 1056 değil. Aradaki 54,
        // gerçekleşen kur farkıdır.
        $dagitilan = round($odeme->allocations->sum(
            fn ($d) => (float) $d->allocated_amount * (float) ($d->document?->exchange_rate ?? $kur),
        ), 2);

        // Avans, ödemenin belgeye bağlanmamış kısmı; o ödeme kuruyla değerlenir.
        $dagitilanIslem = round((float) $odeme->allocated_amount, 2);
        $avans = round(((float) $odeme->amount - $dagitilanIslem) * $kur, 2);

        $kontrolRol = $gelen ? AccountRole::AR_CONTROL : AccountRole::AP_CONTROL;
        $avansRol   = $gelen ? AccountRole::CUSTOMER_ADVANCE : AccountRole::SUPPLIER_ADVANCE;

        if ($dagitilan > 0) {
            $satirlar[] = [
                'account_id'  => $this->roles->accountId($company, $kontrolRol),
                'description' => 'Belge kapatma',
                'debit'       => $gelen ? 0.0 : $dagitilan,
                'credit'      => $gelen ? $dagitilan : 0.0,
                'partner_id'  => $odeme->partner_id,
            ];
        }

        if ($avans > 0.009) {
            // Cari belliyse dağıtılmamış kısım avanstır. Cari yoksa hareketin
            // karşı tarafı bir hesap olmalı (sermaye koyma, banka faizi,
            // personel iadesi); bu açıkça seçilir, uydurulmaz.
            if ($odeme->counter_account_id) {
                $satirlar[] = [
                    'account_id'  => $odeme->counter_account_id,
                    'description' => $odeme->description ?: 'Karşı hesap',
                    'debit'       => $gelen ? 0.0 : $avans,
                    'credit'      => $gelen ? $avans : 0.0,
                    'partner_id'  => $odeme->partner_id,
                ];
            } elseif ($odeme->partner_id) {
                $satirlar[] = [
                    'account_id'  => $this->roles->accountId($company, $avansRol),
                    'description' => 'Dağıtılmamış tutar (avans)',
                    'debit'       => $gelen ? 0.0 : $avans,
                    'credit'      => $gelen ? $avans : 0.0,
                    'partner_id'  => $odeme->partner_id,
                ];
            } else {
                throw ValidationException::withMessages([
                    'counter_account_id' => sprintf(
                        'Ödemenin %s tutarlık kısmı hiçbir belgeye dağıtılmamış ve cari seçilmemiş. '
                        . 'Avans olarak yazmak için cari, başka bir hesaba yazmak için karşı hesap seçin.',
                        number_format($avans, 2, ',', '.'),
                    ),
                ]);
            }
        }

        // Gerçekleşen kur farkı: belgenin defterdeki değeri ile tahsil edilen
        // tutarın defter karşılığı arasındaki fark. Fişi dengeleyen satır budur.
        $kurFarki = round($odeme->allocations->sum(fn ($d) => (float) $d->fx_difference), 2);

        if (abs($kurFarki) >= 0.01) {
            // Tahsilatta kur düşmüşse (fark negatif) daha az para girmiştir: kayıp.
            // Ödemede tersi geçerli.
            $kazanc = $gelen ? $kurFarki > 0 : $kurFarki < 0;

            $satirlar[] = [
                'account_id'  => $this->roles->accountId($company, $kazanc ? AccountRole::FX_GAIN : AccountRole::FX_LOSS),
                'description' => 'Gerçekleşen kur farkı',
                'debit'       => $kazanc ? 0.0 : abs($kurFarki),
                'credit'      => $kazanc ? abs($kurFarki) : 0.0,
                'partner_id'  => $odeme->partner_id,
            ];
        }

        return $satirlar;
    }

    /** Belgenin kapatılan tutarını değiştirir ve durumunu günceller. */
    private function adjustSettlement(string $belgeId, float $delta): void
    {
        $belge = Document::find($belgeId);

        if (! $belge) {
            return;
        }

        $yeni = round(max((float) $belge->settled_amount + $delta, 0), 2);
        $brut = round((float) $belge->gross_amount, 2);

        $belge->forceFill([
            'settled_amount' => $yeni,
            'status'         => match (true) {
                $yeni >= $brut - 0.01 => 'settled',
                $yeni > 0.009         => 'partially_settled',
                default               => 'posted',
            },
        ])->save();
    }
}
