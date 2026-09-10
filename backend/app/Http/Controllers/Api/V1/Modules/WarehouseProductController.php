<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use App\Services\Stock\StockLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WarehouseProductController extends Controller
{
    public function __construct(private readonly StockLedgerService $ledger) {}

    private const VIEW_PERM   = 'warehouse.records.view';
    private const CREATE_PERM = 'warehouse.records.create';
    private const EDIT_PERM   = 'warehouse.records.edit';
    private const DELETE_PERM = 'warehouse.records.delete';

    // ─── List ──────────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(self::VIEW_PERM), 403);

        $query = WarehouseProduct::forCompany($request->user()->company_id);

        if ($search = $request->input('search')) {
            $query->search($search);
        }
        if ($request->boolean('active_only', false)) {
            $query->active();
        }
        if ($category = $request->input('category')) {
            $query->where('category', $category);
        }

        $products = $query
            ->orderBy($request->input('sort_by', 'name'))
            ->paginate($request->integer('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => $products->items(),
            'meta'    => [
                'current_page' => $products->currentPage(),
                'per_page'     => $products->perPage(),
                'total'        => $products->total(),
                'last_page'    => $products->lastPage(),
            ],
        ]);
    }

    // ─── Search (autocomplete) ─────────────────────────────────────────────────

    public function search(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(self::VIEW_PERM), 403);

        $term = $request->input('q', '');

        $products = WarehouseProduct::forCompany($request->user()->company_id)
            ->active()
            ->search($term)
            ->orderBy('name')
            ->limit(15)
            ->get(['id', 'name', 'sku', 'barcode', 'unit', 'unit_price', 'current_stock', 'category']);

        return response()->json(['success' => true, 'data' => $products]);
    }

    // ─── Store ─────────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(self::CREATE_PERM), 403);

        $data = $request->validate([
            'name'          => ['required', 'string', 'max:255'],
            'sku'           => ['nullable', 'string', 'max:100'],
            'barcode'       => ['nullable', 'string', 'max:100'],
            'unit'          => ['nullable', 'string', 'max:20'],
            'category'      => ['nullable', 'string', 'max:100'],
            'description'   => ['nullable', 'string', 'max:2000'],
            'unit_price'    => ['nullable', 'numeric', 'min:0'],
            'min_stock'     => ['nullable', 'numeric', 'min:0'],
            'lead_time_days'=> ['nullable', 'integer', 'min:1', 'max:365'],
            'safety_stock'  => ['nullable', 'numeric', 'min:0'],
            'default_supplier_id' => ['nullable', 'uuid', Rule::exists('suppliers', 'id')->where('company_id', $request->user()->company_id)->whereNull('deleted_at')],
            'min_order_qty' => ['nullable', 'numeric', 'min:0'],
            'order_multiple'=> ['nullable', 'numeric', 'gt:0'],
            'reorder_blocked' => ['nullable', 'boolean'],
            'current_stock' => ['nullable', 'numeric', 'min:0'], // açılış stoğu
            'warehouse_id'  => ['nullable', 'uuid'],               // açılış stoğunun deposu
            'is_active'     => ['nullable', 'boolean'],
        ]);

        $user = $request->user();

        if (!$user->company_id) {
            return response()->json([
                'success' => false,
                'message' => 'Bu hesap bir şirkete bağlı değil. Ürün eklemek için şirket kullanıcısıyla giriş yapın.',
                'code'    => 'NO_COMPANY',
            ], 422);
        }

        $opening   = (float) ($data['current_stock'] ?? 0);
        $warehouse = !empty($data['warehouse_id'])
            ? Warehouse::forCompany($user->company_id)->active()->find($data['warehouse_id'])
            : Warehouse::defaultFor($user->company_id);

        if ($opening > 0 && !$warehouse) {
            return response()->json([
                'success' => false,
                'message' => 'Açılış stoğu için geçerli bir depo seçin.',
            ], 422);
        }

        // Stok sadece defter üzerinden oluşur: ürün 0 ile açılır, açılış stoğu defter satırı olarak eklenir
        $product = DB::transaction(function () use ($data, $user, $opening, $warehouse) {
            $product = WarehouseProduct::create([
                ...collect($data)->except(['current_stock', 'warehouse_id'])->all(),
                'company_id'    => $user->company_id,
                'current_stock' => 0,
            ]);

            if ($opening > 0) {
                $this->ledger->opening($product, $opening, $warehouse, $user);
            }

            return $product->fresh();
        });

        return response()->json([
            'success' => true,
            'data'    => $product,
            'message' => 'Ürün oluşturuldu.',
        ], 201);
    }

    // ─── Show ──────────────────────────────────────────────────────────────────

    public function show(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission(self::VIEW_PERM), 403);

        $product = WarehouseProduct::forCompany($request->user()->company_id)->findOrFail($id);

        return response()->json(['success' => true, 'data' => $product]);
    }

    // ─── Update ────────────────────────────────────────────────────────────────

    public function update(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission(self::EDIT_PERM), 403);

        $product = WarehouseProduct::forCompany($request->user()->company_id)->findOrFail($id);

        $data = $request->validate([
            'name'          => ['sometimes', 'required', 'string', 'max:255'],
            'sku'           => ['nullable', 'string', 'max:100'],
            'barcode'       => ['nullable', 'string', 'max:100'],
            'unit'          => ['nullable', 'string', 'max:20'],
            'category'      => ['nullable', 'string', 'max:100'],
            'description'   => ['nullable', 'string', 'max:2000'],
            'unit_price'    => ['nullable', 'numeric', 'min:0'],
            'min_stock'     => ['nullable', 'numeric', 'min:0'],
            'lead_time_days'=> ['nullable', 'integer', 'min:1', 'max:365'],
            'safety_stock'  => ['nullable', 'numeric', 'min:0'],
            'default_supplier_id' => ['nullable', 'uuid', Rule::exists('suppliers', 'id')->where('company_id', $request->user()->company_id)->whereNull('deleted_at')],
            'min_order_qty' => ['nullable', 'numeric', 'min:0'],
            'order_multiple'=> ['nullable', 'numeric', 'gt:0'],
            'reorder_blocked' => ['nullable', 'boolean'],
            'is_active'     => ['nullable', 'boolean'],
        ]);

        if (array_key_exists('reorder_blocked', $data)) {
            $data['reorder_blocked_at'] = $data['reorder_blocked'] ? now() : null;
        }

        // current_stock burada değişmez; stok değişikliği düzeltme/sayım kaydıyla yapılır
        $product->update($data);

        return response()->json([
            'success' => true,
            'data'    => $product->fresh(),
            'message' => 'Ürün güncellendi.',
        ]);
    }

    // ─── Destroy ───────────────────────────────────────────────────────────────

    public function destroy(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission(self::DELETE_PERM), 403);

        $product = WarehouseProduct::forCompany($request->user()->company_id)->findOrFail($id);
        $product->delete();

        return response()->json(['success' => true, 'message' => 'Ürün silindi.']);
    }

    // ─── Dashboard stats ───────────────────────────────────────────────────────

    public function stats(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(self::VIEW_PERM), 403);

        $companyId = $request->user()->company_id;

        $products = WarehouseProduct::forCompany($companyId)->get();

        $totalValue    = $products->sum(fn($p) => $p->current_stock * ($p->unit_price ?? 0));
        $criticalCount = $products->filter(fn($p) => $p->current_stock <= $p->min_stock && $p->min_stock > 0)->count();
        $totalProducts = $products->count();
        $activeCount   = $products->where('is_active', true)->count();

        return response()->json([
            'success' => true,
            'data'    => [
                'total_products'   => $totalProducts,
                'active_products'  => $activeCount,
                'total_stock_value'=> round($totalValue, 2),
                'critical_stock'   => $criticalCount,
            ],
        ]);
    }
}
