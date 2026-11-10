<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\JournalStatus;
use App\Models\Accounting\BusinessPartner;
use App\Models\Company;
use App\Support\AccountRole;
use App\Support\AppTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Cari hesap defteri: bakiye, ekstre, açık kalemler ve yaşlandırma.
 *
 * Bakiye hiçbir yerde saklanmıyor; her zaman fiş satırlarından hesaplanıyor.
 * Cari kartında bir "bakiye" kolonu tutmak, defterle ayrışan ikinci bir
 * gerçek kaynağı yaratır ve mutabakatı imkânsızlaştırır.
 */
class PartnerLedgerService
{
    /** Yaşlandırma dilimleri (gün). Doküman §5.3: 0–30/31–60/61–90/90+. */
    private const DILIMLER = [30, 60, 90];

    private const DEFTER_DURUMLARI = [
        JournalStatus::Posted->value,
        JournalStatus::Reversed->value,
    ];

    public function __construct(private readonly AccountRoleService $roles) {}

    /**
     * Cari bakiyesine giren hesaplar.
     *
     * Fiş satırlarında cari etiketi gelir ve gider satırlarında da bulunuyor —
     * "hangi müşteriden ne kadar satış" analizi için gerekli. Ama bakiye
     * yalnız cari kontrol hesaplarından hesaplanmalı; yoksa satış faturasında
     * gelir satırı alacağı götürür ve bakiye 1200 yerine 200 görünür.
     *
     * Kontrol hesabı tanımı hesap planından geliyor (requires_partner), rol
     * eşlemesinden değil: şirket ek bir cari hesabı tanımlarsa o da sayılır.
     *
     * @return string[]
     */
    private function controlAccountIds(string $companyId): array
    {
        static $onbellek = [];

        return $onbellek[$companyId] ??= DB::table('chart_accounts')
            ->where('company_id', $companyId)
            ->where('requires_partner', true)
            ->whereNull('deleted_at')
            ->pluck('id')
            ->all();
    }

    /**
     * Carinin defter bakiyesi.
     *
     * Pozitif = bizden alacaklı değil, bize borçlu (müşteri); negatif = biz
     * borçluyuz (tedarikçi). İki rol birdeyse net bakiye döner, ayrıca
     * alacak ve borç ayrı ayrı verilir.
     */
    public function balance(BusinessPartner $cari, ?string $tarih = null): array
    {
        $bit = $tarih ?? AppTime::today()->toDateString();

        $satir = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->where('l.partner_id', $cari->id)
            ->whereIn('l.account_id', $this->controlAccountIds($cari->company_id))
            ->whereIn('e.status', self::DEFTER_DURUMLARI)
            ->whereDate('e.posting_date', '<=', $bit)
            ->selectRaw('COALESCE(SUM(l.debit),0) AS borc, COALESCE(SUM(l.credit),0) AS alacak')
            ->first();

        $borc   = round((float) ($satir->borc ?? 0), 2);
        $alacak = round((float) ($satir->alacak ?? 0), 2);

        return [
            'partner_id'   => $cari->id,
            'as_of'        => $bit,
            'debit_total'  => $borc,
            'credit_total' => $alacak,
            // Borç bakiye = müşteri bize borçlu. Alacak bakiye = biz borçluyuz.
            'balance'      => round($borc - $alacak, 2),
            'receivable'   => round(max($borc - $alacak, 0), 2),
            'payable'      => round(max($alacak - $borc, 0), 2),
            'currency'     => $cari->company->functionalCurrency(),
        ];
    }

    /**
     * Cari ekstresi: açılış, hareketler, yürüyen bakiye, kapanış.
     * Hesap ekstresinin cari bazlı karşılığı.
     */
    public function statement(BusinessPartner $cari, ?string $bas = null, ?string $bit = null): array
    {
        $bas ??= $cari->company->fiscalYearStart((int) AppTime::today()->format('Y'))->toDateString();
        $bit ??= AppTime::today()->toDateString();

        $acilis = $this->balanceBefore($cari, $bas);

        $hareketler = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
            ->leftJoin('documents as d', 'd.id', '=', 'e.document_id')
            ->where('l.partner_id', $cari->id)
            ->whereIn('l.account_id', $this->controlAccountIds($cari->company_id))
            ->whereIn('e.status', self::DEFTER_DURUMLARI)
            ->whereDate('e.posting_date', '>=', $bas)
            ->whereDate('e.posting_date', '<=', $bit)
            ->orderBy('e.posting_date')->orderBy('e.journal_no')->orderBy('l.line_no')
            ->get([
                'l.id', 'l.debit', 'l.credit', 'l.description',
                'e.journal_no', 'e.posting_date', 'e.description as entry_description', 'e.journal_type',
                'a.code as account_code', 'a.name as account_name',
                'd.id as document_id', 'd.number as document_number', 'd.doc_type', 'd.due_date',
            ]);

        $bakiye   = $acilis;
        $kayitlar = [];

        foreach ($hareketler as $h) {
            $bakiye += (float) $h->debit - (float) $h->credit;

            $kayitlar[] = [
                'date'            => $h->posting_date,
                'journal_no'      => $h->journal_no,
                'journal_type'    => $h->journal_type,
                'document_id'     => $h->document_id,
                'document_number' => $h->document_number,
                'doc_type'        => $h->doc_type,
                'due_date'        => $h->due_date,
                'account_code'    => $h->account_code,
                'account_name'    => $h->account_name,
                'description'     => $h->description ?: $h->entry_description,
                'debit'           => round((float) $h->debit, 2),
                'credit'          => round((float) $h->credit, 2),
                'running_balance' => round($bakiye, 2),
            ];
        }

        return [
            'partner' => [
                'id'         => $cari->id,
                'code'       => $cari->code,
                'name'       => $cari->displayName(),
                'legal_name' => $cari->legal_name,
                'vat_number' => $cari->vat_number,
            ],
            'period_start'    => $bas,
            'period_end'      => $bit,
            'opening_balance' => round($acilis, 2),
            'period_debit'    => round($hareketler->sum(fn ($h) => (float) $h->debit), 2),
            'period_credit'   => round($hareketler->sum(fn ($h) => (float) $h->credit), 2),
            'closing_balance' => round($bakiye, 2),
            'movements'       => $kayitlar,
            'currency'        => $cari->company->functionalCurrency(),
            'generated_at'    => AppTime::now()->toIso8601String(),
        ];
    }

    /**
     * Açık kalemler: deftere işlenmiş, tamamı kapanmamış belgeler.
     *
     * Belgenin kendi settled_amount alanı üzerinden hesaplanıyor; tahsilat
     * eşleştirmesi (Faz 6) bu alanı günceller.
     */
    public function openItems(BusinessPartner $cari, ?string $tarih = null): array
    {
        $bit = $tarih ?? AppTime::today()->toDateString();

        $belgeler = DB::table('documents')
            ->where('partner_id', $cari->id)
            ->whereIn('status', ['posted', 'partially_settled'])
            ->whereDate('issue_date', '<=', $bit)
            ->orderBy('due_date')->orderBy('issue_date')
            ->get(['id', 'doc_type', 'number', 'issue_date', 'due_date', 'currency',
                   'gross_amount', 'settled_amount']);

        return $belgeler->map(function ($b) use ($bit) {
            $kalan  = round((float) $b->gross_amount - (float) $b->settled_amount, 2);
            $gecikme = $b->due_date
                ? Carbon::parse($bit)->diffInDays(Carbon::parse($b->due_date), false) * -1
                : null;

            return [
                'document_id'     => $b->id,
                'doc_type'        => $b->doc_type,
                'number'          => $b->number,
                'issue_date'      => $b->issue_date,
                'due_date'        => $b->due_date,
                'currency'        => $b->currency,
                'gross_amount'    => round((float) $b->gross_amount, 2),
                'settled_amount'  => round((float) $b->settled_amount, 2),
                'outstanding'     => $kalan,
                'days_overdue'    => $gecikme !== null && $gecikme > 0 ? (int) $gecikme : 0,
                'is_overdue'      => $gecikme !== null && $gecikme > 0,
            ];
        })->filter(fn ($b) => $b['outstanding'] != 0.0)->values()->all();
    }

    /**
     * Yaşlandırma: vadesi geçmiş tutarların 0–30 / 31–60 / 61–90 / 90+ dağılımı.
     *
     * @param  string|null  $yon  'customer', 'supplier' ya da null (hepsi).
     */
    public function ageing(Company $company, ?string $yon = null, ?string $tarih = null): array
    {
        $bit = $tarih ?? AppTime::today()->toDateString();

        $sorgu = DB::table('documents as d')
            ->join('business_partners as p', 'p.id', '=', 'd.partner_id')
            ->where('d.company_id', $company->id)
            ->whereIn('d.status', ['posted', 'partially_settled'])
            ->whereDate('d.issue_date', '<=', $bit)
            ->when($yon === 'customer', fn ($q) => $q->where('p.is_customer', true)->whereIn('d.doc_type', $this->salesTypes()))
            ->when($yon === 'supplier', fn ($q) => $q->where('p.is_supplier', true)->whereIn('d.doc_type', $this->purchaseTypes()))
            ->get(['d.id', 'd.partner_id', 'd.doc_type', 'd.number', 'd.due_date',
                   'd.gross_amount', 'd.settled_amount', 'p.code as partner_code',
                   'p.legal_name', 'p.trade_name']);

        $gruplar = [];

        foreach ($sorgu as $b) {
            $kalan = round((float) $b->gross_amount - (float) $b->settled_amount, 2);

            if ($kalan == 0.0) {
                continue;
            }

            $gun = $b->due_date
                ? Carbon::parse($b->due_date)->diffInDays(Carbon::parse($bit), false)
                : 0;

            $dilim = $this->bucket($gun);

            $anahtar = $b->partner_id;
            $gruplar[$anahtar] ??= [
                'partner_id'   => $b->partner_id,
                'partner_code' => $b->partner_code,
                'partner_name' => $b->trade_name ?: $b->legal_name,
                'not_due'      => 0.0, 'd_0_30' => 0.0, 'd_31_60' => 0.0, 'd_61_90' => 0.0, 'd_90_plus' => 0.0,
                'total'        => 0.0, 'overdue_total' => 0.0, 'document_count' => 0,
            ];

            $gruplar[$anahtar][$dilim] += $kalan;
            $gruplar[$anahtar]['total'] += $kalan;
            $gruplar[$anahtar]['document_count']++;

            if ($dilim !== 'not_due') {
                $gruplar[$anahtar]['overdue_total'] += $kalan;
            }
        }

        $satirlar = array_map(
            fn (array $g) => array_map(fn ($v) => is_float($v) ? round($v, 2) : $v, $g),
            array_values($gruplar),
        );

        usort($satirlar, fn ($a, $b) => $b['total'] <=> $a['total']);

        $toplam = ['not_due' => 0.0, 'd_0_30' => 0.0, 'd_31_60' => 0.0, 'd_61_90' => 0.0, 'd_90_plus' => 0.0,
                   'total' => 0.0, 'overdue_total' => 0.0];

        foreach ($satirlar as $s) {
            foreach (array_keys($toplam) as $k) {
                $toplam[$k] += $s[$k];
            }
        }

        return [
            'direction'  => $yon ?? 'all',
            'as_of'      => $bit,
            'partners'   => $satirlar,
            'totals'     => array_map(fn ($v) => round($v, 2), $toplam),
            'currency'   => $company->functionalCurrency(),
            'buckets'    => ['not_due' => 'Vadesi gelmedi', 'd_0_30' => '0–30 gün', 'd_31_60' => '31–60 gün',
                             'd_61_90' => '61–90 gün', 'd_90_plus' => '90+ gün'],
            'generated_at' => AppTime::now()->toIso8601String(),
        ];
    }

    /**
     * Kredi limiti kontrolü.
     *
     * Açık alacaklar + yazılacak yeni tutar limiti aşıyor mu.
     */
    public function creditCheck(BusinessPartner $cari, float $yeniTutar = 0.0): array
    {
        $limit = $cari->credit_limit === null ? null : (float) $cari->credit_limit;
        $acik  = array_sum(array_map(
            fn (array $b) => in_array($b['doc_type'], $this->salesTypes(), true) ? $b['outstanding'] : 0.0,
            $this->openItems($cari),
        ));

        $toplam = round($acik + $yeniTutar, 2);

        return [
            'credit_limit'      => $limit,
            'open_receivable'   => round($acik, 2),
            'pending_amount'    => round($yeniTutar, 2),
            'projected_total'   => $toplam,
            'has_limit'         => $limit !== null,
            'exceeds_limit'     => $limit !== null && $toplam > $limit,
            'available'         => $limit === null ? null : round(max($limit - $acik, 0), 2),
            'currency'          => $cari->company->functionalCurrency(),
        ];
    }

    /**
     * Mahsup önerisi: carinin hem alacağı hem borcu varsa kapatılabilecek tutar.
     *
     * Hangi belgelerin kapatılacağını da verir; en eski vadeden başlar.
     */
    public function offsetProposal(BusinessPartner $cari): array
    {
        $acik = $this->openItems($cari);

        $alacaklar = array_values(array_filter($acik, fn ($b) => in_array($b['doc_type'], $this->salesTypes(), true) && $b['outstanding'] > 0));
        $borclar   = array_values(array_filter($acik, fn ($b) => in_array($b['doc_type'], $this->purchaseTypes(), true) && $b['outstanding'] > 0));

        $alacakToplam = round(array_sum(array_column($alacaklar, 'outstanding')), 2);
        $borcToplam   = round(array_sum(array_column($borclar, 'outstanding')), 2);
        $mahsup       = round(min($alacakToplam, $borcToplam), 2);

        return [
            'partner_id'       => $cari->id,
            'partner_name'     => $cari->displayName(),
            'receivable_total' => $alacakToplam,
            'payable_total'    => $borcToplam,
            'offsettable'      => $mahsup,
            'possible'         => $mahsup > 0,
            'receivables'      => $this->allocate($alacaklar, $mahsup),
            'payables'         => $this->allocate($borclar, $mahsup),
            'currency'         => $cari->company->functionalCurrency(),
        ];
    }

    // ─── İç yardımcılar ─────────────────────────────────────────────

    /** Tutarı belgelere en eski vadeden başlayarak dağıtır. */
    private function allocate(array $belgeler, float $tutar): array
    {
        $kalan  = $tutar;
        $sonuc  = [];

        foreach ($belgeler as $b) {
            if ($kalan <= 0) {
                break;
            }

            $uygulanan = round(min($b['outstanding'], $kalan), 2);
            $kalan     = round($kalan - $uygulanan, 2);

            $sonuc[] = $b + ['apply_amount' => $uygulanan];
        }

        return $sonuc;
    }

    private function balanceBefore(BusinessPartner $cari, string $tarih): float
    {
        $satir = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->where('l.partner_id', $cari->id)
            ->whereIn('l.account_id', $this->controlAccountIds($cari->company_id))
            ->whereIn('e.status', self::DEFTER_DURUMLARI)
            ->whereDate('e.posting_date', '<', $tarih)
            ->selectRaw('COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS bakiye')
            ->first();

        return round((float) ($satir->bakiye ?? 0), 2);
    }

    private function bucket(int $gecikmeGunu): string
    {
        if ($gecikmeGunu <= 0) {
            return 'not_due';
        }
        if ($gecikmeGunu <= self::DILIMLER[0]) {
            return 'd_0_30';
        }
        if ($gecikmeGunu <= self::DILIMLER[1]) {
            return 'd_31_60';
        }
        if ($gecikmeGunu <= self::DILIMLER[2]) {
            return 'd_61_90';
        }

        return 'd_90_plus';
    }

    private function salesTypes(): array
    {
        return ['sales_invoice', 'sales_credit_note', 'sales_debit_note', 'sales_advance'];
    }

    private function purchaseTypes(): array
    {
        return ['purchase_invoice', 'purchase_credit_note', 'purchase_debit_note', 'purchase_advance', 'expense'];
    }
}
