<?php

namespace App\Services\Stock;

use App\Models\WarehouseProduct;
use Illuminate\Support\Collection;

/**
 * What-if / senaryo simülasyonu: risk hesabını değiştirilmiş varsayımlarla (talep, tedarik süresi,
 * güvenlik stoğu) yeniden çalıştırıp mevcut durumla karşılaştırır. Hiçbir veriyi değiştirmez.
 */
class WhatIfService
{
    private const LEVEL_RANK = ['low' => 0, 'medium' => 1, 'high' => 2, 'critical' => 3];

    public function __construct(
        private readonly StockMetricsService $metrics,
        private readonly StockRiskService $risk,
    ) {}

    /**
     * @param array<int, array{name?: string, demand_change_pct?: float, lead_time_extra_days?: int,
     *   safety_change_pct?: float, supplier_id?: ?string, category?: ?string}> $scenarios
     */
    public function simulate(string $companyId, array $scenarios, ?string $warehouseId = null): array
    {
        $products = WarehouseProduct::forCompany($companyId)->active()
            ->with('defaultSupplier:id,name,default_lead_time_days')
            ->orderBy('name')->get();
        $metrics  = $this->metrics->forProducts($companyId, $warehouseId, $products->pluck('id')->all());

        $baseline = $products->mapWithKeys(fn(WarehouseProduct $p) => [$p->id => $this->risk->assess($p, $metrics[$p->id])]);

        return [
            'baseline'  => $this->summarize($baseline, $baseline),
            'scenarios' => collect($scenarios)->values()->map(function (array $s, int $i) use ($products, $metrics, $baseline) {
                $modifiers = [
                    'demand_factor'        => 1 + ((float) ($s['demand_change_pct'] ?? 0)) / 100,
                    'lead_time_extra_days' => (int) ($s['lead_time_extra_days'] ?? 0),
                    'safety_factor'        => 1 + ((float) ($s['safety_change_pct'] ?? 0)) / 100,
                ];

                $inScope = fn(WarehouseProduct $p) =>
                    (empty($s['supplier_id']) || $p->default_supplier_id === $s['supplier_id'])
                    && (empty($s['category']) || $p->category === $s['category']);

                $result = $products->mapWithKeys(fn(WarehouseProduct $p) => [
                    $p->id => $inScope($p) ? $this->risk->assess($p, $metrics[$p->id], $modifiers) : $baseline[$p->id],
                ]);

                return [
                    'name'        => $s['name'] ?? ('Senaryo ' . ($i + 1)),
                    'assumptions' => $this->describe($s),
                    'in_scope'    => $products->filter($inScope)->count(),
                    ...$this->summarize($result, $baseline),
                    'products'    => $this->impacts($result, $baseline),
                ];
            })->all(),
        ];
    }

    // ─── Özetler ────────────────────────────────────────────────────

    /** Senaryo sonucu: stok açığı, sipariş ihtiyacı, risk dağılımı ve mevcut duruma göre farklar. */
    private function summarize(Collection $rows, Collection $baseline): array
    {
        $shortfall = $rows->map(fn($r) => $this->shortfall($r));
        $affected  = $rows->filter(fn($r, $id) => $this->isWorse($r, $baseline[$id]))->count();

        $orderQty   = $rows->sum('suggested_order_qty');
        $orderValue = $rows->sum(fn($r) => $r['suggested_order_qty'] * ($r['unit_price'] ?? 0));
        $baseQty    = $baseline->sum('suggested_order_qty');
        $baseValue  = $baseline->sum(fn($r) => $r['suggested_order_qty'] * ($r['unit_price'] ?? 0));

        return [
            'affected_products'    => $affected,
            'shortfall_products'   => $shortfall->filter(fn($q) => $q > 0)->count(),
            'shortfall_qty'        => round($shortfall->sum(), 1),
            'shortfall_value'      => round($rows->sum(fn($r) => $this->shortfall($r) * ($r['unit_price'] ?? 0)), 2),
            'order_qty'            => round($orderQty, 1),
            'order_value'          => round($orderValue, 2),
            'order_qty_change'     => round($orderQty - $baseQty, 1),
            'order_value_change'   => round($orderValue - $baseValue, 2),
            'levels'               => collect(array_keys(self::LEVEL_RANK))->mapWithKeys(fn($l) => [$l => $rows->where('risk_level', $l)->count()]),
            'avg_risk'             => round($rows->avg('risk_score') ?? 0, 1),
            'avg_risk_change'      => round(($rows->avg('risk_score') ?? 0) - ($baseline->avg('risk_score') ?? 0), 1),
        ];
    }

    /** En çok etkilenen ürünler (risk artışı ve açığa göre). */
    private function impacts(Collection $rows, Collection $baseline): array
    {
        return $rows->map(function ($r, $id) use ($baseline) {
            $b = $baseline[$id];

            return [
                'product_id'        => $id,
                'name'              => $r['name'],
                'sku'               => $r['sku'],
                'unit'              => $r['unit'],
                'risk_before'       => $b['risk_score'],
                'risk_after'        => $r['risk_score'],
                'level_before'      => $b['risk_level'],
                'level_after'       => $r['risk_level'],
                'cover_before'      => $b['days_of_cover'],
                'cover_after'       => $r['days_of_cover'],
                'order_before'      => $b['suggested_order_qty'],
                'order_after'       => $r['suggested_order_qty'],
                'shortfall'         => round($this->shortfall($r), 1),
                'lead_time_after'   => $r['lead_time_days'],
                'daily_after'       => $r['daily_consumption'],
                'recommendation'    => $r['recommendation'],
                '_delta'            => ($r['risk_score'] - $b['risk_score']) + $this->shortfall($r) / max(1, $r['daily_consumption'] ?: 1),
            ];
        })
            ->filter(fn($p) => $p['risk_after'] !== $p['risk_before'] || $p['order_after'] !== $p['order_before'] || $p['shortfall'] > 0)
            ->sortByDesc('_delta')
            ->take(50)
            ->map(fn($p) => collect($p)->except('_delta')->all())
            ->values()
            ->all();
    }

    /** Tedarik süresi boyunca beklenen talebin eldeki + yoldaki stoğu aşan kısmı. */
    private function shortfall(array $r): float
    {
        return max(0, $r['daily_consumption'] * $r['lead_time_days'] - ($r['available'] + $r['on_order']));
    }

    private function isWorse(array $after, array $before): bool
    {
        return self::LEVEL_RANK[$after['risk_level']] > self::LEVEL_RANK[$before['risk_level']]
            || $this->shortfall($after) > $this->shortfall($before) + 0.5
            || $after['suggested_order_qty'] > $before['suggested_order_qty'];
    }

    private function describe(array $s): string
    {
        $parts = [];
        if ($d = (float) ($s['demand_change_pct'] ?? 0)) {
            $parts[] = 'talep ' . ($d > 0 ? '+' : '') . $d . '%';
        }
        if ($l = (int) ($s['lead_time_extra_days'] ?? 0)) {
            $parts[] = 'tedarik süresi ' . ($l > 0 ? '+' : '') . $l . ' gün';
        }
        if ($g = (float) ($s['safety_change_pct'] ?? 0)) {
            $parts[] = 'güvenlik stoğu ' . ($g > 0 ? '+' : '') . $g . '%';
        }

        return $parts ? implode(', ', $parts) : 'değişiklik yok';
    }
}
