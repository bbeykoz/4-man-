<?php

namespace App\Services\Accounting;

use App\Models\Accounting\BankTransaction;
use App\Models\Accounting\BusinessPartner;
use App\Models\Accounting\Document;
use App\Models\Accounting\Payment;
use App\Models\Company;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Ekstre satırı eşleştirme.
 *
 * Öneri üretir, karar vermez. Doküman §14 "banka eşleştirme" satırı açık:
 * otomatik eşik üstünde bile kullanıcı onayı gerekiyor. Bu yüzden servis
 * yalnız aday ve güven puanı döndürüyor; kaydı insan onaylıyor.
 *
 * Puanlama toplamsal: her sinyal kendi ağırlığını ekliyor, hiçbiri tek
 * başına kesin değil.
 */
class BankMatchingService
{
    /** Sinyal ağırlıkları; toplamı 100'ü aşabilir, sonuç 100'de kırpılır. */
    private const AGIRLIK = [
        'tutar_tam'        => 45,   // tutar kuruşuna kadar aynı
        'tutar_yakin'      => 15,   // kuruş farkı var
        'belge_no'         => 30,   // açıklamada belge numarası geçiyor
        'cari_iban'        => 20,   // karşı taraf IBAN'ı cari kartında
        'cari_ad'          => 12,   // karşı taraf adı cari adına benziyor
        'tarih_yakin'      => 8,    // vade ya da belge tarihine yakın
        'referans'         => 10,   // ödeme referansı birebir
    ];

    /** Bu puanın altındaki aday gösterilmez. */
    private const ESIK = 25;

    public function __construct(private readonly AuditService $audit) {}

    /**
     * Bir ekstre satırı için aday eşleşmeler.
     *
     * @return array{transaction: array, candidates: array}
     */
    public function suggest(BankTransaction $satir, int $limit = 5): array
    {
        $company = $satir->company;
        $gelen   = $satir->isIncoming();
        $tutar   = $satir->absAmount();

        $adaylar = array_merge(
            $this->matchPayments($satir, $company, $gelen, $tutar),
            $this->matchDocuments($satir, $company, $gelen, $tutar),
        );

        usort($adaylar, fn ($a, $b) => $b['confidence'] <=> $a['confidence']);

        $adaylar = array_slice(
            array_filter($adaylar, fn ($a) => $a['confidence'] >= self::ESIK),
            0, $limit,
        );

        return [
            'transaction' => [
                'id'                => $satir->id,
                'booking_date'      => $satir->booking_date->toDateString(),
                'amount'            => round((float) $satir->amount, 2),
                'direction'         => $gelen ? 'in' : 'out',
                'remittance'        => $satir->remittance,
                'counterparty_name' => $satir->counterparty_name,
                'counterparty_iban' => $satir->counterparty_iban,
                'match_status'      => $satir->match_status,
            ],
            'candidates' => array_values($adaylar),
        ];
    }

    /** Birden çok satır için toplu öneri; ekstre ekranı bunu kullanır. */
    public function suggestForStatement(string $statementId, int $limit = 3): array
    {
        $satirlar = BankTransaction::where('statement_id', $statementId)
            ->unmatched()
            ->orderBy('booking_date')
            ->get();

        $sonuc = [];
        $otomatikAday = 0;

        foreach ($satirlar as $satir) {
            $oneri = $this->suggest($satir, $limit);
            $enIyi = $oneri['candidates'][0] ?? null;

            // Güçlü aday varsa satırı "suggested" işaretle; karar yine insanın.
            if ($enIyi && $enIyi['confidence'] >= 70 && $satir->match_status === 'unmatched') {
                $satir->forceFill([
                    'match_status'     => 'suggested',
                    'match_confidence' => $enIyi['confidence'],
                    'match_reasons'    => $enIyi['reasons'],
                ])->save();
                $otomatikAday++;
            }

            $sonuc[] = $oneri;
        }

        return ['rows' => $sonuc, 'suggested' => $otomatikAday, 'total' => count($sonuc)];
    }

    /**
     * Eşleştirmeyi onaylar.
     *
     * Ödemeye eşleşiyorsa satır o ödemeye bağlanır. Belgeye eşleşiyorsa
     * önce ödeme oluşturulup deftere işlenir, sonra satır bağlanır.
     */
    public function confirm(BankTransaction $satir, string $tur, string $hedefId, PaymentService $odemeler): BankTransaction
    {
        if ($satir->match_status === 'matched') {
            throw ValidationException::withMessages(['transaction' => 'Bu satır zaten eşleştirilmiş.']);
        }

        return DB::transaction(function () use ($satir, $tur, $hedefId, $odemeler) {
            if ($tur === 'payment') {
                $odeme = Payment::where('company_id', $satir->company_id)->findOrFail($hedefId);

                if (abs((float) $odeme->amount - $satir->absAmount()) > 0.01) {
                    throw ValidationException::withMessages([
                        'payment' => sprintf('Tutarlar uyuşmuyor: ekstre %s, ödeme %s.',
                            number_format($satir->absAmount(), 2, ',', '.'),
                            number_format((float) $odeme->amount, 2, ',', '.')),
                    ]);
                }

                $satir->forceFill([
                    'match_status'     => 'matched',
                    'payment_id'       => $odeme->id,
                    'journal_entry_id' => $odeme->journal_entry_id,
                    'matched_by'       => auth()->id(),
                    'matched_at'       => now(),
                ])->save();

                $this->audit->logModel($satir, 'bank_transaction.matched', [
                    'type' => 'payment', 'payment' => $odeme->number,
                ]);

                return $satir->fresh();
            }

            if ($tur === 'document') {
                $belge = Document::where('company_id', $satir->company_id)->findOrFail($hedefId);

                $odeme = $odemeler->createDraft($satir->company, [
                    'direction'       => $satir->isIncoming() ? 'in' : 'out',
                    'bank_account_id' => $satir->bank_account_id,
                    'partner_id'      => $belge->partner_id,
                    'payment_date'    => $satir->booking_date->toDateString(),
                    'amount'          => $satir->absAmount(),
                    'currency'        => $satir->currency,
                    'reference'       => $satir->remittance,
                    'description'     => "Ekstre eşleştirmesi — {$belge->number}",
                    'method'          => 'transfer',
                ], [[
                    'document_id' => $belge->id,
                    'amount'      => min($satir->absAmount(), $belge->outstanding()),
                ]]);

                $odeme = $odemeler->post($odeme->fresh());

                $satir->forceFill([
                    'match_status'     => 'matched',
                    'payment_id'       => $odeme->id,
                    'journal_entry_id' => $odeme->journal_entry_id,
                    'matched_by'       => auth()->id(),
                    'matched_at'       => now(),
                ])->save();

                $this->audit->logModel($satir, 'bank_transaction.matched', [
                    'type' => 'document', 'document' => $belge->number, 'payment' => $odeme->number,
                ]);

                return $satir->fresh();
            }

            throw ValidationException::withMessages(['type' => "Bilinmeyen eşleştirme türü: $tur"]);
        });
    }

    /** Satırı göz ardı eder; mutabakatta açıklanmış sayılır. */
    public function ignore(BankTransaction $satir, string $gerekce): BankTransaction
    {
        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'Göz ardı etme gerekçesi zorunludur.']);
        }

        $satir->forceFill([
            'match_status'  => 'ignored',
            'ignore_reason' => $gerekce,
            'matched_by'    => auth()->id(),
            'matched_at'    => now(),
        ])->save();

        $this->audit->logModel($satir, 'bank_transaction.ignored', [], $gerekce);

        return $satir->fresh();
    }

    /** Eşleştirmeyi geri alır; üretilmiş ödeme varsa dokunulmaz, bağ kopar. */
    public function unmatch(BankTransaction $satir): BankTransaction
    {
        $satir->forceFill([
            'match_status'     => 'unmatched',
            'payment_id'       => null,
            'journal_entry_id' => null,
            'match_confidence' => null,
            'match_reasons'    => [],
            'matched_by'       => null,
            'matched_at'       => null,
            'ignore_reason'    => null,
        ])->save();

        $this->audit->logModel($satir, 'bank_transaction.unmatched');

        return $satir->fresh();
    }

    // ─── Puanlama ───────────────────────────────────────────────────

    /** Deftere işlenmiş ama ekstreye bağlanmamış ödemeler. */
    private function matchPayments(BankTransaction $satir, Company $company, bool $gelen, float $tutar): array
    {
        $odemeler = Payment::where('company_id', $company->id)
            ->where('bank_account_id', $satir->bank_account_id)
            ->where('direction', $gelen ? 'in' : 'out')
            ->posted()
            ->whereDoesntHave('bankTransactions', fn ($q) => $q->where('match_status', 'matched'))
            ->whereBetween('payment_date', [
                $satir->booking_date->copy()->subDays(10)->toDateString(),
                $satir->booking_date->copy()->addDays(10)->toDateString(),
            ])
            ->with('partner')
            ->limit(50)
            ->get();

        return $odemeler->map(function (Payment $o) use ($satir, $tutar) {
            [$puan, $sebepler] = $this->score($satir, $tutar, [
                'amount'      => (float) $o->amount,
                'date'        => $o->payment_date->toDateString(),
                'number'      => $o->number,
                'reference'   => $o->reference,
                'partner'     => $o->partner,
            ]);

            return [
                'type'       => 'payment',
                'id'         => $o->id,
                'label'      => ($o->isIncoming() ? 'Tahsilat' : 'Ödeme') . " {$o->number}",
                'date'       => $o->payment_date->toDateString(),
                'amount'     => round((float) $o->amount, 2),
                'partner'    => $o->partner?->displayName(),
                'confidence' => $puan,
                'reasons'    => $sebepler,
            ];
        })->all();
    }

    /** Açık belgeler: ekstre satırı doğrudan faturayı kapatıyor olabilir. */
    private function matchDocuments(BankTransaction $satir, Company $company, bool $gelen, float $tutar): array
    {
        $turler = $gelen
            ? ['sales_invoice', 'sales_debit_note']
            : ['purchase_invoice', 'purchase_debit_note', 'expense'];

        $belgeler = Document::where('company_id', $company->id)
            ->whereIn('doc_type', $turler)
            ->open()
            ->whereDate('issue_date', '<=', $satir->booking_date->copy()->addDays(5)->toDateString())
            ->with('partner')
            ->orderByDesc('issue_date')
            ->limit(80)
            ->get();

        return $belgeler->map(function (Document $b) use ($satir, $tutar) {
            [$puan, $sebepler] = $this->score($satir, $tutar, [
                'amount'    => $b->outstanding(),
                'date'      => ($b->due_date ?? $b->issue_date)->toDateString(),
                'number'    => $b->number,
                'reference' => $b->reference,
                'partner'   => $b->partner,
            ]);

            return [
                'type'        => 'document',
                'id'          => $b->id,
                'label'       => "{$b->doc_type->label()} {$b->number}",
                'date'        => $b->issue_date->toDateString(),
                'due_date'    => $b->due_date?->toDateString(),
                'amount'      => round((float) $b->gross_amount, 2),
                'outstanding' => $b->outstanding(),
                'partner'     => $b->partner?->displayName(),
                'confidence'  => $puan,
                'reasons'     => $sebepler,
            ];
        })->all();
    }

    /**
     * Tek adayın puanı.
     *
     * @return array{0: float, 1: array<int, string>}
     */
    private function score(BankTransaction $satir, float $tutar, array $aday): array
    {
        $puan = 0.0;
        $sebepler = [];

        $fark = abs($tutar - (float) $aday['amount']);

        if ($fark < 0.01) {
            $puan += self::AGIRLIK['tutar_tam'];
            $sebepler[] = 'Tutar birebir aynı';
        } elseif ($fark <= max(1.0, $tutar * 0.01)) {
            $puan += self::AGIRLIK['tutar_yakin'];
            $sebepler[] = sprintf('Tutar yakın (%s fark)', number_format($fark, 2, ',', '.'));
        } else {
            // Tutar tutmuyorsa diğer sinyaller tek başına yeterli olmamalı.
            return [0.0, []];
        }

        $metin = mb_strtolower(trim(($satir->remittance ?? '') . ' ' . ($satir->counterparty_name ?? '')));

        if ($aday['number'] && $metin !== '' && $this->containsNumber($metin, $aday['number'])) {
            $puan += self::AGIRLIK['belge_no'];
            $sebepler[] = "Açıklamada {$aday['number']} geçiyor";
        }

        if ($aday['reference'] && $metin !== '' && mb_stripos($metin, mb_strtolower($aday['reference'])) !== false) {
            $puan += self::AGIRLIK['referans'];
            $sebepler[] = 'Referans eşleşiyor';
        }

        /** @var BusinessPartner|null $cari */
        $cari = $aday['partner'] ?? null;

        if ($cari) {
            if ($satir->counterparty_iban && $this->partnerHasIban($cari, $satir->counterparty_iban)) {
                $puan += self::AGIRLIK['cari_iban'];
                $sebepler[] = 'Karşı taraf IBAN cari kartında kayıtlı';
            }

            if ($satir->counterparty_name && $this->nameSimilar($satir->counterparty_name, $cari)) {
                $puan += self::AGIRLIK['cari_ad'];
                $sebepler[] = "Karşı taraf adı {$cari->displayName()} ile örtüşüyor";
            }
        }

        $gunFarki = abs(Carbon::parse($aday['date'])->diffInDays($satir->booking_date));

        if ($gunFarki <= 3) {
            $puan += self::AGIRLIK['tarih_yakin'];
            $sebepler[] = $gunFarki === 0 ? 'Aynı tarih' : "Tarih $gunFarki gün farkla yakın";
        }

        return [min(round($puan, 2), 100.0), $sebepler];
    }

    /** Belge numarası metinde geçiyor mu; ayırıcılar yok sayılır. */
    private function containsNumber(string $metin, string $numara): bool
    {
        if (mb_stripos($metin, mb_strtolower($numara)) !== false) {
            return true;
        }

        // "SF-2026-000001" ile "SF2026000001" aynı sayılmalı.
        $sade = preg_replace('/[^a-z0-9]/i', '', $numara);
        $metinSade = preg_replace('/[^a-z0-9]/i', '', $metin);

        if (strlen($sade) < 5) {
            return false;
        }

        return mb_stripos($metinSade, mb_strtolower($sade)) !== false;
    }

    private function partnerHasIban(BusinessPartner $cari, string $iban): bool
    {
        $temiz = strtoupper(preg_replace('/\s+/', '', $iban));

        return strtoupper((string) data_get($cari->meta, 'iban')) === $temiz
            || collect(data_get($cari->meta, 'ibans', []))
                ->map(fn ($i) => strtoupper(preg_replace('/\s+/', '', (string) $i)))
                ->contains($temiz);
    }

    /** Ad benzerliği: ilk anlamlı kelime ortaksa yeterli sinyal. */
    private function nameSimilar(string $ekstreAdi, BusinessPartner $cari): bool
    {
        $normalize = function (string $s): array {
            $s = mb_strtolower(preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $s));
            // Şirket türü ekleri ayırt edici değil.
            $atla = ['eood', 'ood', 'ad', 'et', 'ltd', 'sti', 'as', 'a', 's', 'inc', 'gmbh', 'bv', 'sa'];

            return array_values(array_filter(
                preg_split('/\s+/', $s) ?: [],
                fn ($k) => mb_strlen($k) > 2 && ! in_array($k, $atla, true),
            ));
        };

        $a = $normalize($ekstreAdi);
        $b = array_merge($normalize($cari->legal_name), $normalize((string) $cari->trade_name));

        return (bool) array_intersect($a, $b);
    }
}
