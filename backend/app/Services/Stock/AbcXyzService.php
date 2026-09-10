<?php

namespace App\Services\Stock;

use App\Models\StockMovement;
use App\Models\WarehouseProduct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * ABC / XYZ analizi.
 * ABC: dönem tüketim değeri (miktar × çıkış anındaki birim maliyet), kümülatif pay %80 / %95 eşikleri.
 * XYZ: haftalık tüketimin değişkenlik katsayısı (CV) — X ≤ 0,5 < Y ≤ 1,0 < Z (talep yoksa Z).
 * Her sınıf için stok politikası ve hizmet seviyesine göre önerilen güvenlik stoğu.
 */
class AbcXyzService
{
    private const ABC_LIMITS = ['A' => 80, 'B' => 95];
    private const XYZ_LIMITS = ['X' => 0.5, 'Y' => 1.0];

    /** Hizmet seviyesi ve z değeri (normal dağılım) */
    private const SERVICE = ['A' => [98, 2.05], 'B' => [95, 1.65], 'C' => [90, 1.28]];

    public const POLICIES = [
        'AX' => ['priority' => 'Çok yüksek', 'count' => 'Haftalık döngüsel sayım', 'reorder' => 'Otomatik sipariş (sık gözden geçirme)', 'safety' => 'Düşük güvenlik stoğu yeterli: talep düzenli', 'note' => 'Yüksek öncelikli stok kontrolü; stoksuz kalmaya tolerans yok.'],
        'AY' => ['priority' => 'Yüksek', 'count' => 'Haftalık döngüsel sayım', 'reorder' => 'Otomatik sipariş, haftalık kontrol', 'safety' => 'Orta güvenlik stoğu', 'note' => 'Değerli ve dalgalı: tahmini sık güncelle, tedarikçiyle yakın takip.'],
        'AZ' => ['priority' => 'Yüksek', 'count' => 'Haftalık sayım', 'reorder' => 'Manuel onaylı sipariş / siparişe göre tedarik', 'safety' => 'Yüksek stok tutmak pahalı: siparişe bağlı alım', 'note' => 'Değerli ve düzensiz: büyük stok yerine talep geldikçe tedarik.'],
        'BX' => ['priority' => 'Orta', 'count' => 'Aylık sayım', 'reorder' => 'Otomatik sipariş', 'safety' => 'Düşük güvenlik stoğu', 'note' => 'Standart otomatik yenileme.'],
        'BY' => ['priority' => 'Orta', 'count' => 'Aylık sayım', 'reorder' => 'Otomatik sipariş, aylık kontrol', 'safety' => 'Orta güvenlik stoğu', 'note' => 'Standart yenileme, dalgalanmaya göre güvenlik stoğu.'],
        'BZ' => ['priority' => 'Orta', 'count' => 'Aylık sayım', 'reorder' => 'Manuel onaylı sipariş', 'safety' => 'Temkinli güvenlik stoğu', 'note' => 'Düzensiz talep: sipariş öncesi kontrol.'],
        'CX' => ['priority' => 'Düşük', 'count' => 'Üç aylık sayım', 'reorder' => 'Toplu / seyrek sipariş', 'safety' => 'Güvenlik stoğu bolca tutulabilir (ucuz)', 'note' => 'Düşük değerli ve düzenli: yönetim maliyetini düşür, toplu al.'],
        'CY' => ['priority' => 'Düşük', 'count' => 'Üç aylık sayım', 'reorder' => 'Seyrek sipariş', 'safety' => 'Orta güvenlik stoğu', 'note' => 'Düşük değerli: basit kurallarla yönet.'],
        'CZ' => ['priority' => 'Düşük', 'count' => 'Üç aylık sayım', 'reorder' => 'Temkinli satın alma: sadece talep üzerine', 'safety' => 'Minimum stok; fazla stok riski yüksek', 'note' => 'Düşük değerli ve düzensiz: fazla stok ve ölü stok riskine karşı temkinli satın alma.'],
    ];

    public function analyze(string $companyId, int $days = 90, ?string $warehouseId = null): array
    {
        $today    = Carbon::today();
        $from     = $today->copy()->subDays($days - 1);
        $weeks    = max(1, intdiv($days, 7));
        $products = WarehouseProduct::forCompany($companyId)->active()->with('defaultSupplier:id,default_lead_time_days')->get()->keyBy('id');

        // Günlük tüketim miktarı ve değeri (iptal edilmemiş çıkışlar)
        $daily = StockMovement::where('stock_movements.company_id', $companyId)
            ->join('warehouse_records', 'warehouse_records.id', '=', 'stock_movements.record_id')
            ->whereNull('warehouse_records.reversed_at')
            ->where('stock_movements.movement_type', 'stock_out')
            ->where('stock_movements.bucket', StockMovement::BUCKET_AVAILABLE)
            ->when($warehouseId, fn($q) => $q->where('stock_movements.warehouse_id', $warehouseId))
            ->where('stock_movements.occurred_at', '>=', $from)
            ->groupBy('stock_movements.product_id', DB::raw('DATE(stock_movements.occurred_at)'))
            ->get([
                'stock_movements.product_id',
                DB::raw('DATE(stock_movements.occurred_at) as day'),
                DB::raw('-SUM(stock_movements.quantity) as qty'),
                DB::raw('-SUM(stock_movements.quantity * COALESCE(stock_movements.unit_cost, 0)) as value'),
            ])
            ->groupBy('product_id');

        // Ürünün ilk hareketi: var olmadığı haftalar "sıfır talep" sayılıp değişkenliği şişirmesin
        $firstMove = StockMovement::where('company_id', $companyId)
            ->when($warehouseId, fn($q) => $q->where('warehouse_id', $warehouseId))
            ->groupBy('product_id')
            ->get(['product_id', DB::raw('MIN(occurred_at) as first_at')])
            ->pluck('first_at', 'product_id');

        $rows = $products->map(function (WarehouseProduct $p) use ($daily, $from, $today, $weeks, $days, $firstMove) {
            $series = collect($daily->get($p->id, []));
            $qty    = (float) $series->sum('qty');
            $value  = (float) $series->sum('value');
            if ($value <= 0 && $qty > 0) {
                $value = $qty * (float) ($p->unit_price ?? 0); // eski kayıtlarda maliyet yoksa güncel fiyat
            }

            // Haftalık seri: bugünden geriye, ürünün ilk hareketine kadar (sıfır haftalar dahil) → CV
            $first       = isset($firstMove[$p->id]) ? Carbon::parse($firstMove[$p->id])->startOfDay() : $today;
            $activeDays  = max(1, min($days, (int) $first->max($from)->diffInDays($today) + 1));
            $activeWeeks = max(1, min($weeks, intdiv($activeDays, 7)));
            $weekly      = array_fill(0, $activeWeeks, 0.0);
            foreach ($series as $r) {
                $idx = intdiv((int) Carbon::parse($r->day)->diffInDays($today), 7); // 0 = son 7 gün
                if ($idx < $activeWeeks) {
                    $weekly[$idx] += (float) $r->qty;
                }
            }
            $mean = array_sum($weekly) / $activeWeeks;
            $std  = sqrt(array_sum(array_map(fn($v) => ($v - $mean) ** 2, $weekly)) / $activeWeeks);
            $cv   = $mean > 0 ? $std / $mean : null;

            // Günlük sapma (güvenlik stoğu için): haftalık sapmadan türet
            $dailyStd = $std / sqrt(7);

            return [
                'product_id'     => $p->id,
                'name'           => $p->name,
                'sku'            => $p->sku,
                'unit'           => $p->unit ?: 'adet',
                'category'       => $p->category,
                'consumed_qty'   => round($qty, 3),
                'consumed_value' => round($value, 2),
                'weekly_mean'    => round($mean, 2),
                'weekly_std'     => round($std, 2),
                'cv'             => $cv !== null ? round($cv, 2) : null,
                'history_weeks'  => $activeWeeks,
                'insufficient_history' => $activeWeeks < 4,
                'daily_std'      => $dailyStd,
                'daily_mean'     => $qty / $activeDays,
                'lead_time'      => $p->lead_time_days ?? $p->defaultSupplier?->default_lead_time_days ?? (int) config('stock.default_lead_time_days', 7),
                'safety_stock'   => (float) ($p->safety_stock ?? 0),
            ];
        });

        // ABC: değere göre sırala, kümülatif pay
        $totalValue = $rows->sum('consumed_value');
        $cumulative = 0.0;
        $rows = $rows->sortByDesc('consumed_value')->values()->map(function ($r) use (&$cumulative, $totalValue) {
            $share       = $totalValue > 0 ? $r['consumed_value'] / $totalValue * 100 : 0;
            $prevCum     = $cumulative;
            $cumulative += $share;
            // Eşiği ilk aşan ürün, eşiğin içinde başladıysa üst sınıfta kalır
            $abc = $r['consumed_value'] <= 0 ? 'C' : ($prevCum < self::ABC_LIMITS['A'] ? 'A' : ($prevCum < self::ABC_LIMITS['B'] ? 'B' : 'C'));
            $xyz = $r['cv'] === null ? 'Z' : ($r['cv'] <= self::XYZ_LIMITS['X'] ? 'X' : ($r['cv'] <= self::XYZ_LIMITS['Y'] ? 'Y' : 'Z'));

            [$service, $z] = self::SERVICE[$abc];
            $recommended   = $r['daily_mean'] > 0 ? ceil($z * $r['daily_std'] * sqrt($r['lead_time'])) : 0.0;
            $class         = $abc . $xyz;

            return [
                ...collect($r)->except(['daily_std', 'daily_mean'])->all(),
                'value_share'        => round($share, 2),
                'cumulative_share'   => round($cumulative, 2),
                'abc'                => $abc,
                'xyz'                => $xyz,
                'class'              => $class,
                'service_level'      => $service,
                'recommended_safety' => $recommended,
                'safety_gap'         => round($recommended - $r['safety_stock'], 3),
                'policy'             => self::POLICIES[$class],
            ];
        });

        return [
            'days'      => $days,
            'rows'      => $rows,
            'matrix'    => $this->matrix($rows, $totalValue),
            'summary'   => [
                'products'    => $rows->count(),
                'total_value' => round($totalValue, 2),
                'a_share'     => round($rows->where('abc', 'A')->sum('value_share'), 1),
                'a_count'     => $rows->where('abc', 'A')->count(),
                'safety_gaps' => $rows->filter(fn($r) => abs($r['safety_gap']) >= 1)->count(),
            ],
            'policies'  => self::POLICIES,
            'limits'    => ['abc' => self::ABC_LIMITS, 'xyz' => self::XYZ_LIMITS, 'service' => collect(self::SERVICE)->map(fn($s) => $s[0])],
        ];
    }

    /** Önerilen güvenlik stoklarını ürün kartlarına yazar (kullanıcı onayıyla). */
    public function applySafetyStock(string $companyId, array $productIds, int $days = 90): int
    {
        $rows = $this->analyze($companyId, $days)['rows']->whereIn('product_id', $productIds);

        foreach ($rows as $r) {
            WarehouseProduct::forCompany($companyId)->whereKey($r['product_id'])
                ->update(['safety_stock' => $r['recommended_safety'] > 0 ? $r['recommended_safety'] : null]);
        }

        return $rows->count();
    }

    private function matrix(Collection $rows, float $totalValue): array
    {
        $cells = [];
        foreach (['A', 'B', 'C'] as $a) {
            foreach (['X', 'Y', 'Z'] as $x) {
                $in = $rows->where('class', $a . $x);
                $cells[$a . $x] = [
                    'count'       => $in->count(),
                    'value'       => round($in->sum('consumed_value'), 2),
                    'value_share' => $totalValue > 0 ? round($in->sum('consumed_value') / $totalValue * 100, 1) : 0,
                ];
            }
        }

        return $cells;
    }
}
