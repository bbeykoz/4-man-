<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Exports\ReportSheetExport;
use App\Http\Controllers\Controller;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use App\Services\Stock\AbcXyzService;
use App\Services\Stock\DeadStockService;
use App\Services\Stock\ExpiryService;
use App\Services\Stock\StockLedgerService;
use App\Services\Stock\StockRiskService;
use App\Services\Stock\TransferSuggestionService;
use App\Services\Stock\ReportService;
use App\Services\Stock\WarehouseKpiService;
use App\Services\Stock\WhatIfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Depo tanımları ve stok defteri bakiyeleri.
 * Yetkiler depo modülüyle aynı (warehouse.records.*).
 */
class StockController extends Controller
{
    private const VIEW_PERM = 'warehouse.records.view';
    private const EDIT_PERM = 'warehouse.records.edit';

    public function __construct(private readonly StockLedgerService $ledger) {}

    // ─── Depolar ────────────────────────────────────────────────────

    public function warehouses(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $companyId = $request->user()->company_id;

        $totals = StockMovement::forCompany($companyId)
            ->groupBy('warehouse_id', 'bucket')
            ->get(['warehouse_id', 'bucket', DB::raw('SUM(quantity) as qty')])
            ->groupBy('warehouse_id');

        $productCounts = StockMovement::forCompany($companyId)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->groupBy('warehouse_id', 'product_id')
            ->havingRaw('SUM(quantity) > 0')
            ->get(['warehouse_id', 'product_id'])
            ->countBy('warehouse_id');

        $warehouses = Warehouse::forCompany($companyId)
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get()
            ->map(function (Warehouse $w) use ($totals, $productCounts) {
                $buckets = collect($totals->get($w->id, []))->pluck('qty', 'bucket')->map(fn($q) => round((float) $q, 3));
                $onHand  = ($buckets[StockMovement::BUCKET_AVAILABLE] ?? 0)
                    + ($buckets[StockMovement::BUCKET_QUARANTINE] ?? 0)
                    + ($buckets[StockMovement::BUCKET_DAMAGED] ?? 0);

                return [
                    ...$w->only(['id', 'name', 'code', 'city', 'address', 'capacity', 'is_default', 'is_active']),
                    'available'     => $buckets[StockMovement::BUCKET_AVAILABLE] ?? 0,
                    'quarantine'    => $buckets[StockMovement::BUCKET_QUARANTINE] ?? 0,
                    'damaged'       => $buckets[StockMovement::BUCKET_DAMAGED] ?? 0,
                    'product_count' => $productCounts->get($w->id, 0),
                    'fill_rate'     => $w->capacity ? round($onHand / $w->capacity * 100, 1) : null,
                ];
            });

        return response()->json(['success' => true, 'data' => $warehouses]);
    }

    public function storeWarehouse(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $companyId = $request->user()->company_id;

        $data = $this->validateWarehouse($request, $companyId);

        $warehouse = DB::transaction(function () use ($data, $companyId) {
            $isFirst = !Warehouse::forCompany($companyId)->exists();
            if (($data['is_default'] ?? false) || $isFirst) {
                Warehouse::forCompany($companyId)->update(['is_default' => false]);
                $data['is_default'] = true;
            }

            return Warehouse::create([...$data, 'company_id' => $companyId]);
        });

        return response()->json(['success' => true, 'data' => $warehouse, 'message' => 'Depo oluşturuldu.'], 201);
    }

    public function updateWarehouse(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $companyId = $request->user()->company_id;
        $warehouse = Warehouse::forCompany($companyId)->findOrFail($id);

        $data = $this->validateWarehouse($request, $companyId, $warehouse->id);

        if (array_key_exists('is_active', $data) && !$data['is_active'] && $warehouse->is_default) {
            return response()->json(['success' => false, 'message' => 'Varsayılan depo pasife alınamaz. Önce başka bir depoyu varsayılan yapın.'], 422);
        }

        DB::transaction(function () use ($data, $warehouse, $companyId) {
            if ($data['is_default'] ?? false) {
                Warehouse::forCompany($companyId)->whereKeyNot($warehouse->id)->update(['is_default' => false]);
            } else {
                unset($data['is_default']); // varsayılanlık sadece başka depo seçilerek devredilir
            }
            $warehouse->update($data);
        });

        return response()->json(['success' => true, 'data' => $warehouse->fresh(), 'message' => 'Depo güncellendi.']);
    }

    public function destroyWarehouse(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $companyId = $request->user()->company_id;
        $warehouse = Warehouse::forCompany($companyId)->findOrFail($id);

        if ($warehouse->is_default) {
            return response()->json(['success' => false, 'message' => 'Varsayılan depo silinemez.'], 422);
        }

        $hasStock = StockMovement::forCompany($companyId)
            ->where('warehouse_id', $warehouse->id)
            ->groupBy('product_id', 'bucket')
            ->havingRaw('ABS(SUM(quantity)) > 0.0005')
            ->exists();

        if ($hasStock) {
            return response()->json(['success' => false, 'message' => 'Depoda stok var. Önce stoğu transfer edin veya depoyu pasife alın.'], 422);
        }

        $warehouse->delete();

        return response()->json(['success' => true, 'message' => 'Depo silindi.']);
    }

    // ─── Stok bakiyeleri ────────────────────────────────────────────

    /** Ürün bazında kova (kullanılabilir/karantina/hasarlı/rezerve) ve depo kırılımı. */
    public function balances(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $companyId   = $request->user()->company_id;
        $warehouseId = $request->input('warehouse_id');

        $products = WarehouseProduct::forCompany($companyId)
            ->when($request->input('search'), fn($q, $s) => $q->search($s))
            ->when($request->boolean('in_stock'), fn($q) => $q->whereIn('id',
                StockMovement::forCompany($companyId)
                    ->when($warehouseId, fn($m) => $m->where('warehouse_id', $warehouseId))
                    ->groupBy('product_id')
                    ->havingRaw('SUM(quantity) > 0.0005')
                    ->select('product_id')
            ))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 20));

        $ids  = collect($products->items())->pluck('id');
        $rows = StockMovement::forCompany($companyId)
            ->whereIn('product_id', $ids)
            ->when($warehouseId, fn($q) => $q->where('warehouse_id', $warehouseId))
            ->groupBy('product_id', 'warehouse_id', 'bucket')
            ->get(['product_id', 'warehouse_id', 'bucket', DB::raw('SUM(quantity) as qty')])
            ->groupBy('product_id');

        $warehouseNames = Warehouse::forCompany($companyId)->pluck('name', 'id');

        $data = collect($products->items())->map(function (WarehouseProduct $p) use ($rows, $warehouseNames) {
            $productRows = collect($rows->get($p->id, []));
            $sum = fn(string $bucket) => round((float) $productRows->where('bucket', $bucket)->sum('qty'), 3);

            return [
                'id'         => $p->id,
                'name'       => $p->name,
                'sku'        => $p->sku,
                'barcode'    => $p->barcode,
                'unit'       => $p->unit,
                'min_stock'  => $p->min_stock,
                'unit_price' => $p->unit_price,
                'available'  => $sum(StockMovement::BUCKET_AVAILABLE),
                'quarantine' => $sum(StockMovement::BUCKET_QUARANTINE),
                'damaged'    => $sum(StockMovement::BUCKET_DAMAGED),
                'reserved'   => $sum(StockMovement::BUCKET_RESERVED),
                'warehouses' => $productRows->groupBy('warehouse_id')->map(fn($wRows, $wId) => [
                    'warehouse_id'   => $wId,
                    'warehouse_name' => $warehouseNames[$wId] ?? '—',
                    'available'      => round((float) $wRows->where('bucket', StockMovement::BUCKET_AVAILABLE)->sum('qty'), 3),
                    'quarantine'     => round((float) $wRows->where('bucket', StockMovement::BUCKET_QUARANTINE)->sum('qty'), 3),
                    'damaged'        => round((float) $wRows->where('bucket', StockMovement::BUCKET_DAMAGED)->sum('qty'), 3),
                ])->values(),
            ];
        });

        return response()->json([
            'success' => true,
            'data'    => $data,
            'meta'    => [
                'current_page' => $products->currentPage(),
                'per_page'     => $products->perPage(),
                'total'        => $products->total(),
                'last_page'    => $products->lastPage(),
            ],
        ]);
    }

    /** Tek ürün: depo × lot bakiyeleri (FEFO sırası) ve son hareketler. */
    public function product(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $companyId = $request->user()->company_id;
        $product   = WarehouseProduct::forCompany($companyId)->findOrFail($id);

        $lots = Warehouse::forCompany($companyId)->get()->flatMap(function (Warehouse $w) use ($companyId, $product) {
            return collect(StockMovement::BUCKETS)->flatMap(fn($bucket) => $this->ledger
                ->lotBalances($companyId, $product->id, $w->id, $bucket)
                ->map(fn($lot) => [...$lot, 'bucket' => $bucket, 'warehouse_id' => $w->id, 'warehouse_name' => $w->name]));
        })->values();

        $movements = StockMovement::forCompany($companyId)
            ->where('product_id', $product->id)
            ->with(['warehouse:id,name', 'record:id,record_number,title', 'createdBy:id,name'])
            ->orderByDesc('occurred_at')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn(StockMovement $m) => [
                'id'             => $m->id,
                'movement_type'  => $m->movement_type,
                'bucket'         => $m->bucket,
                'quantity'       => $m->quantity,
                'lot_number'     => $m->lot_number,
                'expiry_date'    => $m->expiry_date?->toDateString(),
                'occurred_at'    => $m->occurred_at?->toISOString(),
                'warehouse_name' => $m->warehouse?->name,
                'record_number'  => $m->record?->record_number,
                'created_by'     => $m->createdBy?->name,
                'note'           => $m->note,
            ]);

        return response()->json([
            'success' => true,
            'data'    => [
                'product'   => $product->only(['id', 'name', 'sku', 'barcode', 'unit', 'min_stock', 'unit_price', 'current_stock']),
                'lots'      => $lots,
                'movements' => $movements,
            ],
        ]);
    }

    // ─── Stok risk skoru ────────────────────────────────────────────

    /** Ürün bazında 0–100 risk skoru, seviye özeti ve öneriler. */
    public function risk(Request $request, StockRiskService $risk): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $data = $request->validate([
            'warehouse_id' => ['nullable', 'uuid'],
            'level'        => ['nullable', Rule::in(['critical', 'high', 'medium', 'low'])],
            'search'       => ['nullable', 'string', 'max:100'],
        ]);

        $rows = $risk->assessCompany($request->user()->company_id, $data['warehouse_id'] ?? null);

        $summary = collect(['critical', 'high', 'medium', 'low'])
            ->mapWithKeys(fn($l) => [$l => $rows->where('risk_level', $l)->count()]);

        if ($search = mb_strtolower($data['search'] ?? '')) {
            $rows = $rows->filter(fn($r) => str_contains(mb_strtolower($r['name'] . ' ' . $r['sku']), $search));
        }
        if ($level = $data['level'] ?? null) {
            $rows = $rows->where('risk_level', $level);
        }

        return response()->json([
            'success' => true,
            'data'    => $rows->sortByDesc('risk_score')->values(),
            'summary' => $summary,
        ]);
    }

    /** Risk trendi: günlük anlık görüntülerden seviye dağılımı ve riskli ürün oranı. */
    public function riskTrend(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $days = min(365, max(7, $request->integer('days', 90)));

        $rows = DB::table('stock_risk_snapshots')
            ->where('company_id', $request->user()->company_id)
            ->where('snapshot_date', '>=', now()->subDays($days - 1)->toDateString())
            ->groupBy('snapshot_date')
            ->orderBy('snapshot_date')
            ->get([
                'snapshot_date',
                DB::raw('COUNT(*) as total'),
                DB::raw("SUM(CASE WHEN risk_level IN ('critical','high') THEN 1 ELSE 0 END) as risky"),
                DB::raw("SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) as critical"),
                DB::raw('ROUND(AVG(risk_score), 1) as avg_score'),
            ])
            ->map(fn($r) => [
                'date'       => $r->snapshot_date,
                'total'      => (int) $r->total,
                'risky'      => (int) $r->risky,
                'critical'   => (int) $r->critical,
                'risky_rate' => $r->total ? round($r->risky / $r->total * 100, 1) : 0,
                'avg_score'  => (float) $r->avg_score,
            ]);

        return response()->json(['success' => true, 'data' => $rows]);
    }

    // ─── SKT / FEFO ─────────────────────────────────────────────────

    public function expiry(Request $request, ExpiryService $expiry): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $data = $request->validate(['warehouse_id' => ['nullable', 'uuid']]);

        return response()->json(['success' => true, 'data' => $expiry->analyze($request->user()->company_id, $data['warehouse_id'] ?? null)]);
    }

    /** SKT önerisinden "Bekliyor" durumunda transfer / hasar kaydı açar. */
    public function expiryAction(Request $request, ExpiryService $expiry): JsonResponse
    {
        $this->authorizePerm($request, 'warehouse.records.create');

        $data = $request->validate([
            'type'            => ['required', Rule::in(['transfer', 'damage'])],
            'product_id'      => ['required', 'uuid'],
            'warehouse_id'    => ['required', 'uuid'],
            'to_warehouse_id' => ['nullable', 'required_if:type,transfer', 'uuid'],
            'lot_number'      => ['nullable', 'string', 'max:100'],
            'expiry_date'     => ['nullable', 'date'],
            'quantity'        => ['required', 'numeric', 'gt:0'],
            'note'            => ['nullable', 'string', 'max:500'],
        ]);

        $record = $expiry->createAction($request->user(), $data);

        return response()->json([
            'success' => true,
            'data'    => ['id' => $record->id, 'record_number' => $record->record_number],
            'message' => "{$record->record_number} oluşturuldu. Depolama listesinden onaylayınca stoğa işlenir.",
        ], 201);
    }

    // ─── Ölü / yavaş stok ───────────────────────────────────────────

    public function deadStock(Request $request, DeadStockService $dead): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $data = $request->validate(['warehouse_id' => ['nullable', 'uuid']]);

        return response()->json(['success' => true, 'data' => $dead->analyze($request->user()->company_id, $data['warehouse_id'] ?? null)]);
    }

    public function blockReorder(Request $request, DeadStockService $dead): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);

        $data = $request->validate([
            'product_ids'   => ['required', 'array', 'min:1'],
            'product_ids.*' => ['uuid'],
            'blocked'       => ['required', 'boolean'],
        ]);

        $count = $dead->setReorderBlocked($request->user()->company_id, $data['product_ids'], (bool) $data['blocked']);

        return response()->json([
            'success' => true,
            'message' => $data['blocked'] ? "{$count} ürünün yeniden siparişi durduruldu." : "{$count} ürün için sipariş yeniden açıldı.",
        ]);
    }

    // ─── Depolar arası transfer ─────────────────────────────────────

    public function transferSuggestions(Request $request, TransferSuggestionService $transfers): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        return response()->json(['success' => true, 'data' => $transfers->suggestions($request->user()->company_id)]);
    }

    /** Seçilen önerilerden "Bekliyor" transfer kayıtları (onay Depolama listesinden). */
    public function createTransfers(Request $request, TransferSuggestionService $transfers): JsonResponse
    {
        $this->authorizePerm($request, 'warehouse.records.create');

        $data = $request->validate([
            'lines'                     => ['required', 'array', 'min:1'],
            'lines.*.product_id'        => ['required', 'uuid'],
            'lines.*.from_warehouse_id' => ['required', 'uuid'],
            'lines.*.to_warehouse_id'   => ['required', 'uuid'],
            'lines.*.quantity'          => ['required', 'numeric', 'gt:0'],
            'lines.*.reason'            => ['nullable', 'string', 'max:500'],
        ], ['lines.required' => 'En az bir öneri seçin.']);

        $records = $transfers->createOrders($request->user(), $data['lines']);

        return response()->json([
            'success' => true,
            'data'    => $records->map(fn($r) => ['id' => $r->id, 'record_number' => $r->record_number]),
            'message' => "{$records->count()} transfer kaydı oluşturuldu. Depolama listesinden onaylayınca stok taşınır.",
        ], 201);
    }

    // ─── What-if simülasyonu ────────────────────────────────────────

    /** 1–3 senaryoyu mevcut durumla karşılaştırır (veri değiştirmez). */
    public function whatIf(Request $request, WhatIfService $whatIf): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $companyId = $request->user()->company_id;

        $data = $request->validate([
            'warehouse_id'                     => ['nullable', 'uuid'],
            'scenarios'                        => ['required', 'array', 'min:1', 'max:3'],
            'scenarios.*.name'                 => ['nullable', 'string', 'max:60'],
            'scenarios.*.demand_change_pct'    => ['nullable', 'numeric', 'min:-90', 'max:300'],
            'scenarios.*.lead_time_extra_days' => ['nullable', 'integer', 'min:-60', 'max:120'],
            'scenarios.*.safety_change_pct'    => ['nullable', 'numeric', 'min:-100', 'max:300'],
            'scenarios.*.supplier_id'          => ['nullable', 'uuid', Rule::exists('suppliers', 'id')->where('company_id', $companyId)],
            'scenarios.*.category'             => ['nullable', 'string', 'max:100'],
        ], [
            'scenarios.max'                          => 'En fazla 3 senaryo karşılaştırılabilir.',
            'scenarios.*.demand_change_pct.min'      => 'Talep en fazla %90 düşürülebilir.',
            'scenarios.*.lead_time_extra_days.min'   => 'Tedarik süresi en fazla 60 gün kısaltılabilir.',
        ]);

        return response()->json([
            'success' => true,
            'data'    => $whatIf->simulate($companyId, $data['scenarios'], $data['warehouse_id'] ?? null),
        ]);
    }

    public function whatIfOptions(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        return response()->json([
            'success' => true,
            'data'    => [
                'categories' => WarehouseProduct::forCompany($request->user()->company_id)->active()
                    ->whereNotNull('category')->distinct()->orderBy('category')->pluck('category'),
            ],
        ]);
    }

    // ─── Depo KPI ───────────────────────────────────────────────────

    public function kpis(Request $request, WarehouseKpiService $kpis): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $data = $request->validate([
            'period'       => ['nullable', Rule::in([30, 90])],
            'warehouse_id' => ['nullable', 'uuid'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => $kpis->report($request->user()->company_id, (int) ($data['period'] ?? 30), $data['warehouse_id'] ?? null),
        ]);
    }

    // ─── ABC / XYZ ──────────────────────────────────────────────────

    public function abcXyz(Request $request, AbcXyzService $abc): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $data = $request->validate([
            'days'         => ['nullable', Rule::in([90, 180, 365])],
            'warehouse_id' => ['nullable', 'uuid'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => $abc->analyze($request->user()->company_id, (int) ($data['days'] ?? 90), $data['warehouse_id'] ?? null),
        ]);
    }

    /** Önerilen güvenlik stoklarını seçili ürünlere uygular (risk ve sipariş önerileri bunu kullanır). */
    public function applySafetyStock(Request $request, AbcXyzService $abc): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);

        $data = $request->validate([
            'product_ids'   => ['required', 'array', 'min:1'],
            'product_ids.*' => ['uuid'],
            'days'          => ['nullable', Rule::in([90, 180, 365])],
        ]);

        $count = $abc->applySafetyStock($request->user()->company_id, $data['product_ids'], (int) ($data['days'] ?? 90));

        return response()->json(['success' => true, 'message' => "{$count} ürünün güvenlik stoğu güncellendi."]);
    }

    // ─── Raporlar ───────────────────────────────────────────────────

    /** Dashboard grafik verisi (aylık hacim, risk trendi, durum dağılımı, depo stoğu, tedarikçi gecikmesi). */
    public function reportOverview(Request $request, ReportService $reports): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $data = $request->validate([
            'months'       => ['nullable', Rule::in([6, 12])],
            'warehouse_id' => ['nullable', 'uuid'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => $reports->overview($request->user()->company_id, (int) ($data['months'] ?? 6), $data['warehouse_id'] ?? null),
            'exports' => ReportService::EXPORTS,
        ]);
    }

    /** Excel dışa aktarma. */
    public function reportExport(Request $request, ReportService $reports): BinaryFileResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $data = $request->validate([
            'type'   => ['required', Rule::in(array_keys(ReportService::EXPORTS))],
            'from'   => ['nullable', 'date'],
            'to'     => ['nullable', 'date', 'after_or_equal:from'],
            'days'   => ['nullable', Rule::in([90, 180, 365])],
            'period' => ['nullable', Rule::in([30, 90])],
        ]);

        [$title, $headings, $rows] = $reports->export($request->user()->company_id, $data['type'], $data);

        $file = Str::slug($title) . '-' . now()->format('Y-m-d') . '.xlsx';

        return Excel::download(new ReportSheetExport($title, $headings, $rows), $file);
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    private function authorizePerm(Request $request, string $permission): void
    {
        abort_unless($request->user()->hasPermission($permission), 403);
        abort_unless($request->user()->company_id, 422, 'Bu hesap bir şirkete bağlı değil. Stok işlemleri için şirket kullanıcısıyla giriş yapın.');
    }

    private function validateWarehouse(Request $request, string $companyId, ?string $ignoreId = null): array
    {
        $required = $ignoreId ? 'sometimes' : 'required';

        return $request->validate([
            'name'       => [$required, 'string', 'max:100'],
            'code'       => [
                $required, 'string', 'max:20', 'alpha_dash',
                Rule::unique('warehouses', 'code')->where('company_id', $companyId)->whereNull('deleted_at')->ignore($ignoreId),
            ],
            'city'       => ['nullable', 'string', 'max:100'],
            'address'    => ['nullable', 'string', 'max:500'],
            'capacity'   => ['nullable', 'integer', 'min:1'],
            'is_default' => ['nullable', 'boolean'],
            'is_active'  => ['nullable', 'boolean'],
        ], [
            'code.unique'     => 'Bu depo kodu zaten kullanılıyor.',
            'code.alpha_dash' => 'Depo kodu sadece harf, rakam, - ve _ içerebilir.',
        ]);
    }
}
