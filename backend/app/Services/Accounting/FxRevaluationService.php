<?php

namespace App\Services\Accounting;

use App\Models\Accounting\AccountingPeriod;
use App\Models\Company;
use App\Support\AccountRole;
use App\Support\AppTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Dönem sonu kur değerlemesi.
 *
 * Gerçekleşmemiş kur farkı: açık dövizli cari bakiyeleri ve banka hesapları
 * dönem sonu kuruyla yeniden değerlenir. Gerçekleşen kur farkından ayrı
 * süreç (doküman §3.1) — gerçekleşen tahsilat anında doğar ve kalıcıdır,
 * gerçekleşmemiş yalnız raporlama tarihindeki tahmindir.
 *
 * Bu yüzden değerleme fişi sonraki dönemin ilk günü ters çevrilir: taşınan
 * bir fark bir sonraki değerlemede ikinci kez sayılırdı.
 */
class FxRevaluationService
{
    public function __construct(
        private readonly ExchangeRateService $rates,
        private readonly AccountRoleService $roles,
        private readonly JournalService $journal,
        private readonly AuditService $audit,
    ) {}

    /**
     * Değerleme önizlemesi: fiş yazmadan ne olacağını gösterir.
     */
    public function preview(Company $company, string $tarih, ?string $paraBirimi = null): array
    {
        $paralar = $paraBirimi
            ? [strtoupper($paraBirimi)]
            : $this->rates->currenciesInUse($company);

        $sonuc = [];

        foreach ($paralar as $para) {
            $sonuc[] = $this->calculate($company, $tarih, $para);
        }

        return [
            'valuation_date' => $tarih,
            'currencies'     => $sonuc,
            'total_gain'     => round(array_sum(array_column($sonuc, 'gain')), 2),
            'total_loss'     => round(array_sum(array_column($sonuc, 'loss')), 2),
            'net_effect'     => round(array_sum(array_column($sonuc, 'net_effect')), 2),
            'book_currency'  => $company->functionalCurrency(),
            'generated_at'   => AppTime::now()->toIso8601String(),
        ];
    }

    /**
     * Tek para birimi için değerleme hesabı.
     *
     * Açık belgeler: belge kuruyla defterde duran tutar ile değerleme kurundaki
     * karşılığı arasındaki fark.
     */
    private function calculate(Company $company, string $tarih, string $para): array
    {
        $kur = $this->rates->resolve($company, $para, $tarih);

        // Kapanmamış dövizli belgeler.
        $belgeler = DB::table('documents')
            ->where('company_id', $company->id)
            ->where('currency', $para)
            ->whereIn('status', ['posted', 'partially_settled'])
            ->whereNull('deleted_at')
            ->whereDate('issue_date', '<=', $tarih)
            ->get(['id', 'number', 'doc_type', 'currency', 'exchange_rate',
                   'gross_amount', 'settled_amount', 'partner_id', 'partner_name']);

        $kalemler = [];
        $kazanc = $kayip = 0.0;

        foreach ($belgeler as $b) {
            $kalanDoviz = round((float) $b->gross_amount - (float) $b->settled_amount, 2);

            if (abs($kalanDoviz) < 0.01) {
                continue;
            }

            // Defterde duran değer: belge kuruyla çevrilmiş kalan.
            $defterdeki = round($kalanDoviz * (float) $b->exchange_rate, 2);
            // Değerleme tarihindeki karşılığı.
            $guncel     = round($kalanDoviz * $kur['rate'], 2);
            $fark       = round($guncel - $defterdeki, 2);

            if (abs($fark) < 0.01) {
                continue;
            }

            // Alacakta kur artışı kazanç, borçta kayıp. Yön belge türünden.
            $alacak = str_starts_with($b->doc_type, 'sales');
            $kazancMi = $alacak ? $fark > 0 : $fark < 0;

            if ($kazancMi) {
                $kazanc += abs($fark);
            } else {
                $kayip += abs($fark);
            }

            $kalemler[] = [
                'document_id'     => $b->id,
                'number'          => $b->number,
                'doc_type'        => $b->doc_type,
                // Cari kontrol hesabı cari kimliği istiyor; fiş satırına taşınmalı.
                'partner_id'      => $b->partner_id,
                'partner_name'    => $b->partner_name,
                'outstanding_fc'  => $kalanDoviz,
                'booked_value'    => $defterdeki,
                'current_value'   => $guncel,
                'difference'      => $fark,
                'is_gain'         => $kazancMi,
                'document_rate'   => (float) $b->exchange_rate,
            ];
        }

        // Dövizli banka hesapları.
        $hesaplar = DB::table('bank_accounts')
            ->where('company_id', $company->id)
            ->where('currency', $para)
            ->where('is_active', true)
            ->get(['id', 'code', 'name', 'account_id']);

        foreach ($hesaplar as $h) {
            $defterdeki = $this->accountBalance($h->account_id, $tarih);

            if (abs($defterdeki) < 0.01) {
                continue;
            }

            // Banka hesabının döviz bakiyesi fiş satırlarındaki txn tutarından.
            $dovizBakiye = $this->accountTxnBalance($h->account_id, $tarih);

            if (abs($dovizBakiye) < 0.01) {
                continue;
            }

            $guncel = round($dovizBakiye * $kur['rate'], 2);
            $fark   = round($guncel - $defterdeki, 2);

            if (abs($fark) < 0.01) {
                continue;
            }

            // Varlık hesabı: kur artışı kazanç.
            $kazancMi = $fark > 0;
            $kazancMi ? $kazanc += abs($fark) : $kayip += abs($fark);

            $kalemler[] = [
                'bank_account_id' => $h->id,
                'number'          => $h->code,
                'doc_type'        => 'bank_account',
                'partner_id'      => null,
                'partner_name'    => $h->name,
                'outstanding_fc'  => $dovizBakiye,
                'booked_value'    => $defterdeki,
                'current_value'   => $guncel,
                'difference'      => $fark,
                'is_gain'         => $kazancMi,
                'document_rate'   => null,
            ];
        }

        return [
            'currency'    => $para,
            'rate'        => $kur['rate'],
            'rate_source' => $kur['source'],
            'rate_date'   => $kur['rate_date'],
            'gain'        => round($kazanc, 2),
            'loss'        => round($kayip, 2),
            'net_effect'  => round($kazanc - $kayip, 2),
            'item_count'  => count($kalemler),
            'items'       => $kalemler,
        ];
    }

    /**
     * Değerlemeyi kaydeder ve fiş üretir.
     *
     * Aynı tarih ve para için ikinci kez çalıştırılamaz; önce eskisi silinmeli.
     */
    public function run(Company $company, string $tarih, string $para): array
    {
        $donem = AccountingPeriod::where('company_id', $company->id)->covering($tarih)->first();

        if (! $donem) {
            throw ValidationException::withMessages([
                'valuation_date' => "$tarih tarihini kapsayan muhasebe dönemi tanımlı değil.",
            ]);
        }

        $varMi = DB::table('fx_revaluations')
            ->where('company_id', $company->id)
            ->whereDate('valuation_date', $tarih)
            ->where('currency', strtoupper($para))
            ->exists();

        if ($varMi) {
            throw ValidationException::withMessages([
                'currency' => strtoupper($para) . " için $tarih tarihli değerleme zaten yapılmış.",
            ]);
        }

        $hesap = $this->calculate($company, $tarih, strtoupper($para));

        if ($hesap['item_count'] === 0 || abs($hesap['net_effect']) < 0.01) {
            throw ValidationException::withMessages([
                'currency' => strtoupper($para) . ' için değerlenecek açık bakiye yok ya da fark sıfır.',
            ]);
        }

        return DB::transaction(function () use ($company, $tarih, $para, $hesap) {
            $fisId = $this->postRevaluation($company, $tarih, $hesap);

            $id = (string) Str::uuid();

            DB::table('fx_revaluations')->insert([
                'id'               => $id,
                'company_id'       => $company->id,
                'valuation_date'   => $tarih,
                'currency'         => strtoupper($para),
                'rate_used'        => $hesap['rate'],
                'rate_source'      => $hesap['rate_source'],
                'gain'             => $hesap['gain'],
                'loss'             => $hesap['loss'],
                'net_effect'       => $hesap['net_effect'],
                'item_count'       => $hesap['item_count'],
                'detail'           => json_encode($hesap['items'], JSON_UNESCAPED_UNICODE),
                'journal_entry_id' => $fisId,
                'created_by'       => auth()->id(),
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            $this->audit->log(
                companyId: $company->id, action: 'fx.revaluation_posted',
                entityType: 'FxRevaluation', entityId: $id,
                payload: ['currency' => strtoupper($para), 'date' => $tarih,
                          'net_effect' => $hesap['net_effect'], 'items' => $hesap['item_count']],
            );

            return ['id' => $id, 'journal_entry_id' => $fisId] + $hesap;
        });
    }

    /**
     * Değerleme fişini sonraki dönem başında ters çevirir.
     *
     * Gerçekleşmemiş fark taşınmaz; aksi halde bir sonraki değerleme aynı farkı
     * ikinci kez yazar.
     */
    public function reverseNextPeriod(Company $company, string $revaluationId): string
    {
        $kayit = DB::table('fx_revaluations')
            ->where('id', $revaluationId)->where('company_id', $company->id)->first();

        if (! $kayit) {
            throw ValidationException::withMessages(['revaluation' => 'Değerleme bulunamadı.']);
        }

        if ($kayit->reversal_entry_id) {
            throw ValidationException::withMessages(['revaluation' => 'Bu değerleme zaten ters çevrilmiş.']);
        }

        if (! $kayit->journal_entry_id) {
            throw ValidationException::withMessages(['revaluation' => 'Değerlemenin fişi yok.']);
        }

        $ertesiGun = Carbon::parse($kayit->valuation_date)->addDay()->toDateString();

        $fis = \App\Models\Accounting\JournalEntry::findOrFail($kayit->journal_entry_id);

        $ters = $this->journal->reverse(
            $fis,
            'Dönem sonu kur değerlemesinin ters kaydı; gerçekleşmemiş fark sonraki döneme taşınmaz.',
            $ertesiGun,
        );

        DB::table('fx_revaluations')->where('id', $revaluationId)
            ->update(['reversal_entry_id' => $ters->id, 'updated_at' => now()]);

        return $ters->id;
    }

    /** Geçmiş değerlemeler. */
    public function history(Company $company, int $limit = 24): array
    {
        return DB::table('fx_revaluations')
            ->where('company_id', $company->id)
            ->orderByDesc('valuation_date')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => [
                'id'                => $r->id,
                'valuation_date'    => $r->valuation_date,
                'currency'          => $r->currency,
                'rate_used'         => (float) $r->rate_used,
                'rate_source'       => $r->rate_source,
                'gain'              => round((float) $r->gain, 2),
                'loss'              => round((float) $r->loss, 2),
                'net_effect'        => round((float) $r->net_effect, 2),
                'item_count'        => (int) $r->item_count,
                'journal_entry_id'  => $r->journal_entry_id,
                'reversal_entry_id' => $r->reversal_entry_id,
                'is_reversed'       => $r->reversal_entry_id !== null,
            ])->all();
    }

    /**
     * Değerleme fişi.
     *
     * Kazanç: ilgili bakiye hesabı borç, kur farkı geliri alacak.
     * Kayıp: kur farkı gideri borç, bakiye hesabı alacak.
     *
     * Bakiye tarafı kalemin türüne göre cari kontrol ya da banka hesabı.
     */
    private function postRevaluation(Company $company, string $tarih, array $hesap): string
    {
        $satirlar = [];

        foreach ($hesap['items'] as $k) {
            $hesapId = isset($k['bank_account_id'])
                ? DB::table('bank_accounts')->where('id', $k['bank_account_id'])->value('account_id')
                : $this->roles->accountId(
                    $company,
                    str_starts_with($k['doc_type'], 'sales') ? AccountRole::AR_CONTROL : AccountRole::AP_CONTROL,
                );

            $fark   = (float) $k['difference'];
            $mutlak = abs($fark);

            // Bakiye hesabının yönü: farkın işareti belirler.
            $satirlar[] = [
                'account_id'  => $hesapId,
                'description' => "Kur değerlemesi — {$k['number']}",
                'debit'       => $fark > 0 ? $mutlak : 0.0,
                'credit'      => $fark < 0 ? $mutlak : 0.0,
                'partner_id'  => $k['partner_id'] ?? null,
            ];
        }

        // Karşı taraf: toplam etkinin işaretine göre kur farkı geliri ya da gideri.
        $borc   = round(array_sum(array_column($satirlar, 'debit')), 2);
        $alacak = round(array_sum(array_column($satirlar, 'credit')), 2);
        $net    = round($borc - $alacak, 2);

        if (abs($net) >= 0.01) {
            $satirlar[] = [
                'account_id'  => $this->roles->accountId($company, $net > 0 ? AccountRole::FX_GAIN : AccountRole::FX_LOSS),
                'description' => $net > 0 ? 'Gerçekleşmemiş kur farkı geliri' : 'Gerçekleşmemiş kur farkı gideri',
                'debit'       => $net < 0 ? abs($net) : 0.0,
                'credit'      => $net > 0 ? $net : 0.0,
            ];
        }

        $fis = $this->journal->createDraft($company, [
            'journal_type' => 'fx',
            'posting_date' => $tarih,
            'description'  => "Dönem sonu kur değerlemesi — {$hesap['currency']} ({$hesap['rate']})",
            'reference'    => "FX-{$hesap['currency']}-{$tarih}",
            'source_type'  => 'FX_REVALUATION',
            'memo'         => "Gerçekleşmemiş kur farkı. Kur kaynağı: {$hesap['rate_source']}, tarih {$hesap['rate_date']}.",
        ], $satirlar);

        $fis = $fis->fresh();
        $fis->load('lines.account');
        $fis->forceFill(['status' => 'approved', 'approved_by' => auth()->id(),
                         'approved_at' => now(), 'content_hash' => $fis->computeContentHash()])->save();

        return $this->journal->post($fis->fresh())->id;
    }

    /** Hesabın defter para birimindeki bakiyesi. */
    private function accountBalance(string $hesapId, string $tarih): float
    {
        $s = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->where('l.account_id', $hesapId)
            ->whereIn('e.status', ['posted', 'reversed'])
            ->whereDate('e.posting_date', '<=', $tarih)
            ->selectRaw('COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS b')
            ->first();

        return round((float) ($s->b ?? 0), 2);
    }

    /** Hesabın işlem para birimindeki bakiyesi. */
    private function accountTxnBalance(string $hesapId, string $tarih): float
    {
        $s = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->where('l.account_id', $hesapId)
            ->whereNotNull('l.txn_currency')
            ->whereIn('e.status', ['posted', 'reversed'])
            ->whereDate('e.posting_date', '<=', $tarih)
            ->selectRaw('COALESCE(SUM(COALESCE(l.txn_debit,0)) - SUM(COALESCE(l.txn_credit,0)), 0) AS b')
            ->first();

        return round((float) ($s->b ?? 0), 2);
    }
}
