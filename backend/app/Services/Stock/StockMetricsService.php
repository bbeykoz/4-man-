<?php

namespace App\Services\Stock;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\StockMovement;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Stok defterinden ürün bazında ham metrikler: kullanılabilir stok, tüketim hızı ve oynaklığı, FEFO lotları.
 * Risk skoru, satın alma önerisi, ölü stok ve what-if hesapları bu veriyi kullanır.
 *
 * Tüketim = iptal edilmemiş stok çıkışı kayıtlarının kullanılabilir stoktan düşen miktarı
 * (transfer, hasar, sayım farkı talep sayılmaz).
 */
class StockMetricsService
{
    /**
     * @param array<int, string>|null $productIds null → şirketin tüm ürünleri
     * @return Collection<string, array> product_id => metrikler
     */
    public function forProducts(string $companyId, ?string $warehouseId = null, ?array $productIds = null): Collection
    {
        $longWindow  = (int) config('stock.consumption_long_window', 90);
        $shortWindow = (int) config('stock.consumption_short_window', 30);
        $today       = Carbon::today();
        $since       = $today->copy()->subDays($longWindow - 1);

        $scope = fn($q) => $q
            ->where('stock_movements.company_id', $companyId)
            ->when($warehouseId, fn($q) => $q->where('stock_movements.warehouse_id', $warehouseId))
            ->when($productIds !== null, fn($q) => $q->whereIn('stock_movements.product_id', $productIds));

        $available = StockMovement::query()->tap($scope)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->groupBy('product_id')
            ->get(['product_id', DB::raw('SUM(quantity) as qty')])
            ->pluck('qty', 'product_id');

        $firstMovement = StockMovement::query()->tap($scope)
            ->groupBy('product_id')
            ->get(['product_id', DB::raw('MIN(occurred_at) as first_at')])
            ->pluck('first_at', 'product_id');

        // Günlük tüketim serisi (son uzun pencere)
        $daily = StockMovement::query()->tap($scope)
            ->join('warehouse_records', 'warehouse_records.id', '=', 'stock_movements.record_id')
            ->where('stock_movements.movement_type', 'stock_out')
            ->where('stock_movements.bucket', StockMovement::BUCKET_AVAILABLE)
            ->whereNull('warehouse_records.reversed_at')
            ->where('stock_movements.occurred_at', '>=', $since)
            ->groupBy('stock_movements.product_id', DB::raw('DATE(stock_movements.occurred_at)'))
            ->get([
                'stock_movements.product_id',
                DB::raw('DATE(stock_movements.occurred_at) as day'),
                DB::raw('-SUM(stock_movements.quantity) as qty'),
            ])
            ->groupBy('product_id');

        $lastOut = StockMovement::query()->tap($scope)
            ->join('warehouse_records', 'warehouse_records.id', '=', 'stock_movements.record_id')
            ->where('stock_movements.movement_type', 'stock_out')
            ->whereNull('warehouse_records.reversed_at')
            ->groupBy('stock_movements.product_id')
            ->get(['stock_movements.product_id', DB::raw('MAX(stock_movements.occurred_at) as last_at')])
            ->pluck('last_at', 'product_id');

        $lots = StockMovement::query()->tap($scope)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->groupBy('product_id', 'lot_number', 'expiry_date')
            ->havingRaw('SUM(quantity) > 0.0005')
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC')
            ->get(['product_id', 'lot_number', 'expiry_date', DB::raw('SUM(quantity) as qty')])
            ->groupBy('product_id');

        // Satın alma: tedarikçide bekleyen (gönderilmiş) ve henüz gönderilmemiş taslak miktarlar
        $pipeline = PurchaseOrderItem::query()
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->where('purchase_orders.company_id', $companyId)
            ->whereNull('purchase_orders.deleted_at')
            ->whereIn('purchase_orders.status', [...PurchaseOrder::OPEN_STATUSES, PurchaseOrder::STATUS_DRAFT])
            ->when($warehouseId, fn($q) => $q->where('purchase_orders.warehouse_id', $warehouseId))
            ->when($productIds !== null, fn($q) => $q->whereIn('purchase_order_items.product_id', $productIds))
            ->groupBy('purchase_order_items.product_id', 'purchase_orders.status')
            ->get([
                'purchase_order_items.product_id',
                'purchase_orders.status',
                DB::raw('SUM(GREATEST(purchase_order_items.quantity - purchase_order_items.received_qty - purchase_order_items.damaged_qty, 0)) as qty'),
                DB::raw('MIN(purchase_orders.expected_date) as next_expected'),
            ])
            ->groupBy('product_id');

        $ids = $productIds ?? $available->keys()->merge($firstMovement->keys())->unique()->values()->all();

        return collect($ids)->mapWithKeys(function (string $id) use (
            $available, $firstMovement, $daily, $lastOut, $lots, $pipeline, $today, $shortWindow, $longWindow
        ) {
            $po      = collect($pipeline->get($id, []));
            $open    = $po->whereIn('status', PurchaseOrder::OPEN_STATUSES);
            $onOrder = (float) $open->sum('qty');
            $inDraft = (float) $po->where('status', PurchaseOrder::STATUS_DRAFT)->sum('qty');
            $nextExp = $open->pluck('next_expected')->filter()->min();
            $first   = $firstMovement[$id] ?? null;
            $ageDays = $first ? max(1, (int) Carbon::parse($first)->startOfDay()->diffInDays($today) + 1) : 0;
            $series  = collect($daily->get($id, []))->mapWithKeys(fn($r) => [substr((string) $r->day, 0, 10) => (float) $r->qty]);

            $short = $this->windowStats($series, $today, $shortWindow, $ageDays);
            $mid   = $this->windowStats($series, $today, 60, $ageDays);
            $long  = $this->windowStats($series, $today, $longWindow, $ageDays);

            // Yeterli geçmiş varsa kısa ve uzun pencere harmanlanır
            $avg = $ageDays >= 60 ? 0.6 * $short['avg'] + 0.4 * $long['avg'] : $short['avg'];

            return [$id => [
                'available'          => round((float) ($available[$id] ?? 0), 3),
                'on_order'           => round($onOrder, 3),
                'in_draft'           => round($inDraft, 3),
                // Açık siparişin en erken beklenen teslimine kalan gün (geçmişse 0)
                'next_arrival_days'  => $onOrder > 0 && $nextExp
                    ? max(0, (int) $today->diffInDays(Carbon::parse($nextExp), false))
                    : null,
                'daily_consumption'  => round($avg, 3),
                'daily_std'          => round($short['std'], 3),
                'consumed_short'     => round($short['sum'], 3),
                'consumed_mid'       => round($mid['sum'], 3),
                'consumed_long'      => round($long['sum'], 3),
                'age_days'           => $ageDays,
                'first_movement_at'  => $first ? Carbon::parse($first)->toDateString() : null,
                'last_consumption_at'=> isset($lastOut[$id]) ? Carbon::parse($lastOut[$id])->toDateString() : null,
                'lots'               => collect($lots->get($id, []))->map(fn($l) => [
                    'lot_number'  => $l->lot_number,
                    'expiry_date' => $l->expiry_date ? substr((string) $l->expiry_date, 0, 10) : null,
                    'qty'         => round((float) $l->qty, 3),
                ])->values()->all(),
            ]];
        });
    }

    /** Pencere içindeki günlerin toplamı, ortalaması ve standart sapması (sıfır günler dahil). */
    private function windowStats(Collection $series, Carbon $today, int $window, int $ageDays): array
    {
        $minDays = (int) config('stock.min_consumption_days', 7);
        $days    = max($minDays, min($window, $ageDays ?: $window));

        $values = [];
        for ($i = 0; $i < $days; $i++) {
            $values[] = $series[$today->copy()->subDays($i)->toDateString()] ?? 0.0;
        }

        $sum  = array_sum($values);
        $avg  = $sum / $days;
        $var  = array_sum(array_map(fn($v) => ($v - $avg) ** 2, $values)) / $days;

        return ['sum' => $sum, 'avg' => $avg, 'std' => sqrt($var)];
    }
}
