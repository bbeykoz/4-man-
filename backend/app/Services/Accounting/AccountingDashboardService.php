<?php

namespace App\Services\Accounting;

use App\Models\Company;
use App\Support\AccountRole;
use App\Support\AppTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Muhasebe özeti.
 *
 * Gelir ve gider rakamları doğrudan defterden geliyor, belgelerden değil:
 * elle girilen fişler, depo olayları ve kur farkları da sonuca giriyor.
 * Belge toplamları ayrı gösteriliyor çünkü ikisi farklı soruya cevap veriyor
 * ("ne kadar kazandık" ile "ne kadar fatura kestik" aynı şey değil).
 */
class AccountingDashboardService
{
    private const DEFTER = ['posted', 'reversed'];

    public function __construct(
        private readonly AccountRoleService $roles,
        private readonly VatLedgerService $vat,
        private readonly PartnerLedgerService $partners,
    ) {}

    /**
     * @param  array  $filtre  from, to (boş ise içinde bulunulan ay)
     */
    public function summary(Company $company, array $filtre = []): array
    {
        $bugun = AppTime::today();

        $bit = $this->tarih($filtre['to'] ?? null) ?? $bugun->toDateString();
        $bas = $this->tarih($filtre['from'] ?? null) ?? Carbon::parse($bit)->startOfMonth()->toDateString();

        return [
            'period'        => ['from' => $bas, 'to' => $bit, 'label' => $this->aralikEtiketi($bas, $bit)],
            'currency'      => $company->functionalCurrency(),
            'cash'          => $this->cashPosition($company, $bit),
            'income_expense'=> $this->incomeExpense($company, $bas, $bit),
            'quick_periods' => $this->quickPeriods($company, $bugun),
            'receivables'   => $this->receivablesPayables($company, $bit),
            'advances'      => $this->advances($company, $bit),
            'vat'           => $this->vatPosition($company, $bit),
            'documents'     => $this->documentStats($company, $bas, $bit),
            'trend'         => $this->monthlyTrend($company, $bit, 6),
            'pending'       => $this->pendingWork($company),
            'generated_at'  => AppTime::now()->toIso8601String(),
        ];
    }

    /** Güncel kasa ve banka durumu; hesap hesap ve toplam. */
    private function cashPosition(Company $company, string $tarih): array
    {
        $hesaplar = DB::table('bank_accounts')
            ->where('company_id', $company->id)
            ->where('is_active', true)
            ->orderBy('type')->orderBy('code')
            ->get(['id', 'code', 'name', 'type', 'currency', 'account_id', 'cash_limit']);

        $satirlar = [];
        $toplam = 0.0;
        $kasaToplam = 0.0;
        $bankaToplam = 0.0;

        foreach ($hesaplar as $h) {
            $bakiye = $this->accountBalance($h->account_id, $tarih);
            $toplam += $bakiye;

            if ($h->type === 'cash') {
                $kasaToplam += $bakiye;
            } else {
                $bankaToplam += $bakiye;
            }

            $satirlar[] = [
                'id'            => $h->id,
                'code'          => $h->code,
                'name'          => $h->name,
                'type'          => $h->type,
                'currency'      => $h->currency,
                'balance'       => $bakiye,
                'cash_limit'    => $h->cash_limit === null ? null : round((float) $h->cash_limit, 2),
                'exceeds_limit' => $h->type === 'cash' && $h->cash_limit !== null && $bakiye > (float) $h->cash_limit,
            ];
        }

        return [
            'accounts'      => $satirlar,
            'total'         => round($toplam, 2),
            'cash_total'    => round($kasaToplam, 2),
            'bank_total'    => round($bankaToplam, 2),
            'account_count' => count($satirlar),
        ];
    }

    /**
     * Seçilen aralıkta gelir, gider ve kâr.
     *
     * Gelir hesapları alacak bakiyeli, gider hesapları borç bakiyelidir; her
     * biri kendi olağan yönüne göre işaretli toplanıyor.
     */
    private function incomeExpense(Company $company, string $bas, string $bit): array
    {
        $satir = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
            ->where('l.company_id', $company->id)
            ->whereIn('e.status', self::DEFTER)
            ->whereDate('e.posting_date', '>=', $bas)
            ->whereDate('e.posting_date', '<=', $bit)
            ->whereIn('a.account_type', ['revenue', 'expense'])
            ->selectRaw("
                COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0) AS gelir,
                COALESCE(SUM(CASE WHEN a.account_type = 'expense' THEN l.debit - l.credit ELSE 0 END), 0) AS gider
            ")
            ->first();

        $gelir = round((float) ($satir->gelir ?? 0), 2);
        $gider = round((float) ($satir->gider ?? 0), 2);

        return [
            'income'       => $gelir,
            'expense'      => $gider,
            'profit'       => round($gelir - $gider, 2),
            'margin'       => $gelir > 0 ? round(($gelir - $gider) / $gelir * 100, 1) : null,
            'top_income'   => $this->topAccounts($company, $bas, $bit, 'revenue', 5),
            'top_expense'  => $this->topAccounts($company, $bas, $bit, 'expense', 5),
        ];
    }

    /** Hazır aralıklar: bu hafta, geçen hafta, bu ay, geçen ay, bu yıl. */
    private function quickPeriods(Company $company, Carbon $bugun): array
    {
        $araliklar = [
            'this_week'  => ['Bu hafta',  $bugun->copy()->startOfWeek()->toDateString(),              $bugun->copy()->endOfWeek()->toDateString()],
            'last_week'  => ['Geçen hafta', $bugun->copy()->subWeek()->startOfWeek()->toDateString(), $bugun->copy()->subWeek()->endOfWeek()->toDateString()],
            'this_month' => ['Bu ay',     $bugun->copy()->startOfMonth()->toDateString(),            $bugun->copy()->endOfMonth()->toDateString()],
            'last_month' => ['Geçen ay',  $bugun->copy()->subMonth()->startOfMonth()->toDateString(), $bugun->copy()->subMonth()->endOfMonth()->toDateString()],
            'this_year'  => ['Bu yıl',    $bugun->copy()->startOfYear()->toDateString(),             $bugun->copy()->endOfYear()->toDateString()],
        ];

        $sonuc = [];

        foreach ($araliklar as $anahtar => [$etiket, $bas, $bit]) {
            $v = $this->incomeExpenseRaw($company, $bas, $bit);

            $sonuc[$anahtar] = [
                'label'   => $etiket,
                'from'    => $bas,
                'to'      => $bit,
                'income'  => $v['income'],
                'expense' => $v['expense'],
                'profit'  => round($v['income'] - $v['expense'], 2),
            ];
        }

        return $sonuc;
    }

    /** Alacak ve borç durumu, vadesi geçenlerle birlikte. */
    private function receivablesPayables(Company $company, string $tarih): array
    {
        $satir = DB::table('documents')
            ->where('company_id', $company->id)
            ->whereIn('status', ['posted', 'partially_settled'])
            ->whereNull('deleted_at')
            ->whereDate('issue_date', '<=', $tarih)
            ->selectRaw("
                COALESCE(SUM(CASE WHEN doc_type LIKE 'sales%' THEN gross_amount_fc - (settled_amount * exchange_rate) ELSE 0 END), 0) AS alacak,
                COALESCE(SUM(CASE WHEN doc_type NOT LIKE 'sales%' THEN gross_amount_fc - (settled_amount * exchange_rate) ELSE 0 END), 0) AS borc,
                COALESCE(SUM(CASE WHEN doc_type LIKE 'sales%' AND due_date < ? THEN gross_amount_fc - (settled_amount * exchange_rate) ELSE 0 END), 0) AS gecikmis_alacak,
                COALESCE(SUM(CASE WHEN doc_type NOT LIKE 'sales%' AND due_date < ? THEN gross_amount_fc - (settled_amount * exchange_rate) ELSE 0 END), 0) AS gecikmis_borc,
                COUNT(*) FILTER (WHERE doc_type LIKE 'sales%') AS alacak_adet,
                COUNT(*) FILTER (WHERE doc_type NOT LIKE 'sales%') AS borc_adet
            ", [$tarih, $tarih])
            ->first();

        $yaslandirma = $this->partners->ageing($company, 'customer', $tarih);

        return [
            'receivable'          => round((float) ($satir->alacak ?? 0), 2),
            'payable'             => round((float) ($satir->borc ?? 0), 2),
            'net'                 => round((float) ($satir->alacak ?? 0) - (float) ($satir->borc ?? 0), 2),
            'overdue_receivable'  => round((float) ($satir->gecikmis_alacak ?? 0), 2),
            'overdue_payable'     => round((float) ($satir->gecikmis_borc ?? 0), 2),
            'open_sales_count'    => (int) ($satir->alacak_adet ?? 0),
            'open_purchase_count' => (int) ($satir->borc_adet ?? 0),
            'ageing'              => $yaslandirma['totals'],
            'ageing_buckets'      => $yaslandirma['buckets'],
            'top_overdue'         => collect($yaslandirma['partners'])
                ->filter(fn ($p) => $p['overdue_total'] > 0)
                ->sortByDesc('overdue_total')->take(5)->values()->all(),
        ];
    }

    /**
     * Avanslar: alınan ve verilen avans hesapları ile belgeye dağıtılmamış
     * tahsilat/ödemeler. İkisi farklı: biri defterde duruyor, diğeri
     * kapatılmayı bekliyor.
     */
    private function advances(Company $company, string $tarih): array
    {
        $bakiye = function (string $rol) use ($company, $tarih): float {
            $id = $this->roles->accountIdOrNull($company, $rol);

            return $id ? abs($this->accountBalance($id, $tarih)) : 0.0;
        };

        $dagitilmamis = DB::table('payments')
            ->where('company_id', $company->id)
            ->where('status', 'posted')
            ->whereNull('deleted_at')
            ->whereDate('payment_date', '<=', $tarih)
            ->selectRaw("
                COALESCE(SUM(CASE WHEN direction = 'in'  THEN (amount - allocated_amount) * exchange_rate ELSE 0 END), 0) AS gelen,
                COALESCE(SUM(CASE WHEN direction = 'out' THEN (amount - allocated_amount) * exchange_rate ELSE 0 END), 0) AS giden,
                COUNT(*) FILTER (WHERE amount > allocated_amount) AS adet
            ")
            ->first();

        return [
            'customer_advance'    => round($bakiye(AccountRole::CUSTOMER_ADVANCE), 2),
            'supplier_advance'    => round($bakiye(AccountRole::SUPPLIER_ADVANCE), 2),
            'unallocated_in'      => round((float) ($dagitilmamis->gelen ?? 0), 2),
            'unallocated_out'     => round((float) ($dagitilmamis->giden ?? 0), 2),
            'unallocated_count'   => (int) ($dagitilmamis->adet ?? 0),
        ];
    }

    /** KDV durumu: içinde bulunulan dönem ve son beyan. */
    private function vatPosition(Company $company, string $tarih): array
    {
        if (! $company->vat_registered) {
            return ['registered' => false];
        }

        $donem = Carbon::parse($tarih)->format('Y-m');
        [$bas, $bit] = $this->vat->periodRange($donem);

        $satis = $this->vat->salesBook($company, $bas, $bit);
        $alis  = $this->vat->purchaseBook($company, $bas, $bit);

        $hesaplanan  = round($satis['totals']['tax'], 2);
        $indirilecek = round($alis['totals']['deductible'], 2);

        $sonBeyan = DB::table('vat_returns')
            ->where('company_id', $company->id)
            ->orderByDesc('period_key')
            ->first(['period_key', 'status', 'net_payable', 'due_date']);

        return [
            'registered'      => true,
            'period'          => $donem,
            'output_tax'      => $hesaplanan,
            'input_tax'       => $indirilecek,
            'net_payable'     => round($hesaplanan - $indirilecek, 2),
            'sales_base'      => round($satis['totals']['base'], 2),
            'purchase_base'   => round($alis['totals']['base'], 2),
            'non_deductible'  => round($alis['totals']['non_deductible'], 2),
            'due_date'        => $this->vat->dueDate($company, $donem),
            'last_return'     => $sonBeyan ? [
                'period_key'  => $sonBeyan->period_key,
                'status'      => $sonBeyan->status,
                'net_payable' => round((float) $sonBeyan->net_payable, 2),
                'due_date'    => $sonBeyan->due_date,
            ] : null,
        ];
    }

    /** Belge sayıları ve tutarları. */
    private function documentStats(Company $company, string $bas, string $bit): array
    {
        $satirlar = DB::table('documents')
            ->where('company_id', $company->id)
            ->whereNull('deleted_at')
            ->whereDate('issue_date', '>=', $bas)
            ->whereDate('issue_date', '<=', $bit)
            ->groupBy('doc_type', 'status')
            ->get([
                'doc_type', 'status',
                DB::raw('COUNT(*) AS adet'),
                DB::raw('COALESCE(SUM(gross_amount_fc), 0) AS tutar'),
            ]);

        $satis = $alis = ['count' => 0, 'amount' => 0.0];
        $taslak = 0;

        foreach ($satirlar as $s) {
            $hedef = str_starts_with($s->doc_type, 'sales') ? 'satis' : 'alis';

            if (in_array($s->status, ['draft', 'issued'], true)) {
                $taslak += (int) $s->adet;
            }

            if (in_array($s->status, ['posted', 'partially_settled', 'settled'], true)) {
                if ($hedef === 'satis') {
                    $satis['count'] += (int) $s->adet;
                    $satis['amount'] += (float) $s->tutar;
                } else {
                    $alis['count'] += (int) $s->adet;
                    $alis['amount'] += (float) $s->tutar;
                }
            }
        }

        return [
            'sales'      => ['count' => $satis['count'], 'amount' => round($satis['amount'], 2)],
            'purchases'  => ['count' => $alis['count'],  'amount' => round($alis['amount'], 2)],
            'unposted'   => $taslak,
        ];
    }

    /** Son N ayın gelir/gider serisi; grafik bunu çiziyor. */
    private function monthlyTrend(Company $company, string $bit, int $ay): array
    {
        // Ayın BAŞINDAN geri sayılıyor. Sonundan saymak kısa aylarda kayıyor:
        // 31 Aralık'tan bir ay geri 1 Aralık'a düşüyor ve Kasım atlanıyor.
        $son  = Carbon::parse($bit)->startOfMonth();
        $seri = [];

        for ($i = $ay - 1; $i >= 0; $i--) {
            $a    = $son->copy()->subMonthsNoOverflow($i);
            $bas  = $a->copy()->startOfMonth()->toDateString();
            $son2 = $a->copy()->endOfMonth()->toDateString();

            $v = $this->incomeExpenseRaw($company, $bas, $son2);

            $seri[] = [
                'period'  => $a->format('Y-m'),
                'label'   => $this->ayKisa($a),
                'income'  => $v['income'],
                'expense' => $v['expense'],
                'profit'  => round($v['income'] - $v['expense'], 2),
            ];
        }

        return $seri;
    }

    /** Bekleyen işler; özet ekranındaki "yapılacaklar". */
    private function pendingWork(Company $company): array
    {
        $fis = DB::table('journal_entries')->where('company_id', $company->id)
            ->whereIn('status', ['draft', 'validated', 'pending_approval', 'approved'])->count();

        $belge = DB::table('documents')->where('company_id', $company->id)
            ->whereNull('deleted_at')->whereIn('status', ['draft', 'issued'])->count();

        $odeme = DB::table('payments')->where('company_id', $company->id)
            ->whereNull('deleted_at')->whereIn('status', ['draft', 'pending_approval', 'approved'])->count();

        $koprü = DB::table('inventory_accounting_events')->where('company_id', $company->id)
            ->whereIn('status', ['pending', 'exception', 'failed'])->count();

        $ekstre = DB::table('bank_transactions')->where('company_id', $company->id)
            ->whereIn('match_status', ['unmatched', 'suggested'])->count();

        $vergi = DB::table('tax_codes')->where('company_id', $company->id)
            ->where('approval_status', 'draft')->whereNull('deleted_at')->count();

        return [
            'journal_entries'     => $fis,
            'documents'           => $belge,
            'payments'            => $odeme,
            'inventory_events'    => $koprü,
            'bank_transactions'   => $ekstre,
            'unapproved_tax_codes'=> $vergi,
            'total'               => $fis + $belge + $odeme + $koprü + $ekstre + $vergi,
        ];
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /** @return array{income: float, expense: float} */
    private function incomeExpenseRaw(Company $company, string $bas, string $bit): array
    {
        $s = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
            ->where('l.company_id', $company->id)
            ->whereIn('e.status', self::DEFTER)
            ->whereDate('e.posting_date', '>=', $bas)
            ->whereDate('e.posting_date', '<=', $bit)
            ->whereIn('a.account_type', ['revenue', 'expense'])
            ->selectRaw("
                COALESCE(SUM(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0) AS gelir,
                COALESCE(SUM(CASE WHEN a.account_type = 'expense' THEN l.debit - l.credit ELSE 0 END), 0) AS gider
            ")
            ->first();

        return [
            'income'  => round((float) ($s->gelir ?? 0), 2),
            'expense' => round((float) ($s->gider ?? 0), 2),
        ];
    }

    /** En çok hareket gören gelir ya da gider hesapları. */
    private function topAccounts(Company $company, string $bas, string $bit, string $tur, int $limit): array
    {
        $yon = $tur === 'revenue' ? 'l.credit - l.debit' : 'l.debit - l.credit';

        return DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
            ->where('l.company_id', $company->id)
            ->whereIn('e.status', self::DEFTER)
            ->whereDate('e.posting_date', '>=', $bas)
            ->whereDate('e.posting_date', '<=', $bit)
            ->where('a.account_type', $tur)
            ->groupBy('a.id', 'a.code', 'a.name')
            ->havingRaw("SUM($yon) <> 0")
            ->orderByRaw("SUM($yon) DESC")
            ->limit($limit)
            ->get(['a.code', 'a.name', DB::raw("ROUND(SUM($yon), 2) AS tutar")])
            ->map(fn ($s) => ['code' => $s->code, 'name' => $s->name, 'amount' => (float) $s->tutar])
            ->all();
    }

    private function accountBalance(string $hesapId, string $tarih): float
    {
        $s = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->where('l.account_id', $hesapId)
            ->whereIn('e.status', self::DEFTER)
            ->whereDate('e.posting_date', '<=', $tarih)
            ->selectRaw('COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS b')
            ->first();

        return round((float) ($s->b ?? 0), 2);
    }

    private function tarih(?string $d): ?string
    {
        if (! $d) {
            return null;
        }

        try {
            return Carbon::parse($d)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    private function ayKisa(Carbon $t): string
    {
        $aylar = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

        return $aylar[$t->month - 1] . ' ' . $t->format('y');
    }

    private function aralikEtiketi(string $bas, string $bit): string
    {
        return Carbon::parse($bas)->format('d.m.Y') . ' – ' . Carbon::parse($bit)->format('d.m.Y');
    }
}
