<?php

namespace App\Services\Accounting;

use App\Models\Accounting\BankAccount;
use App\Models\Accounting\BankStatement;
use App\Models\Accounting\BankTransaction;
use App\Models\Company;
use App\Support\AppTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Banka ekstresi içe aktarma.
 *
 * İki biçim destekleniyor: CSV (yaygın banka dışa aktarımı) ve CAMT.053 XML
 * (SEPA standardı). MT940 ileride aynı arayüze eklenebilir — ayrıştırıcı
 * değişir, kayıt yolu aynı kalır.
 *
 * Mükerrer koruması iki katmanlı: dosya özeti aynıysa ekstre reddedilir,
 * satır kimliği aynıysa satır atlanır. Banka satır kimliği vermezse
 * tarih+tutar+açıklamadan türetiliyor.
 */
class BankStatementService
{
    public function __construct(private readonly AuditService $audit) {}

    /**
     * Ekstreyi içe aktarır.
     *
     * @param  string  $icerik  Dosya içeriği.
     * @param  string  $bicim   csv | camt053
     */
    public function import(Company $company, BankAccount $hesap, string $icerik, string $bicim = 'csv', ?string $dosyaAdi = null): BankStatement
    {
        $ozet = hash('sha256', $icerik);

        $mevcut = BankStatement::where('company_id', $company->id)->where('file_hash', $ozet)->first();

        if ($mevcut) {
            throw ValidationException::withMessages([
                'file' => "Bu ekstre dosyası {$mevcut->created_at->format('d.m.Y H:i')} tarihinde zaten yüklenmiş.",
            ]);
        }

        $ayristirilmis = match ($bicim) {
            'csv'     => $this->parseCsv($icerik),
            'camt053' => $this->parseCamt053($icerik),
            default   => throw ValidationException::withMessages(['format' => "Desteklenmeyen ekstre biçimi: $bicim"]),
        };

        if (empty($ayristirilmis['lines'])) {
            throw ValidationException::withMessages(['file' => 'Ekstrede okunabilir hareket bulunamadı.']);
        }

        return DB::transaction(function () use ($company, $hesap, $ayristirilmis, $bicim, $ozet, $dosyaAdi) {
            $tarihler = array_column($ayristirilmis['lines'], 'booking_date');
            sort($tarihler);

            $ekstre = BankStatement::create([
                'company_id'      => $company->id,
                'bank_account_id' => $hesap->id,
                'reference'       => $ayristirilmis['reference'] ?? null,
                'statement_date'  => $ayristirilmis['statement_date'] ?? end($tarihler),
                'period_start'    => $ayristirilmis['period_start'] ?? reset($tarihler),
                'period_end'      => $ayristirilmis['period_end'] ?? end($tarihler),
                'opening_balance' => $ayristirilmis['opening_balance'] ?? 0,
                'closing_balance' => $ayristirilmis['closing_balance']
                                     ?? round(($ayristirilmis['opening_balance'] ?? 0)
                                        + array_sum(array_column($ayristirilmis['lines'], 'amount')), 2),
                'currency'        => $ayristirilmis['currency'] ?? $hesap->currency,
                'format'          => $bicim,
                'source_file'     => $dosyaAdi,
                'file_hash'       => $ozet,
                'status'          => 'imported',
                'imported_by'     => auth()->id(),
            ]);

            $eklenen = $atlanan = 0;

            foreach ($ayristirilmis['lines'] as $satir) {
                $kimlik = $satir['external_id']
                    ?? $this->deriveId($hesap->id, $satir);

                $varMi = BankTransaction::where('bank_account_id', $hesap->id)
                    ->where('external_id', $kimlik)->exists();

                if ($varMi) {
                    $atlanan++;
                    continue;
                }

                BankTransaction::create([
                    'company_id'        => $company->id,
                    'bank_account_id'   => $hesap->id,
                    'statement_id'      => $ekstre->id,
                    'external_id'       => $kimlik,
                    'booking_date'      => $satir['booking_date'],
                    'value_date'        => $satir['value_date'] ?? $satir['booking_date'],
                    'amount'            => $satir['amount'],
                    'currency'          => $satir['currency'] ?? $ekstre->currency,
                    'remittance'        => $satir['remittance'] ?? null,
                    'counterparty_name' => $satir['counterparty_name'] ?? null,
                    'counterparty_iban' => $satir['counterparty_iban'] ?? null,
                    'running_balance'   => $satir['running_balance'] ?? null,
                    'match_status'      => 'unmatched',
                ]);

                $eklenen++;
            }

            $this->audit->logModel($ekstre, 'bank_statement.imported', [
                'account' => $hesap->code, 'format' => $bicim,
                'imported' => $eklenen, 'skipped_duplicates' => $atlanan,
                'period' => "{$ekstre->period_start->toDateString()} – {$ekstre->period_end->toDateString()}",
            ]);

            return $ekstre->fresh('transactions');
        });
    }

    /**
     * CSV ayrıştırıcı.
     *
     * Sütun adları bankadan bankaya değişiyor; yaygın adların hepsini
     * tanıyoruz. Zorunlu olan: tarih ve tutar.
     */
    private function parseCsv(string $icerik): array
    {
        $satirlar = preg_split('/\r\n|\r|\n/', trim($icerik));
        $basliklar = null;
        $sonuc = [];

        // Ayırıcı noktalı virgül de olabiliyor (Avrupa bankaları).
        $ayirici = substr_count($satirlar[0] ?? '', ';') > substr_count($satirlar[0] ?? '', ',') ? ';' : ',';

        foreach ($satirlar as $ham) {
            if (trim($ham) === '') {
                continue;
            }

            $alanlar = str_getcsv($ham, $ayirici, '"', '\\');

            if ($basliklar === null) {
                $basliklar = array_map(fn ($b) => Str::slug(trim($b), '_'), $alanlar);
                continue;
            }

            $satir = array_combine(
                array_slice($basliklar, 0, count($alanlar)),
                array_slice($alanlar, 0, count($basliklar)),
            ) ?: [];

            $tarih = $this->pick($satir, ['booking_date', 'date', 'tarih', 'islem_tarihi', 'valuta', 'value_date']);
            $tutar = $this->pick($satir, ['amount', 'tutar', 'miktar', 'bedrag']);

            // Borç/alacak ayrı sütunda verilmişse birleştir.
            if ($tutar === null) {
                $borc   = $this->number($this->pick($satir, ['debit', 'borc', 'cikis']));
                $alacak = $this->number($this->pick($satir, ['credit', 'alacak', 'giris']));
                $tutar  = $alacak - $borc;
            } else {
                $tutar = $this->number($tutar);
            }

            if ($tarih === null || $tutar === null || abs($tutar) < 0.000001) {
                continue;
            }

            $sonuc[] = [
                'external_id'       => $this->pick($satir, ['id', 'external_id', 'reference_no', 'transaction_id', 'islem_no']),
                'booking_date'      => $this->date($tarih),
                'value_date'        => ($v = $this->pick($satir, ['value_date', 'valor', 'valor_tarihi'])) ? $this->date($v) : null,
                'amount'            => round($tutar, 2),
                'currency'          => $this->pick($satir, ['currency', 'para_birimi', 'doviz']),
                'remittance'        => $this->pick($satir, ['description', 'remittance', 'aciklama', 'detay', 'reference']),
                'counterparty_name' => $this->pick($satir, ['counterparty', 'counterparty_name', 'karsi_taraf', 'ad_soyad', 'unvan']),
                'counterparty_iban' => $this->pick($satir, ['counterparty_iban', 'iban', 'karsi_iban']),
                'running_balance'   => ($b = $this->pick($satir, ['balance', 'bakiye'])) ? $this->number($b) : null,
            ];
        }

        return ['lines' => $sonuc];
    }

    /**
     * CAMT.053 ayrıştırıcı.
     *
     * SEPA standardı; CdtDbtInd alanı yönü belirtiyor (CRDT giriş, DBIT çıkış).
     * Tutar her zaman pozitif geldiği için işareti biz koyuyoruz.
     */
    private function parseCamt053(string $icerik): array
    {
        // CAMT.053 varsayılan ad alanı kullanıyor. registerXPathNamespace alt
        // düğümlere taşınmıyor; ad alanını metinden söküp düz XML olarak
        // okumak hem basit hem de sürüm farklarından etkilenmiyor.
        $sade = preg_replace('/\sxmlns(:\w+)?="[^"]*"/', '', $icerik);

        $onceki = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($sade);
        libxml_use_internal_errors($onceki);

        if ($xml === false) {
            throw ValidationException::withMessages(['file' => 'CAMT.053 dosyası okunamadı; XML geçersiz.']);
        }

        $stmt = $xml->xpath('//Stmt')[0] ?? null;

        if (! $stmt) {
            throw ValidationException::withMessages(['file' => 'CAMT.053 dosyasında Stmt bölümü yok.']);
        }

        $bakiye = function (string $kod) use ($stmt): ?float {
            foreach ($stmt->xpath('.//Bal') ?: [] as $b) {
                if ((string) ($b->Tp->CdOrPrtry->Cd ?? '') === $kod) {
                    $tutar = (float) $b->Amt;
                    return (string) ($b->CdtDbtInd ?? 'CRDT') === 'DBIT' ? -$tutar : $tutar;
                }
            }
            return null;
        };

        $satirlar = [];

        foreach ($stmt->xpath('.//Ntry') ?: [] as $ntry) {
            $yon   = (string) ($ntry->CdtDbtInd ?? 'CRDT');
            $tutar = round((float) $ntry->Amt, 2) * ($yon === 'DBIT' ? -1 : 1);

            $detay = $ntry->NtryDtls->TxDtls ?? null;
            $karsi = $yon === 'DBIT'
                ? ($detay->RltdPties->Cdtr->Nm ?? null)
                : ($detay->RltdPties->Dbtr->Nm ?? null);
            $iban  = $yon === 'DBIT'
                ? ($detay->RltdPties->CdtrAcct->Id->IBAN ?? null)
                : ($detay->RltdPties->DbtrAcct->Id->IBAN ?? null);

            $satirlar[] = [
                'external_id'       => (string) ($ntry->NtryRef ?? $ntry->AcctSvcrRef ?? '') ?: null,
                'booking_date'      => (string) ($ntry->BookgDt->Dt ?? $ntry->BookgDt->DtTm ?? ''),
                'value_date'        => (string) ($ntry->ValDt->Dt ?? '') ?: null,
                'amount'            => $tutar,
                'currency'          => (string) ($ntry->Amt['Ccy'] ?? ''),
                'remittance'        => trim((string) ($detay->RmtInf->Ustrd ?? $ntry->AddtlNtryInf ?? '')) ?: null,
                'counterparty_name' => $karsi ? (string) $karsi : null,
                'counterparty_iban' => $iban ? (string) $iban : null,
            ];
        }

        return [
            'reference'       => (string) ($stmt->Id ?? '') ?: null,
            'statement_date'  => substr((string) ($stmt->CreDtTm ?? ''), 0, 10) ?: null,
            'period_start'    => (string) ($stmt->FrToDt->FrDtTm ?? '') ? substr((string) $stmt->FrToDt->FrDtTm, 0, 10) : null,
            'period_end'      => (string) ($stmt->FrToDt->ToDtTm ?? '') ? substr((string) $stmt->FrToDt->ToDtTm, 0, 10) : null,
            'opening_balance' => $bakiye('OPBD'),
            'closing_balance' => $bakiye('CLBD'),
            'currency'        => (string) ($stmt->Acct->Ccy ?? '') ?: null,
            'lines'           => $satirlar,
        ];
    }

    /**
     * Mutabakat: ekstre bakiyesi ile defter bakiyesi.
     *
     * Fark açıklanmalı: eşleşmemiş ekstre satırları ve deftere yazılmış ama
     * ekstrede görünmeyen hareketler.
     */
    public function reconcile(BankAccount $hesap, string $tarih): array
    {
        $defter = $hesap->ledgerBalance($tarih);

        $sonEkstre = BankStatement::where('bank_account_id', $hesap->id)
            ->whereDate('period_end', '<=', $tarih)
            ->orderByDesc('period_end')
            ->first();

        $ekstreBakiye = $sonEkstre ? (float) $sonEkstre->closing_balance : null;

        $eslesmeyen = BankTransaction::where('bank_account_id', $hesap->id)
            ->whereDate('booking_date', '<=', $tarih)
            ->unmatched()
            ->get(['id', 'booking_date', 'amount', 'remittance', 'counterparty_name', 'match_status']);

        $eslesmeyenToplam = round($eslesmeyen->sum(fn ($t) => (float) $t->amount), 2);

        $fark = $ekstreBakiye === null ? null : round($ekstreBakiye - $defter, 2);

        return [
            'bank_account'        => ['id' => $hesap->id, 'code' => $hesap->code, 'name' => $hesap->name],
            'as_of'               => $tarih,
            'ledger_balance'      => $defter,
            'statement_balance'   => $ekstreBakiye,
            'statement_reference' => $sonEkstre?->reference,
            'statement_period'    => $sonEkstre ? "{$sonEkstre->period_start->toDateString()} – {$sonEkstre->period_end->toDateString()}" : null,
            'difference'          => $fark,
            'unmatched_count'     => $eslesmeyen->count(),
            'unmatched_total'     => $eslesmeyenToplam,
            // Eşleşmeyenler farkı açıklıyor mu; kalan gerçekten araştırılmalı.
            'unexplained'         => $fark === null ? null : round($fark - $eslesmeyenToplam, 2),
            'reconciled'          => $fark !== null && abs($fark - $eslesmeyenToplam) < 0.01,
            'unmatched_items'     => $eslesmeyen->map(fn ($t) => [
                'id'                => $t->id,
                'booking_date'      => $t->booking_date->toDateString(),
                'amount'            => round((float) $t->amount, 2),
                'remittance'        => $t->remittance,
                'counterparty_name' => $t->counterparty_name,
                'match_status'      => $t->match_status,
            ])->all(),
            'currency'     => $hesap->currency,
            'generated_at' => AppTime::now()->toIso8601String(),
        ];
    }

    // ─── Ayrıştırma yardımcıları ────────────────────────────────────

    private function pick(array $satir, array $adaylar): ?string
    {
        foreach ($adaylar as $ad) {
            if (isset($satir[$ad]) && trim((string) $satir[$ad]) !== '') {
                return trim((string) $satir[$ad]);
            }
        }

        return null;
    }

    /** "1.234,56" ve "1,234.56" biçimlerinin ikisini de okur. */
    private function number(?string $deger): float
    {
        if ($deger === null || trim($deger) === '') {
            return 0.0;
        }

        $temiz = preg_replace('/[^\d,.\-+]/', '', $deger);

        // Son ayırıcı hangisiyse ondalık odur.
        $sonNokta  = strrpos($temiz, '.');
        $sonVirgul = strrpos($temiz, ',');

        if ($sonVirgul !== false && ($sonNokta === false || $sonVirgul > $sonNokta)) {
            $temiz = str_replace('.', '', $temiz);
            $temiz = str_replace(',', '.', $temiz);
        } else {
            $temiz = str_replace(',', '', $temiz);
        }

        return (float) $temiz;
    }

    /**
     * Tarihi tanır.
     *
     * Banka biçimleri karışık: 10.03.2026, 2026-03-10, 10/03/2026. Sırayla
     * denenir. createFromFormat uymayan biçimde exception atıyor (false
     * dönmüyor), bu yüzden her deneme ayrı yakalanıyor.
     */
    private function date(string $deger): string
    {
        $temiz = trim($deger);

        foreach (['Y-m-d', 'd.m.Y', 'd/m/Y', 'd-m-Y', 'Ymd', 'm/d/Y'] as $bicim) {
            try {
                $t = Carbon::createFromFormat($bicim, $temiz);
            } catch (\Throwable) {
                continue;
            }

            // Biçim tutmadığında Carbon yine de bir tarih üretebiliyor;
            // geri yazdırıp aynı metni verdiğinden emin oluyoruz.
            if ($t && $t->format($bicim) === $temiz) {
                return $t->toDateString();
            }
        }

        try {
            return Carbon::parse($temiz)->toDateString();
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'file' => "Ekstredeki tarih okunamadı: $temiz",
            ]);
        }
    }

    /** Banka kimlik vermediyse satırdan türet; aynı satır iki kez girmesin. */
    private function deriveId(string $hesapId, array $satir): string
    {
        return 'auto:' . substr(hash('sha256', implode('|', [
            $hesapId,
            $satir['booking_date'],
            number_format((float) $satir['amount'], 2, '.', ''),
            $satir['remittance'] ?? '',
            $satir['counterparty_iban'] ?? '',
        ])), 0, 40);
    }
}
