<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\WarehouseProduct;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WarehouseProductController extends Controller
{
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
            'min_stock'     => ['nullable', 'integer', 'min:0'],
            'current_stock' => ['nullable', 'integer', 'min:0'],
            'is_active'     => ['nullable', 'boolean'],
        ]);

        $product = WarehouseProduct::create(array_merge($data, [
            'company_id' => $request->user()->company_id,
        ]));

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
            'min_stock'     => ['nullable', 'integer', 'min:0'],
            'current_stock' => ['nullable', 'integer', 'min:0'],
            'is_active'     => ['nullable', 'boolean'],
        ]);

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
