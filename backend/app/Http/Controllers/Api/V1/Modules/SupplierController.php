<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Services\Stock\SupplierPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Tedarikçi kartları (depo modülü yetkileriyle). */
class SupplierController extends Controller
{
    private const VIEW_PERM = 'warehouse.records.view';
    private const EDIT_PERM = 'warehouse.records.edit';

    public function index(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $companyId = $request->user()->company_id;

        $likeOp = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

        $suppliers = Supplier::forCompany($companyId)
            ->when($request->input('search'), fn($q, $s) => $q->where(fn($w) => $w
                ->where('name', $likeOp, "%{$s}%")->orWhere('code', $likeOp, "%{$s}%")))
            ->when($request->boolean('active_only'), fn($q) => $q->active())
            ->withCount(['products', 'purchaseOrders as open_orders_count' => fn($q) => $q->whereIn('status', PurchaseOrder::OPEN_STATUSES)])
            ->orderBy('name')
            ->get();

        return response()->json(['success' => true, 'data' => $suppliers]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $companyId = $request->user()->company_id;

        $supplier = Supplier::create([...$this->validated($request, $companyId), 'company_id' => $companyId]);

        return response()->json(['success' => true, 'data' => $supplier, 'message' => 'Tedarikçi oluşturuldu.'], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $companyId = $request->user()->company_id;
        $supplier  = Supplier::forCompany($companyId)->findOrFail($id);

        $supplier->update($this->validated($request, $companyId, $supplier->id));

        return response()->json(['success' => true, 'data' => $supplier->fresh(), 'message' => 'Tedarikçi güncellendi.']);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $supplier = Supplier::forCompany($request->user()->company_id)->findOrFail($id);

        if ($supplier->purchaseOrders()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Siparişi olan tedarikçi silinemez; pasife alın.',
            ], 422);
        }

        $supplier->delete();

        return response()->json(['success' => true, 'message' => 'Tedarikçi silindi.']);
    }

    // ─── Performans ─────────────────────────────────────────────────

    public function performance(Request $request, SupplierPerformanceService $performance): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);
        $data = $request->validate(['days' => ['nullable', Rule::in([90, 180, 365])]]);

        return response()->json([
            'success' => true,
            'data'    => $performance->analyze($request->user()->company_id, (int) ($data['days'] ?? 180)),
        ]);
    }

    /** Beyan edilen teslim süresini gerçekleşen ortalamayla günceller (risk / sipariş önerisi bunu kullanır). */
    public function applyActualLeadTime(Request $request, string $id, SupplierPerformanceService $performance): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $data = $request->validate(['days' => ['nullable', Rule::in([90, 180, 365])]]);

        $supplier = $performance->applyActualLeadTime($request->user()->company_id, $id, (int) ($data['days'] ?? 180));

        return response()->json([
            'success' => true,
            'data'    => $supplier,
            'message' => "{$supplier->name} tedarik süresi {$supplier->default_lead_time_days} gün olarak güncellendi.",
        ]);
    }

    private function validated(Request $request, string $companyId, ?string $ignoreId = null): array
    {
        $required = $ignoreId ? 'sometimes' : 'required';

        return $request->validate([
            'name'                   => [$required, 'string', 'max:255'],
            'code'                   => [$required, 'string', 'max:30', 'alpha_dash',
                Rule::unique('suppliers', 'code')->where('company_id', $companyId)->whereNull('deleted_at')->ignore($ignoreId)],
            'contact_name'           => ['nullable', 'string', 'max:255'],
            'phone'                  => ['nullable', 'string', 'max:50'],
            'email'                  => ['nullable', 'email', 'max:255'],
            'tax_number'             => ['nullable', 'string', 'max:50'],
            'address'                => ['nullable', 'string', 'max:500'],
            'default_lead_time_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'notes'                  => ['nullable', 'string', 'max:2000'],
            'is_active'              => ['nullable', 'boolean'],
        ], [
            'code.unique'     => 'Bu tedarikçi kodu zaten kullanılıyor.',
            'code.alpha_dash' => 'Kod sadece harf, rakam, - ve _ içerebilir.',
        ]);
    }

    private function authorizePerm(Request $request, string $permission): void
    {
        abort_unless($request->user()->hasPermission($permission), 403);
        abort_unless($request->user()->company_id, 422, 'Bu hesap bir şirkete bağlı değil. Şirket kullanıcısıyla giriş yapın.');
    }
}
