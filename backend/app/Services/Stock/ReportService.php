<?php

namespace App\Services\Stock;

use App\Models\PurchaseOrder;
use App\Models\StockAnomaly;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Raporlama katmanı: dashboard grafik verisi (belgedeki 5 grafik) ve Excel dışa aktarmalar.
 * Mevcut analiz servislerini kullanır; kendi hesabı yoktur.
 */
class ReportService
{
    public const EXPORTS = [
        'balances'        => 'Stok durumu (ürün × depo)',
        'lots'            => 'Lot / SKT listesi',
        'movements'       => 'Stok hareket defteri',
        'risk'            => 'Stok risk skoru',
        'expiry'          => 'SKT / FEFO riskleri',
        'dead_stock'      => 'Hareket analizi (ölü stok)',
        'abc_xyz'         => 'ABC / XYZ sınıfları',
        'transfers'       => 'Depo transfer önerileri',
        'purchase_orders' => 'Satın alma siparişleri',
        'suppliers'       => 'Tedarikçi performansı',
        'kpis'            => 'Depo KPI',
        'anomalies'       => 'Stok anomalileri',
    ];

    private const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    private const BUCKET_TR = ['available' => 'Kullanılabilir', 'reserved' => 'Rezerve', 'quarantine' => 'Karantina', 'damaged' => 'Hasarlı'];

    public function __construct(
        private readonly StockRiskService $risk,
        private readonly ExpiryService $expiry,
        private readonly DeadStockService $dead,
        private readonly AbcXyzService $abc,
        private readonly TransferSuggestionService $transfers,
        private readonly SupplierPerformanceService $suppliers,
        private readonly WarehouseKpiService $kpis,
    ) {}

    // ─── Grafik verisi ──────────────────────────────────────────────

    public function overview(string $companyId, int $months = 6, ?string $warehouseId = null): array
    {
        return [
            'monthly_volume'      => $this->monthlyVolume($companyId, $months, $warehouseId),
            'risk_trend'          => $this->riskTrend($companyId),
            'status_distribution' => $this->statusDistribution($companyId, $warehouseId),
            'warehouse_stock'     => $this->warehouseStock($companyId),
            'supplier_delay'      => collect($this->suppliers->analyze($companyId, 180)['suppliers'])
                ->map(fn($s) => ['name' => $s['name'], 'avg_delay_days' => $s['avg_delay_days'], 'on_time_rate' => $s['on_time_rate'], 'orders' => $s['orders']])
                ->values()->all(),
        ];
    }

    /** Grafik 1: aylık işlem hacmi (stoğa işlenmiş hareket sayısı, giriş / çıkış miktarı). */
    private function monthlyVolume(string $companyId, int $months, ?string $warehouseId): array
    {
        $start = Carbon::today()->startOfMonth()->subMonths($months - 1);

        $counts = DB::table('warehouse_records')
            ->where('company_id', $companyId)
            ->whereNotNull('product_id')->whereNotNull('posted_at')->whereNull('reversed_at')->whereNull('deleted_at')
            ->when($warehouseId, fn($q) => $q->where(fn($x) => $x->where('warehouse_id', $warehouseId)->orWhere('to_warehouse_id', $warehouseId)))
            ->whereRaw('COALESCE(transaction_date, DATE(posted_at)) >= ?', [$start->toDateString()])
            ->groupBy(DB::raw("to_char(COALESCE(transaction_date, DATE(posted_at)), 'YYYY-MM')"))
            ->get([DB::raw("to_char(COALESCE(transaction_date, DATE(posted_at)), 'YYYY-MM') as ym"), DB::raw('COUNT(*) as n')])
            ->pluck('n', 'ym');

        $qty = StockMovement::where('company_id', $companyId)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->when($warehouseId, fn($q) => $q->where('warehouse_id', $warehouseId))
            ->whereIn('movement_type', ['stock_in', 'return_in', 'qc_release', 'opening', 'stock_out'])
            ->where('occurred_at', '>=', $start)
            ->groupBy(DB::raw("to_char(occurred_at, 'YYYY-MM')"), 'movement_type')
            ->get([DB::raw("to_char(occurred_at, 'YYYY-MM') as ym"), 'movement_type', DB::raw('SUM(quantity) as qty')])
            ->groupBy('ym');

        return collect(range(0, $months - 1))->map(function ($i) use ($start, $counts, $qty) {
            $month = $start->copy()->addMonths($i);
            $ym    = $month->format('Y-m');
            $rows  = collect($qty->get($ym, []));

            return [
                'month'     => $ym,
                'label'     => self::MONTHS_TR[$month->month - 1] . ($month->month === 1 || $i === 0 ? ' ' . $month->format('y') : ''),
                'movements' => (int) ($counts[$ym] ?? 0),
                'in_qty'    => round((float) $rows->whereIn('movement_type', ['stock_in', 'return_in', 'qc_release', 'opening'])->sum('qty'), 1),
                'out_qty'   => round((float) -$rows->where('movement_type', 'stock_out')->sum('qty'), 1),
            ];
        })->all();
    }

    /** Grafik 2: riskli (kritik + yüksek) ürün oranı, günlük anlık görüntülerden. */
    private function riskTrend(string $companyId): array
    {
        return DB::table('stock_risk_snapshots')
            ->where('company_id', $companyId)
            ->where('snapshot_date', '>=', now()->subDays(179)->toDateString())
            ->groupBy('snapshot_date')
            ->orderBy('snapshot_date')
            ->get([
                'snapshot_date',
                DB::raw('COUNT(*) as total'),
                DB::raw("SUM(CASE WHEN risk_level IN ('critical','high') THEN 1 ELSE 0 END) as risky"),
            ])
            ->map(fn($r) => [
                'date'       => $r->snapshot_date,
                'risky'      => (int) $r->risky,
                'total'      => (int) $r->total,
                'risky_rate' => $r->total ? round($r->risky / $r->total * 100, 1) : 0,
            ])->all();
    }

    /** Grafik 3: stok durum dağılımı (kova bazında miktar ve değer). */
    private function statusDistribution(string $companyId, ?string $warehouseId): array
    {
        $rows = StockMovement::where('stock_movements.company_id', $companyId)
            ->join('warehouse_products', 'warehouse_products.id', '=', 'stock_movements.product_id')
            ->when($warehouseId, fn($q) => $q->where('stock_movements.warehouse_id', $warehouseId))
            ->groupBy('stock_movements.bucket')
            ->get([
                'stock_movements.bucket',
                DB::raw('SUM(stock_movements.quantity) as qty'),
                DB::raw('SUM(stock_movements.quantity * COALESCE(warehouse_products.unit_price, 0)) as value'),
            ])->keyBy('bucket');

        $total = max(0, (float) $rows->sum('qty'));

        return collect(self::BUCKET_TR)->map(fn($label, $bucket) => [
            'bucket' => $bucket,
            'label'  => $label,
            'qty'    => round(max(0, (float) ($rows[$bucket]->qty ?? 0)), 1),
            'value'  => round(max(0, (float) ($rows[$bucket]->value ?? 0)), 2),
            'share'  => $total > 0 ? round(max(0, (float) ($rows[$bucket]->qty ?? 0)) / $total * 100, 1) : 0,
        ])->values()->all();
    }

    /** Grafik 4: depo bazında stok (kova kırılımı). */
    private function warehouseStock(string $companyId): array
    {
        $sums = StockMovement::where('company_id', $companyId)
            ->groupBy('warehouse_id', 'bucket')
            ->get(['warehouse_id', 'bucket', DB::raw('SUM(quantity) as qty')])
            ->groupBy('warehouse_id');

        return Warehouse::forCompany($companyId)->active()->orderByDesc('is_default')->orderBy('name')->get()
            ->map(function (Warehouse $w) use ($sums) {
                $b = collect($sums->get($w->id, []))->pluck('qty', 'bucket')->map(fn($q) => round(max(0, (float) $q), 1));

                return [
                    'warehouse'  => $w->name,
                    'available'  => $b['available'] ?? 0,
                    'reserved'   => $b['reserved'] ?? 0,
                    'quarantine' => $b['quarantine'] ?? 0,
                    'damaged'    => $b['damaged'] ?? 0,
                    'capacity'   => $w->capacity,
                ];
            })->all();
    }

    // ─── Excel ──────────────────────────────────────────────────────

    /** @return array{0: string, 1: array, 2: array} [başlık, sütunlar, satırlar] */
    public function export(string $companyId, string $type, array $params = []): array
    {
        $title = self::EXPORTS[$type];

        return match ($type) {
            'balances' => [$title, ['Ürün', 'SKU', 'Birim', 'Depo', 'Kullanılabilir', 'Karantina', 'Hasarlı', 'Rezerve', 'Birim fiyat', 'Kullanılabilir değer'],
                $this->balanceRows($companyId)],
            'lots' => [$title, ['Ürün', 'SKU', 'Depo', 'Durum', 'Lot', 'SKT', 'Kalan gün', 'Miktar'], $this->lotRows($companyId)],
            'movements' => [$title, ['Tarih', 'Ürün', 'SKU', 'Depo', 'Hareket', 'Durum', 'Miktar', 'Lot', 'SKT', 'Kayıt', 'Kullanıcı', 'Not'],
                $this->movementRows($companyId, $params['from'] ?? null, $params['to'] ?? null)],
            'risk' => [$title, ['Ürün', 'SKU', 'Kullanılabilir', 'Yolda', 'Günlük tüketim', 'Stok günü', 'Tedarik (gün)', 'Risk', 'Seviye', 'Neden', 'Öneri', 'Açıklama'],
                $this->risk->assessCompany($companyId)->sortByDesc('risk_score')->map(fn($r) => [
                    $r['name'], $r['sku'], $r['available'], $r['on_order'], $r['daily_consumption'], $r['days_of_cover'], $r['lead_time_days'],
                    $r['risk_score'], $r['risk_level'], $r['driver'], $r['recommendation'], $r['explanation'],
                ])->values()->all()],
            'expiry' => [$title, ['Ürün', 'Depo', 'Lot', 'SKT', 'Kalan gün', 'Seviye', 'Miktar', 'Günlük tüketim', 'Kayıp riski', 'Kayıp değeri', 'Öneri'],
                $this->expiry->analyze($companyId)['lots']->map(fn($l) => [
                    $l['name'], $l['warehouse_name'], $l['lot_number'], $l['expiry_date'], $l['days_to_expiry'], $l['level'], $l['quantity'],
                    $l['daily_consumption'], $l['loss_qty'], $l['loss_value'], $l['recommendation'],
                ])->all()],
            'dead_stock' => [$title, ['Ürün', 'SKU', 'Sınıf', 'Stok', 'Tüketim 30g', 'Tüketim 60g', 'Tüketim 90g', 'Son çıkıştan beri (gün)', 'Stok günü', 'Devir', 'Stok değeri', 'Fazla stok', 'Sipariş durduruldu', 'Öneri'],
                $this->dead->analyze($companyId)['rows']->map(fn($r) => [
                    $r['name'], $r['sku'], $r['class'], $r['available'], $r['consumed_30'], $r['consumed_60'], $r['consumed_90'],
                    $r['days_since_consumption'], $r['days_of_supply'], $r['turnover'], $r['stock_value'], $r['excess_qty'],
                    $r['reorder_blocked'] ? 'Evet' : 'Hayır', $r['recommendation'],
                ])->all()],
            'abc_xyz' => [$title, ['Ürün', 'SKU', 'Sınıf', 'Tüketim değeri', 'Pay %', 'Kümülatif %', 'Haftalık ort.', 'CV', 'Güvenlik stoğu', 'Önerilen güvenlik stoğu', 'Politika'],
                $this->abc->analyze($companyId, (int) ($params['days'] ?? 90))['rows']->map(fn($r) => [
                    $r['name'], $r['sku'], $r['class'], $r['consumed_value'], $r['value_share'], $r['cumulative_share'], $r['weekly_mean'],
                    $r['cv'], $r['safety_stock'], $r['recommended_safety'], $r['policy']['note'],
                ])->all()],
            'transfers' => [$title, ['Ürün', 'Kaynak depo', 'Hedef depo', 'Kaynak stok', 'Hedef stok', 'Hedef ihtiyaç', 'Önerilen transfer', 'Değer', 'Satın alma yerine', 'Gerekçe'],
                $this->transfers->suggestions($companyId)['suggestions']->map(fn($s) => [
                    $s['name'], $s['from_warehouse'], $s['to_warehouse'], $s['source_stock'], $s['dest_stock'], $s['dest_need'],
                    $s['quantity'], $s['value'], $s['replaces_purchase'] ? 'Evet' : 'Hayır', $s['reason'],
                ])->all()],
            'purchase_orders' => [$title, ['Sipariş no', 'Tedarikçi', 'Durum', 'Sipariş tarihi', 'Beklenen', 'Teslim', 'Ürün', 'Sipariş', 'Gelen', 'Hasarlı', 'Birim fiyat', 'Tutar'],
                $this->purchaseOrderRows($companyId)],
            'suppliers' => [$title, ['Tedarikçi', 'Skor', 'Not', 'Sipariş', 'Beyan teslim (gün)', 'Gerçek teslim (gün)', 'Zamanında %', 'Ort. gecikme (gün)', 'Tam teslim %', 'Hasarlı %', 'Fiyat değişimi %', 'Harcama'],
                collect($this->suppliers->analyze($companyId, 180)['suppliers'])->map(fn($s) => [
                    $s['name'], $s['score'], $s['grade'], $s['orders'], $s['declared_lead_time'], $s['avg_lead_time'], $s['on_time_rate'],
                    $s['avg_delay_days'], $s['fill_rate'], $s['damage_rate'], $s['price_change_pct'], $s['spend'],
                ])->all()],
            'kpis' => [$title, ['KPI', 'Bu dönem', 'Önceki dönem', 'Değişim', 'Yorum', 'Nedenler'],
                collect($this->kpis->report($companyId, (int) ($params['period'] ?? 30))['kpis'])->map(fn($k) => [
                    $k['label'], $k['current'], $k['previous'], $k['change'], $k['comment'], implode(' | ', $k['drivers']),
                ])->all()],
            'anomalies' => [$title, ['Tarih', 'Tür', 'Önem', 'Durum', 'Açıklama', 'İnceleyen', 'Not'],
                StockAnomaly::forCompany($companyId)->with('reviewedBy:id,name')->orderByDesc('detected_for')->limit(5000)->get()->map(fn($a) => [
                    $a->detected_for?->toDateString(), AnomalyService::TYPE_LABELS[$a->type] ?? $a->type, $a->severity,
                    ['open' => 'Açık', 'acknowledged' => 'Sorun var', 'dismissed' => 'Normal'][$a->status] ?? $a->status,
                    $a->message, $a->reviewedBy?->name, $a->review_note,
                ])->all()],
        };
    }

    private function balanceRows(string $companyId): array
    {
        $products   = WarehouseProduct::forCompany($companyId)->get()->keyBy('id');
        $warehouses = Warehouse::forCompany($companyId)->pluck('name', 'id');

        return StockMovement::where('company_id', $companyId)
            ->groupBy('product_id', 'warehouse_id', 'bucket')
            ->get(['product_id', 'warehouse_id', 'bucket', DB::raw('SUM(quantity) as qty')])
            ->groupBy(fn($r) => "{$r->product_id}|{$r->warehouse_id}")
            ->map(function ($rows) use ($products, $warehouses) {
                $p = $products[$rows->first()->product_id] ?? null;
                $b = $rows->pluck('qty', 'bucket')->map(fn($q) => round((float) $q, 3));
                if (!$p || $b->sum() == 0) {
                    return null;
                }

                return [
                    $p->name, $p->sku, $p->unit, $warehouses[$rows->first()->warehouse_id] ?? '',
                    $b['available'] ?? 0, $b['quarantine'] ?? 0, $b['damaged'] ?? 0, $b['reserved'] ?? 0,
                    $p->unit_price, round(($b['available'] ?? 0) * (float) ($p->unit_price ?? 0), 2),
                ];
            })->filter()->sortBy(fn($r) => $r[0] . $r[3])->values()->all();
    }

    private function lotRows(string $companyId): array
    {
        $products   = WarehouseProduct::forCompany($companyId)->get()->keyBy('id');
        $warehouses = Warehouse::forCompany($companyId)->pluck('name', 'id');
        $today      = Carbon::today();

        return StockMovement::where('company_id', $companyId)
            ->groupBy('product_id', 'warehouse_id', 'bucket', 'lot_number', 'expiry_date')
            ->havingRaw('SUM(quantity) > 0.0005')
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC')
            ->get(['product_id', 'warehouse_id', 'bucket', 'lot_number', 'expiry_date', DB::raw('SUM(quantity) as qty')])
            ->map(fn($r) => [
                $products[$r->product_id]->name ?? '', $products[$r->product_id]->sku ?? '', $warehouses[$r->warehouse_id] ?? '',
                self::BUCKET_TR[$r->bucket] ?? $r->bucket, $r->lot_number,
                $r->expiry_date ? substr((string) $r->expiry_date, 0, 10) : null,
                $r->expiry_date ? (int) $today->diffInDays(Carbon::parse($r->expiry_date), false) : null,
                round((float) $r->qty, 3),
            ])->all();
    }

    private function movementRows(string $companyId, ?string $from, ?string $to): array
    {
        $labels = ['opening' => 'Açılış', 'stock_in' => 'Giriş', 'stock_out' => 'Çıkış', 'transfer_in' => 'Transfer girişi', 'transfer_out' => 'Transfer çıkışı',
            'adjustment' => 'Düzeltme', 'count_adjustment' => 'Sayım farkı', 'damage' => 'Hasar', 'return_in' => 'İade girişi', 'qc_release' => 'QC onayı', 'reversal' => 'İptal'];

        return StockMovement::where('company_id', $companyId)
            ->when($from, fn($q) => $q->where('occurred_at', '>=', Carbon::parse($from)->startOfDay()))
            ->when($to, fn($q) => $q->where('occurred_at', '<=', Carbon::parse($to)->endOfDay()))
            ->with(['product:id,name,sku', 'warehouse:id,name', 'record:id,record_number', 'createdBy:id,name'])
            ->orderBy('occurred_at')->orderBy('created_at')
            ->limit(50000)
            ->get()
            ->map(fn(StockMovement $m) => [
                $m->occurred_at?->format('Y-m-d H:i'), $m->product?->name, $m->product?->sku, $m->warehouse?->name,
                $labels[$m->movement_type] ?? $m->movement_type, self::BUCKET_TR[$m->bucket] ?? $m->bucket, $m->quantity,
                $m->lot_number, $m->expiry_date?->toDateString(), $m->record?->record_number, $m->createdBy?->name, $m->note,
            ])->all();
    }

    private function purchaseOrderRows(string $companyId): array
    {
        $status = ['draft' => 'Taslak', 'sent' => 'Gönderildi', 'partially_received' => 'Kısmi teslim', 'received' => 'Teslim alındı', 'cancelled' => 'İptal'];

        return PurchaseOrder::forCompany($companyId)->with(['supplier:id,name', 'items.product:id,name'])->orderByDesc('created_at')->get()
            ->flatMap(fn(PurchaseOrder $po) => $po->items->map(fn($i) => [
                $po->po_number, $po->supplier?->name, $status[$po->status] ?? $po->status, $po->order_date?->toDateString(),
                $po->expected_date?->toDateString(), $po->received_at?->toDateString(), $i->product?->name,
                $i->quantity, $i->received_qty, $i->damaged_qty, $i->unit_price !== null ? (float) $i->unit_price : null,
                round($i->quantity * (float) ($i->unit_price ?? 0), 2),
            ]))->all();
    }
}
