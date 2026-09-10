<?php

namespace App\Services\Stock;

use App\Models\Modules\WarehouseRecord;
use App\Models\PurchaseOrder;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Depo performans KPI'ları: bu dönem (son N gün) ile önceki eşit uzunluktaki dönemin karşılaştırması,
 * değişimin nedenleri (en çok katkı yapan ürün / hareket tipi) ve aksiyon yorumu; depo bazında kıyas.
 */
class WarehouseKpiService
{
    private const COUNT_TOLERANCE_PCT = 2;

    public function __construct(
        private readonly StockRiskService $risk,
        private readonly ExpiryService $expiry,
    ) {}

    public function report(string $companyId, int $periodDays = 30, ?string $warehouseId = null): array
    {
        $today = Carbon::today();
        $cur   = [$today->copy()->subDays($periodDays - 1)->startOfDay(), $today->copy()->endOfDay()];
        $prev  = [$cur[0]->copy()->subDays($periodDays), $cur[0]->copy()->subSecond()];

        $c = $this->measure($companyId, $cur, $warehouseId, $periodDays);
        $p = $this->measure($companyId, $prev, $warehouseId, $periodDays);

        $riskNow   = $this->risk->assessCompany($companyId, $warehouseId);
        $riskPrev  = $this->snapshotRisky($companyId, $prev[1]);
        $expiryNow = $this->expiry->analyze($companyId, $warehouseId);

        // Yorum fonksiyonları: fn(?float $değişim, $bu_dönem) — önceki dönem yoksa değişim null
        $risky = $riskNow->whereIn('risk_level', ['critical', 'high']);
        $kpis = [
            $this->kpi('movements', 'Toplam stok hareketi', '', $c['movements'], $p['movements'], true,
                fn($d) => $d > 0 ? 'Hareket hacmi artıyor.' : ($d < 0 ? 'Hareket hacmi azalıyor.' : 'Hareket hacmi sabit.'),
                $this->typeDrivers($c['movements_by_type'], $p['movements_by_type'])),
            $this->kpi('critical_products', 'Kritik stoklu ürün', '', $risky->count(), $riskPrev, false,
                fn($d, $v) => $v > 0 && ($d === null || $d >= 0) ? 'Restock önceliği artırılmalı.' : ($v > 0 ? 'Kritik ürün sayısı azalıyor.' : 'Kritik stoklu ürün yok.'),
                $risky->sortByDesc('risk_score')->take(3)->map(fn($r) => "{$r['name']} (risk %{$r['risk_score']})")->values()->all()),
            $this->kpi('expiry_products', 'SKT riski taşıyan ürün', '', $expiryNow['products']->count(), null, false,
                fn($d, $v) => $v > 0 ? 'FEFO aksiyonları gözden geçirilmeli.' : 'SKT riski yok.',
                $expiryNow['products']->take(3)->pluck('headline')->all()),
            $this->kpi('damage_rate', 'Hasarlı ürün oranı', '%', $c['damage_rate'], $p['damage_rate'], false,
                fn($d, $v) => ($d ?? $v) > 0.2 ? 'Anomali analizi önerilir.' : ($d !== null && $d < -0.2 ? 'Hasar oranı düşüyor.' : 'Hasar oranı düşük ve stabil.'),
                $this->productDrivers($c['damage_by_product'], $p['damage_by_product'], 'hasar')),
            $this->kpi('return_rate', 'İade oranı', '%', $c['return_rate'], $p['return_rate'], false,
                fn($d, $v) => ($d ?? $v) > 0.5 ? 'İade nedenleri incelenmeli.' : 'İade oranı olağan.',
                $this->productDrivers($c['return_by_product'], $p['return_by_product'], 'iade')),
            $this->kpi('count_accuracy', 'Stok doğruluk oranı', '%', $c['count_accuracy'], $p['count_accuracy'], true,
                fn($d, $v) => $v < 95 && ($d === null || $d <= 0)
                    ? 'Sayım farkları yüksek; kayıp/kaçak ve kayıt disiplini incelenmeli.'
                    : ($d > 0 ? 'Sayım süreci iyileşiyor.' : 'Sayım doğruluğu yüksek.'),
                $c['count_worst']),
            $this->kpi('availability', 'Stok bulunurluğu', '%', $c['availability'], $p['availability'], true,
                fn($d, $v) => $v < 100 ? 'Talep gören bazı ürünler stoksuz kaldı; sipariş önerilerini kontrol edin.' : 'Talep gören ürünlerin tamamı stokta.',
                $c['stockouts']),
            $this->kpi('po_fill_rate', 'Satın alma karşılama oranı', '%', $c['po_fill_rate'], $p['po_fill_rate'], true,
                fn($d, $v) => $v < 95 ? 'Tedarikçi eksik teslimleri var; tedarikçi performansını inceleyin.' : 'Tedarikçi teslimleri tam.', []),
            $this->kpi('processing_hours', 'Çıkış işlem süresi', ' saat', $c['processing_hours'], $p['processing_hours'], false,
                fn($d) => match (true) {
                    $d === null => 'Kayıt açılışından stoğa işlenmesine kadar geçen ortalama süre.',
                    $d > 0      => 'Toplama/sevkiyat onayı yavaşlıyor.',
                    $d < 0      => 'İşlem süresi iyileşiyor.',
                    default     => 'İşlem süresi stabil.',
                }, $c['slowest']),
            $this->kpi('turnover', 'Stok devir hızı (yıllık)', '×', $c['turnover'], $p['turnover'], true,
                fn($d) => match (true) {
                    $d === null => 'Yıllık tüketim / ortalama stok.',
                    $d < 0      => 'Stok daha yavaş dönüyor; ölü/yavaş stok analizine bakın.',
                    $d > 0      => 'Stok devri hızlanıyor.',
                    default     => 'Stok devri stabil.',
                }, []),
        ];

        return [
            'period_days' => $periodDays,
            'current'     => ['from' => $cur[0]->toDateString(), 'to' => $cur[1]->toDateString()],
            'previous'    => ['from' => $prev[0]->toDateString(), 'to' => $prev[1]->toDateString()],
            'kpis'        => $kpis,
            'warehouses'  => $warehouseId ? [] : $this->byWarehouse($companyId, $cur, $periodDays),
        ];
    }

    // ─── Ölçüm ──────────────────────────────────────────────────────

    /** @param array{0: Carbon, 1: Carbon} $w */
    private function measure(string $companyId, array $w, ?string $warehouseId, int $days): array
    {
        [$from, $to] = $w;

        // Dönem, işlemin iş tarihine (transaction_date) göre; yoksa stoğa işlendiği gün
        $records = WarehouseRecord::where('company_id', $companyId)
            ->whereNotNull('product_id')->whereNotNull('posted_at')->whereNull('reversed_at')
            ->whereRaw('COALESCE(transaction_date, DATE(posted_at)) BETWEEN ? AND ?', [$from->toDateString(), $to->toDateString()])
            ->when($warehouseId, fn($q) => $q->where(fn($x) => $x->where('warehouse_id', $warehouseId)->orWhere('to_warehouse_id', $warehouseId)))
            ->get(['id', 'record_number', 'type', 'product_id', 'warehouse_id', 'quantity', 'system_quantity', 'created_at', 'posted_at', 'created_by']);

        $ledger = fn(string $type, ?string $bucket = null) => StockMovement::where('stock_movements.company_id', $companyId)
            ->join('warehouse_records', 'warehouse_records.id', '=', 'stock_movements.record_id')
            ->whereNull('warehouse_records.reversed_at')
            ->where('stock_movements.movement_type', $type)
            ->when($bucket, fn($q) => $q->where('stock_movements.bucket', $bucket))
            ->when($warehouseId, fn($q) => $q->where('stock_movements.warehouse_id', $warehouseId))
            ->whereBetween('stock_movements.occurred_at', [$from, $to]);

        $outflow  = (float) -$ledger('stock_out', StockMovement::BUCKET_AVAILABLE)->sum('stock_movements.quantity');
        $damage   = $ledger('damage', StockMovement::BUCKET_DAMAGED)->where('stock_movements.quantity', '>', 0)
            ->groupBy('stock_movements.product_id')->get(['stock_movements.product_id', DB::raw('SUM(stock_movements.quantity) as qty')])->pluck('qty', 'product_id')->map(fn($q) => (float) $q);
        $returns  = $ledger('return_in')->where('stock_movements.quantity', '>', 0)
            ->groupBy('stock_movements.product_id')->get(['stock_movements.product_id', DB::raw('SUM(stock_movements.quantity) as qty')])->pluck('qty', 'product_id')->map(fn($q) => (float) $q);

        // Sayım doğruluğu: tolerans içindeki sayımların oranı
        $counts = $records->where('type', 'stock_count')->filter(fn($r) => $r->system_quantity !== null)->map(fn($r) => [
            'record' => $r->record_number,
            'product_id' => $r->product_id,
            'pct'    => abs((float) $r->quantity - (float) $r->system_quantity) / max(1, (float) $r->system_quantity) * 100,
            'diff'   => (float) $r->quantity - (float) $r->system_quantity,
        ]);

        // İşlem süresi: çıkış kaydının açılmasından stoğa işlenmesine (saat)
        $outRecords = $records->whereIn('type', ['stock_out', 'transfer']);
        $hours      = $outRecords->map(fn($r) => max(0, $r->created_at->diffInMinutes($r->posted_at)) / 60);

        // Devir hızı: dönem tüketimi / ortalama stok (dönem başı ve sonu), yıllık
        $invStart = $this->inventoryAt($companyId, $from->copy()->subSecond(), $warehouseId);
        $invEnd   = $this->inventoryAt($companyId, $to, $warehouseId);
        $avgInv   = ($invStart->sum() + $invEnd->sum()) / 2;

        // Bulunurluk: dönemde talep gören ürünlerden dönem sonunda stoğu olanların oranı
        $demanded  = $ledger('stock_out', StockMovement::BUCKET_AVAILABLE)->distinct()->pluck('stock_movements.product_id');
        $inStock   = $demanded->filter(fn($id) => ($invEnd[$id] ?? 0) > 0.0005);
        $names     = WarehouseProduct::withTrashed()->whereIn('id', $demanded->merge($damage->keys())->merge($returns->keys())->merge($counts->pluck('product_id')))->pluck('name', 'id');

        // Satın alma karşılama: dönemde kapanan siparişlerde sağlam gelen / sipariş edilen
        $closedPos = PurchaseOrder::forCompany($companyId)->where('status', PurchaseOrder::STATUS_RECEIVED)
            ->when($warehouseId, fn($q) => $q->where('warehouse_id', $warehouseId))
            ->whereBetween('received_at', [$from, $to])->with('items')->get();
        $poOrdered = $closedPos->sum(fn($po) => $po->items->sum('quantity'));
        $poGood    = $closedPos->sum(fn($po) => $po->items->sum('received_qty'));

        $damageQty = $damage->sum();
        $returnQty = $returns->sum();

        return [
            'movements'          => $records->count(),
            'movements_by_type'  => $records->countBy('type')->all(),
            'damage_rate'        => $outflow + $damageQty > 0 ? round($damageQty / ($outflow + $damageQty) * 100, 2) : null,
            'damage_by_product'  => $damage->mapWithKeys(fn($q, $id) => [$names[$id] ?? $id => $q])->all(),
            'return_rate'        => $outflow > 0 ? round($returnQty / $outflow * 100, 2) : null,
            'return_by_product'  => $returns->mapWithKeys(fn($q, $id) => [$names[$id] ?? $id => $q])->all(),
            'count_accuracy'     => $counts->isNotEmpty() ? round($counts->filter(fn($c) => $c['pct'] <= self::COUNT_TOLERANCE_PCT)->count() / $counts->count() * 100, 1) : null,
            'count_worst'        => $counts->sortByDesc('pct')->take(3)->filter(fn($c) => $c['pct'] > self::COUNT_TOLERANCE_PCT)
                ->map(fn($c) => "{$c['record']} " . ($names[$c['product_id']] ?? '') . ': fark %' . $this->fmt($c['pct']))->values()->all(),
            'availability'       => $demanded->isNotEmpty() ? round($inStock->count() / $demanded->count() * 100, 1) : null,
            'stockouts'          => $demanded->diff($inStock)->take(5)->map(fn($id) => ($names[$id] ?? $id) . ': stok tükendi')->values()->all(),
            'po_fill_rate'       => $poOrdered > 0 ? round($poGood / $poOrdered * 100, 1) : null,
            'processing_hours'   => $hours->isNotEmpty() ? round($hours->avg(), 1) : null,
            'slowest'            => $outRecords->sortByDesc(fn($r) => $r->created_at->diffInMinutes($r->posted_at))->take(3)
                ->filter(fn($r) => $r->created_at->diffInMinutes($r->posted_at) >= 60)
                ->map(fn($r) => "{$r->record_number}: " . $this->fmt($r->created_at->diffInMinutes($r->posted_at) / 60) . ' saat')->values()->all(),
            'turnover'           => $avgInv > 0 ? round($outflow / $avgInv * (365 / $days), 2) : null,
        ];
    }

    /** Belirli andaki kullanılabilir stok (ürün bazında). */
    private function inventoryAt(string $companyId, Carbon $at, ?string $warehouseId): Collection
    {
        return StockMovement::where('company_id', $companyId)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->where('occurred_at', '<=', $at)
            ->when($warehouseId, fn($q) => $q->where('warehouse_id', $warehouseId))
            ->groupBy('product_id')
            ->get(['product_id', DB::raw('SUM(quantity) as qty')])
            ->pluck('qty', 'product_id')
            ->map(fn($q) => max(0, (float) $q));
    }

    /** Önceki dönem sonundaki risk anlık görüntüsünden kritik+yüksek ürün sayısı (yoksa null). */
    private function snapshotRisky(string $companyId, Carbon $at): ?int
    {
        $date = DB::table('stock_risk_snapshots')->where('company_id', $companyId)
            ->where('snapshot_date', '<=', $at->toDateString())->max('snapshot_date');

        return $date
            ? DB::table('stock_risk_snapshots')->where('company_id', $companyId)->where('snapshot_date', $date)
                ->whereIn('risk_level', ['critical', 'high'])->count()
            : null;
    }

    /** Depo bazında bu dönemin KPI'ları + doluluk. */
    private function byWarehouse(string $companyId, array $cur, int $days): array
    {
        $onHand = StockMovement::where('company_id', $companyId)
            ->whereIn('bucket', [StockMovement::BUCKET_AVAILABLE, StockMovement::BUCKET_QUARANTINE, StockMovement::BUCKET_DAMAGED])
            ->groupBy('warehouse_id')->get(['warehouse_id', DB::raw('SUM(quantity) as qty')])->pluck('qty', 'warehouse_id');

        return Warehouse::forCompany($companyId)->active()->orderByDesc('is_default')->orderBy('name')->get()
            ->map(function (Warehouse $w) use ($companyId, $cur, $days, $onHand) {
                $m = $this->measure($companyId, $cur, $w->id, $days);

                return [
                    'warehouse_id'     => $w->id,
                    'name'             => $w->name,
                    'movements'        => $m['movements'],
                    'count_accuracy'   => $m['count_accuracy'],
                    'availability'     => $m['availability'],
                    'processing_hours' => $m['processing_hours'],
                    'damage_rate'      => $m['damage_rate'],
                    'return_rate'      => $m['return_rate'],
                    'turnover'         => $m['turnover'],
                    'on_hand'          => round((float) ($onHand[$w->id] ?? 0), 3),
                    'capacity'         => $w->capacity,
                    'fill_rate'        => $w->capacity ? round((float) ($onHand[$w->id] ?? 0) / $w->capacity * 100, 1) : null,
                ];
            })->all();
    }

    // ─── KPI satırı ve nedenler ─────────────────────────────────────

    private function kpi(string $key, string $label, string $unit, int|float|null $current, int|float|null $previous, bool $higherIsBetter, \Closure $comment, array $drivers): array
    {
        $delta = $current !== null && $previous !== null ? round($current - $previous, 2) : null;
        $pct   = $delta !== null && $previous ? round($delta / abs($previous) * 100, 1) : null;
        $trend = $delta === null || abs($delta) < 0.0001 ? 'neutral' : (($delta > 0) === $higherIsBetter ? 'better' : 'worse');

        return [
            'key'              => $key,
            'label'            => $label,
            'unit'             => $unit,
            'current'          => $current,
            'previous'         => $previous,
            'change'           => $delta,
            'change_pct'       => $pct,
            // Oran KPI'larında değişim "puan" olarak okunur
            'change_is_points' => $unit === '%',
            'higher_is_better' => $higherIsBetter,
            'trend'            => $trend,
            'comment'          => $current === null ? 'Bu dönem ölçüm verisi yok.' : $comment($delta, $current),
            'drivers'          => array_values(array_filter($drivers)),
        ];
    }

    /** Hareket sayısı değişimine en çok katkı yapan hareket tipleri. */
    private function typeDrivers(array $cur, array $prev): array
    {
        $labels = ['stock_in' => 'giriş', 'stock_out' => 'çıkış', 'transfer' => 'transfer', 'adjustment' => 'düzeltme',
            'stock_count' => 'sayım', 'damage' => 'hasar', 'return_in' => 'iade girişi', 'inspection' => 'denetim'];

        return collect(array_unique([...array_keys($cur), ...array_keys($prev)]))
            ->map(fn($t) => ['type' => $t, 'delta' => ($cur[$t] ?? 0) - ($prev[$t] ?? 0), 'cur' => $cur[$t] ?? 0])
            ->filter(fn($x) => $x['delta'] !== 0)
            ->sortByDesc(fn($x) => abs($x['delta']))
            ->take(3)
            ->map(fn($x) => $this->ucfirstTr($labels[$x['type']] ?? $x['type']) . ': ' . ($x['delta'] > 0 ? '+' : '') . $x['delta'] . " (bu dönem {$x['cur']})")
            ->values()->all();
    }

    /** Hasar / iade değişimine en çok katkı yapan ürünler. */
    private function productDrivers(array $cur, array $prev, string $label): array
    {
        $total = array_sum($cur);
        if ($total <= 0) {
            return [];
        }

        return collect($cur)
            ->map(fn($q, $name) => ['name' => $name, 'qty' => $q, 'delta' => $q - ($prev[$name] ?? 0)])
            ->sortByDesc('delta')
            ->take(3)
            ->map(fn($x) => "{$x['name']}: {$this->fmt($x['qty'])} adet {$label} (toplamın %" . round($x['qty'] / $total * 100) . ')'
                . ($x['delta'] > 0 && isset($prev[$x['name']]) ? ", önceki döneme göre +{$this->fmt($x['delta'])}" : (!isset($prev[$x['name']]) ? ', önceki dönemde yoktu' : '')))
            ->values()->all();
    }

    private function ucfirstTr(string $s): string
    {
        $first = mb_substr($s, 0, 1);

        return ($first === 'i' ? 'İ' : mb_strtoupper($first)) . mb_substr($s, 1);
    }

    private function fmt(float $n): string
    {
        return rtrim(rtrim(number_format($n, 1, ',', '.'), '0'), ',');
    }
}
