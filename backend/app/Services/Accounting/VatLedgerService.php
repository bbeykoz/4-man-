<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\TaxTreatment;
use App\Models\Company;
use App\Support\AppTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * KDV satış ve alış defterleri.
 *
 * Defterler saklanmıyor, her istekte belgelerden türetiliyor. Ayrı bir defter
 * tablosu tutmak belgelerle ayrışma riski doğurur; tek doğruluk kaynağı
 * belgeler ve onların fişleri.
 *
 * Dönem belirleyici alan vergi tarihi (tax_date). Belge tarihi farklı
 * olabilir; vergiyi doğuran olay hangi aya düşüyorsa beyan o ay verilir.
 */
class VatLedgerService
{
    /** Deftere giren belge durumları. */
    private const DEFTER_DURUMLARI = ['posted', 'partially_settled', 'settled'];

    private const SATIS_TURLERI = ['sales_invoice', 'sales_credit_note', 'sales_debit_note', 'sales_advance'];
    private const ALIS_TURLERI  = ['purchase_invoice', 'purchase_credit_note', 'purchase_debit_note', 'purchase_advance', 'expense'];

    /**
     * Satış defteri.
     *
     * İade ve alacak dekontları negatif işaretle giriyor: beyanda ayrı satır
     * değil, matrahı azaltan düzeltme olarak görünmeli.
     */
    public function salesBook(Company $company, string $bas, string $bit): array
    {
        return $this->book($company, $bas, $bit, self::SATIS_TURLERI, 'sales');
    }

    public function purchaseBook(Company $company, string $bas, string $bit): array
    {
        return $this->book($company, $bas, $bit, self::ALIS_TURLERI, 'purchase');
    }

    private function book(Company $company, string $bas, string $bit, array $turler, string $defter): array
    {
        $satirlar = DB::table('document_lines as dl')
            ->join('documents as d', 'd.id', '=', 'dl.document_id')
            ->leftJoin('tax_codes as tc', 'tc.id', '=', 'dl.tax_code_id')
            ->leftJoin('business_partners as p', 'p.id', '=', 'd.partner_id')
            ->where('d.company_id', $company->id)
            ->whereIn('d.doc_type', $turler)
            ->whereIn('d.status', self::DEFTER_DURUMLARI)
            ->whereNull('d.deleted_at')
            // Vergi tarihi yoksa belge tarihi geçerli.
            ->whereRaw('COALESCE(d.tax_date, d.supply_date, d.issue_date) >= ?', [$bas])
            ->whereRaw('COALESCE(d.tax_date, d.supply_date, d.issue_date) <= ?', [$bit])
            ->orderByRaw('COALESCE(d.tax_date, d.supply_date, d.issue_date)')
            ->orderBy('d.number')
            ->orderBy('dl.line_no')
            ->get([
                'd.id as document_id', 'd.number', 'd.doc_type', 'd.issue_date',
                DB::raw('COALESCE(d.tax_date, d.supply_date, d.issue_date) AS tax_date'),
                'd.currency', 'd.exchange_rate',
                'd.partner_name', 'd.partner_vat_number', 'd.corrects_document_id',
                'p.country_code as partner_country', 'p.vat_registered as partner_vat_registered',
                'dl.line_no', 'dl.description', 'dl.net_amount', 'dl.tax_amount',
                'dl.non_deductible_amount', 'dl.tax_rate',
                'tc.code as tax_code', 'tc.treatment', 'tc.report_box',
                'tc.eu_reportable', 'tc.affects_vat_return',
            ]);

        $kayitlar = [];
        $kutular  = [];
        $toplam   = ['base' => 0.0, 'tax' => 0.0, 'non_deductible' => 0.0];
        $belgeler = [];

        foreach ($satirlar as $s) {
            // Beyana girmeyen kod (kapsam dışı) defterde görünür ama toplama katılmaz.
            $beyana = $s->affects_vat_return === null ? true : (bool) $s->affects_vat_return;

            $kur    = (float) ($s->exchange_rate ?: 1);
            $matrah = round((float) $s->net_amount * $kur, 2);
            $vergi  = round((float) $s->tax_amount * $kur, 2);
            $indirilemez = round((float) $s->non_deductible_amount * $kur, 2);

            // İade belgeleri matrahı azaltır.
            $isaret = in_array($s->doc_type, ['sales_credit_note', 'purchase_credit_note'], true) ? -1 : 1;
            $matrah *= $isaret;
            $vergi  *= $isaret;
            $indirilemez *= $isaret;

            $kayit = [
                'document_id'     => $s->document_id,
                'document_number' => $s->number,
                'doc_type'        => $s->doc_type,
                'line_no'         => $s->line_no,
                'issue_date'      => $s->issue_date,
                'tax_date'        => $s->tax_date,
                'partner_name'    => $s->partner_name,
                'partner_vat_number' => $s->partner_vat_number,
                'partner_country' => $s->partner_country,
                'description'     => $s->description,
                'tax_code'        => $s->tax_code,
                'treatment'       => $s->treatment,
                'treatment_label' => $s->treatment ? TaxTreatment::from($s->treatment)->label() : null,
                'report_box'      => $s->report_box,
                'tax_rate'        => (float) $s->tax_rate,
                'base'            => $matrah,
                'tax'             => $vergi,
                'non_deductible'  => $indirilemez,
                'deductible'      => round($vergi - $indirilemez, 2),
                'is_correction'   => $s->corrects_document_id !== null,
                'eu_reportable'   => (bool) $s->eu_reportable,
                'in_return'       => $beyana,
            ];

            $kayitlar[] = $kayit;
            $belgeler[$s->document_id] = true;

            if (! $beyana) {
                continue;
            }

            $toplam['base'] += $matrah;
            $toplam['tax']  += $vergi;
            $toplam['non_deductible'] += $indirilemez;

            $kutu = $s->report_box ?: 'UNMAPPED';
            $kutular[$kutu]['base'] = round(($kutular[$kutu]['base'] ?? 0) + $matrah, 2);
            $kutular[$kutu]['tax']  = round(($kutular[$kutu]['tax']  ?? 0) + $vergi, 2);
        }

        return [
            'book'      => $defter,
            'period'    => ['from' => $bas, 'to' => $bit],
            'lines'     => $kayitlar,
            'boxes'     => $kutular,
            'totals'    => array_map(fn ($v) => round($v, 2), $toplam) + [
                'deductible'     => round($toplam['tax'] - $toplam['non_deductible'], 2),
                'line_count'     => count($kayitlar),
                'document_count' => count($belgeler),
            ],
            'currency'     => $company->functionalCurrency(),
            'generated_at' => AppTime::now()->toIso8601String(),
        ];
    }

    /**
     * AB içi işlemler (VIES bildirimi).
     *
     * Karşı taraf bazında toplanıyor; bildirim cari başına verilir, belge
     * başına değil.
     */
    public function viesReport(Company $company, string $bas, string $bit): array
    {
        $satis = $this->salesBook($company, $bas, $bit);
        $alis  = $this->purchaseBook($company, $bas, $bit);

        $gruplar = [];

        foreach ([['sales', $satis], ['purchase', $alis]] as [$yon, $defter]) {
            foreach ($defter['lines'] as $s) {
                if (! $s['eu_reportable']) {
                    continue;
                }

                $anahtar = ($s['partner_vat_number'] ?: $s['partner_name'] ?: 'BILINMEYEN') . '|' . $yon;

                $gruplar[$anahtar] ??= [
                    'direction'   => $yon,
                    'partner_name'=> $s['partner_name'],
                    'vat_number'  => $s['partner_vat_number'],
                    'country'     => $s['partner_country'] ?? ($s['partner_vat_number'] ? substr($s['partner_vat_number'], 0, 2) : null),
                    'treatment'   => $s['treatment'],
                    'base'        => 0.0,
                    'document_count' => 0,
                    'issues'      => [],
                ];

                $gruplar[$anahtar]['base'] = round($gruplar[$anahtar]['base'] + $s['base'], 2);
                $gruplar[$anahtar]['document_count']++;
            }
        }

        // VIES bildiriminde KDV numarası zorunlu; eksikse bildirim reddedilir.
        foreach ($gruplar as &$g) {
            if (blank($g['vat_number'])) {
                $g['issues'][] = 'Karşı tarafın AB KDV numarası eksik; VIES bildirimi verilemez.';
            } elseif ($g['country'] && $g['country'] === $company->country_code) {
                $g['issues'][] = 'Karşı taraf yurt içi görünüyor ama AB işlemi olarak kodlanmış.';
            }
        }
        unset($g);

        $satirlar = array_values($gruplar);
        usort($satirlar, fn ($a, $b) => abs($b['base']) <=> abs($a['base']));

        return [
            'period'   => ['from' => $bas, 'to' => $bit],
            'entries'  => $satirlar,
            'totals'   => [
                'sales_base'    => round(array_sum(array_map(fn ($g) => $g['direction'] === 'sales' ? $g['base'] : 0, $satirlar)), 2),
                'purchase_base' => round(array_sum(array_map(fn ($g) => $g['direction'] === 'purchase' ? $g['base'] : 0, $satirlar)), 2),
                'partner_count' => count($satirlar),
            ],
            'issues'   => array_sum(array_map(fn ($g) => count($g['issues']), $satirlar)),
            'currency' => $company->functionalCurrency(),
        ];
    }

    /** Dönem anahtarından tarih aralığı: "2026-03" → [2026-03-01, 2026-03-31]. */
    public function periodRange(string $periodKey): array
    {
        $bas = Carbon::createFromFormat('Y-m-d', $periodKey . '-01')->startOfMonth();

        return [$bas->toDateString(), $bas->copy()->endOfMonth()->toDateString()];
    }

    /**
     * Beyan son tarihi.
     *
     * Bulgaristan'da genel kural takip eden ayın 14'ü; ülke paketinden okunuyor
     * ki başka ülke eklendiğinde kod değişmesin.
     */
    public function dueDate(Company $company, string $periodKey): string
    {
        $gun = (int) (\App\Support\CountryPack::setting($company->country_code, 'vat_return_due_day', 14));

        return Carbon::createFromFormat('Y-m-d', $periodKey . '-01')
            ->addMonth()->day($gun)->toDateString();
    }
}
