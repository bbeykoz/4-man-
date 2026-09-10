<?php

namespace App\Services\Stock;

use App\Models\WarehouseProduct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Hareket analizi: ürünleri hızlı / normal / yavaş / ölü (ve henüz verisi olmayan "yeni") olarak sınıflar,
 * bağlı sermayeyi ve fazla stoğu hesaplar, yeniden siparişin durdurulmasını önerir.
 */
class DeadStockService
{
    public function __construct(private readonly StockMetricsService $metrics) {}

    /** @return array{rows: Collection, summary: array, stop_reorder: array} */
    public function analyze(string $companyId, ?string $warehouseId = null): array
    {
        $cfg      = config('stock.movement_classes');
        $today    = Carbon::today();
        $products = WarehouseProduct::forCompany($companyId)->active()->orderBy('name')->get();
        $metrics  = $this->metrics->forProducts($companyId, $warehouseId, $products->pluck('id')->all());

        $rows = $products->map(function (WarehouseProduct $p) use ($metrics, $cfg, $today) {
            $m          = $metrics[$p->id];
            $available  = (float) $m['available'];
            $daily      = (float) $m['daily_consumption'];
            $lastOut    = $m['last_consumption_at'];
            $sinceOut   = $lastOut ? (int) Carbon::parse($lastOut)->diffInDays($today) : null;
            $daysSupply = $daily > 0 ? $available / $daily : null;
            $price      = $p->unit_price !== null ? (float) $p->unit_price : null;

            // Devir hızı (yıllık): son 90 gün tüketimi / eldeki stok × 4
            $turnover = $available > 0 ? round($m['consumed_long'] / $available * 4, 2) : null;

            $class = match (true) {
                $m['age_days'] > 0 && $m['age_days'] < $cfg['new_product_days'] => 'new',
                $available <= 0                                                  => 'no_stock',
                $m['consumed_long'] <= 0 || ($sinceOut !== null && $sinceOut >= $cfg['dead_no_consumption_days']) => 'dead',
                $m['consumed_mid'] <= 0 || ($daysSupply !== null && $daysSupply > $cfg['slow_min_days_of_supply']) => 'slow',
                $daysSupply !== null && $daysSupply <= $cfg['fast_max_days_of_supply'] => 'fast',
                default => 'normal',
            };

            $excess = in_array($class, ['dead', 'slow'], true)
                ? max(0, $available - $daily * $cfg['excess_cover_days'])
                : 0;

            return [
                'product_id'        => $p->id,
                'name'              => $p->name,
                'sku'               => $p->sku,
                'unit'              => $p->unit ?: 'adet',
                'available'         => round($available, 3),
                'consumed_30'       => $m['consumed_short'],
                'consumed_60'       => $m['consumed_mid'],
                'consumed_90'       => $m['consumed_long'],
                'daily_consumption' => round($daily, 3),
                'last_consumption_at' => $lastOut,
                'days_since_consumption' => $sinceOut,
                'days_of_supply'    => $daysSupply !== null ? round($daysSupply, 1) : null,
                'turnover'          => $turnover,
                'class'             => $class,
                'stock_value'       => $price !== null ? round($available * $price, 2) : null,
                'excess_qty'        => round($excess, 3),
                'excess_value'      => $price !== null ? round($excess * $price, 2) : null,
                'min_stock'         => $p->min_stock,
                'reorder_blocked'   => (bool) $p->reorder_blocked,
                'on_order'          => $m['on_order'],
                'recommendation'    => $this->recommend($class, $p, $excess, $sinceOut, $m['on_order']),
            ];
        });

        return [
            'rows'         => $rows->sortBy(fn($r) => [array_search($r['class'], ['dead', 'slow', 'normal', 'fast', 'new', 'no_stock']), -($r['stock_value'] ?? 0)])->values(),
            'summary'      => $this->summary($rows),
            'stop_reorder' => $this->stopReorder($rows),
        ];
    }

    /** Sipariş durdurma işareti (toplu). */
    public function setReorderBlocked(string $companyId, array $productIds, bool $blocked): int
    {
        return WarehouseProduct::forCompany($companyId)->whereIn('id', $productIds)->update([
            'reorder_blocked'    => $blocked,
            'reorder_blocked_at' => $blocked ? now() : null,
            'updated_at'         => now(),
        ]);
    }

    private function recommend(string $class, WarehouseProduct $p, float $excess, ?int $sinceOut, float $onOrder): string
    {
        $unit = $p->unit ?: 'adet';

        return match ($class) {
            'dead' => ($p->reorder_blocked ? 'Sipariş durduruldu. ' : 'Yeniden siparişi durdur. ')
                . ($sinceOut !== null ? "{$sinceOut} gündür çıkış yok; " : 'Hiç çıkış yok; ')
                . 'kampanya, iade veya tasfiye değerlendir.'
                . ($onOrder > 0 ? " Yolda {$onOrder} {$unit} sipariş var, iptal etmeyi düşün." : ''),
            'slow' => ($p->reorder_blocked ? 'Sipariş durduruldu. ' : 'Sipariş miktarını azalt. ')
                . ($excess > 0 ? "90 günlük ihtiyacın üstünde " . round($excess, 1) . " {$unit} fazla stok var." : 'Tüketim yavaş.'),
            'fast'     => 'Hızlı dönüyor; stok seviyesini ve tedarik süresini izle.',
            'normal'   => 'Normal devir.',
            'new'      => 'Yeni ürün; sınıflamak için yeterli geçmiş yok.',
            default    => 'Stok yok.',
        };
    }

    private function summary(Collection $rows): array
    {
        $classes = ['fast', 'normal', 'slow', 'dead', 'new', 'no_stock'];

        return [
            'counts'           => collect($classes)->mapWithKeys(fn($c) => [$c => $rows->where('class', $c)->count()]),
            'dead_value'       => round($rows->where('class', 'dead')->sum('stock_value'), 2),
            'slow_value'       => round($rows->where('class', 'slow')->sum('stock_value'), 2),
            'excess_value'     => round($rows->sum('excess_value'), 2),
            'total_value'      => round($rows->sum('stock_value'), 2),
        ];
    }

    /** "Bu N ürünün yeniden sipariş edilmesini durdur": ölü olup hâlâ sipariş alabilecek ürünler. */
    private function stopReorder(Collection $rows): array
    {
        $candidates = $rows->where('class', 'dead')->where('reorder_blocked', false)->values();

        return [
            'count'       => $candidates->count(),
            'product_ids' => $candidates->pluck('product_id')->all(),
            'names'       => $candidates->pluck('name')->take(10)->all(),
            'value'       => round($candidates->sum('stock_value'), 2),
            'message'     => $candidates->isEmpty()
                ? null
                : "Bu {$candidates->count()} ürünün yeniden sipariş edilmesini durdur: 90 gündür (veya hiç) çıkış yok.",
        ];
    }
}
