<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Services\ActivityLogService;
use App\Services\Stock\PurchasingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Satın alma siparişleri ve otomatik sipariş önerileri. */
class PurchaseOrderController extends Controller
{
    private const VIEW_PERM   = 'warehouse.records.view';
    private const CREATE_PERM = 'warehouse.records.create';
    private const EDIT_PERM   = 'warehouse.records.edit';

    public function __construct(
        private readonly PurchasingService $purchasing,
        private readonly ActivityLogService $activityLog,
    ) {}

    public function suggestions(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        return response()->json([
            'success' => true,
            'data'    => $this->purchasing->suggestions($request->user()->company_id, $request->input('warehouse_id')),
        ]);
    }

    /** Seçilen önerilerden tedarikçi başına taslak sipariş (kullanıcı onayı). */
    public function fromSuggestions(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::CREATE_PERM);

        $data = $request->validate([
            'warehouse_id'        => ['nullable', 'uuid'],
            'lines'               => ['required', 'array', 'min:1'],
            'lines.*.product_id'  => ['required', 'uuid'],
            'lines.*.quantity'    => ['required', 'numeric', 'gt:0'],
            'lines.*.supplier_id' => ['nullable', 'uuid'],
        ], ['lines.required' => 'En az bir öneri seçin.']);

        $orders = $this->purchasing->createDraftsFromSuggestions($request->user(), $data['lines'], $data['warehouse_id'] ?? '');

        foreach ($orders as $po) {
            $this->activityLog->log('purchase_order.created', $po, $request->user(), newValues: ['source' => 'suggestion']);
        }

        return response()->json([
            'success' => true,
            'data'    => $orders->map(fn($po) => $this->present($po)),
            'message' => $orders->count() . ' taslak sipariş oluşturuldu.',
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $orders = PurchaseOrder::forCompany($request->user()->company_id)
            ->with(['supplier:id,name,code', 'warehouse:id,name'])
            ->withCount('items')
            ->when($request->input('status'), fn($q, $s) => $q->where('status', $s))
            ->when($request->input('supplier_id'), fn($q, $s) => $q->where('supplier_id', $s))
            ->when($request->input('search'), fn($q, $s) => $q->where('po_number', 'ilike', "%{$s}%"))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            'success' => true,
            'data'    => collect($orders->items())->map(fn($po) => $this->present($po, false)),
            'meta'    => ['current_page' => $orders->currentPage(), 'total' => $orders->total(), 'last_page' => $orders->lastPage()],
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        return response()->json(['success' => true, 'data' => $this->present($this->find($request, $id))]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::CREATE_PERM);
        $po = $this->purchasing->saveDraft($request->user(), $this->validated($request));
        $this->activityLog->log('purchase_order.created', $po, $request->user());

        return response()->json(['success' => true, 'data' => $this->present($po), 'message' => 'Taslak sipariş oluşturuldu.'], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $po = $this->purchasing->saveDraft($request->user(), $this->validated($request, true), $this->find($request, $id));

        return response()->json(['success' => true, 'data' => $this->present($po), 'message' => 'Sipariş güncellendi.']);
    }

    public function send(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $data = $request->validate(['expected_date' => ['nullable', 'date', 'after_or_equal:today']]);

        $po = $this->purchasing->send($request->user(), $this->find($request, $id), $data['expected_date'] ?? null);
        $this->activityLog->log('purchase_order.sent', $po, $request->user());

        return response()->json(['success' => true, 'data' => $this->present($po), 'message' => 'Sipariş tedarikçiye gönderildi.']);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $po = $this->purchasing->cancel($this->find($request, $id));
        $this->activityLog->log('purchase_order.cancelled', $po, $request->user());

        $message = $po->status === PurchaseOrder::STATUS_CANCELLED ? 'Sipariş iptal edildi.' : 'Kalan miktar iptal edildi, sipariş kapatıldı.';

        return response()->json(['success' => true, 'data' => $this->present($po->fresh(['supplier', 'warehouse', 'items.product'])), 'message' => $message]);
    }

    public function receive(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, self::CREATE_PERM);

        $data = $request->validate([
            'note'                     => ['nullable', 'string', 'max:500'],
            'lines'                    => ['required', 'array', 'min:1'],
            'lines.*.item_id'          => ['required', 'uuid'],
            'lines.*.quantity'         => ['nullable', 'numeric', 'min:0'],
            'lines.*.damaged_quantity' => ['nullable', 'numeric', 'min:0'],
            'lines.*.lot_number'       => ['nullable', 'string', 'max:100'],
            'lines.*.expiry_date'      => ['nullable', 'date'],
        ]);

        $po = $this->purchasing->receive($request->user(), $this->find($request, $id), $data['lines'], $data['note'] ?? null);
        $this->activityLog->log('purchase_order.received', $po, $request->user());

        return response()->json([
            'success' => true,
            'data'    => $this->present($po),
            'message' => 'Teslim alındı. Ürünler karantinada; kalite kontrol onayıyla kullanılabilir stoğa geçer.',
        ]);
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    private function find(Request $request, string $id): PurchaseOrder
    {
        return PurchaseOrder::forCompany($request->user()->company_id)
            ->with(['supplier', 'warehouse', 'items.product', 'receipts.items', 'receipts.receivedBy:id,name', 'createdBy:id,name'])
            ->findOrFail($id);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $companyId = $request->user()->company_id;
        $sometimes = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'supplier_id'        => [$sometimes, 'uuid', Rule::exists('suppliers', 'id')->where('company_id', $companyId)->whereNull('deleted_at')],
            'warehouse_id'       => ['nullable', 'uuid', Rule::exists('warehouses', 'id')->where('company_id', $companyId)->whereNull('deleted_at')],
            'expected_date'      => ['nullable', 'date'],
            'notes'              => ['nullable', 'string', 'max:2000'],
            'items'              => [$sometimes, 'array', 'min:1'],
            'items.*.product_id' => ['required', 'uuid', Rule::exists('warehouse_products', 'id')->where('company_id', $companyId)->whereNull('deleted_at')],
            'items.*.quantity'   => ['required', 'numeric', 'gt:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
        ], [
            'supplier_id.required' => 'Tedarikçi seçin.',
            'items.required'       => 'En az bir kalem ekleyin.',
        ]);
    }

    private function present(PurchaseOrder $po, bool $withItems = true): array
    {
        $data = [
            'id'            => $po->id,
            'po_number'     => $po->po_number,
            'status'        => $po->status,
            'source'        => $po->source,
            'supplier'      => $po->supplier ? ['id' => $po->supplier->id, 'name' => $po->supplier->name, 'code' => $po->supplier->code] : null,
            'warehouse'     => $po->warehouse ? ['id' => $po->warehouse->id, 'name' => $po->warehouse->name] : null,
            'order_date'    => $po->order_date?->toDateString(),
            'expected_date' => $po->expected_date?->toDateString(),
            'sent_at'       => $po->sent_at?->toISOString(),
            'received_at'   => $po->received_at?->toISOString(),
            'cancelled_at'  => $po->cancelled_at?->toISOString(),
            'is_late'       => in_array($po->status, PurchaseOrder::OPEN_STATUSES, true) && $po->expected_date?->isPast() && !$po->expected_date->isToday(),
            'total_amount'  => (float) $po->total_amount,
            'currency'      => $po->currency,
            'notes'         => $po->notes,
            'items_count'   => $po->items_count ?? $po->items?->count(),
            'created_at'    => $po->created_at?->toISOString(),
        ];

        if ($withItems) {
            $data['items'] = $po->items->map(fn(PurchaseOrderItem $i) => [
                'id'           => $i->id,
                'product_id'   => $i->product_id,
                'name'         => $i->product?->name,
                'sku'          => $i->product?->sku,
                'unit'         => $i->product?->unit,
                'quantity'     => $i->quantity,
                'unit_price'   => $i->unit_price !== null ? (float) $i->unit_price : null,
                'received_qty' => $i->received_qty,
                'damaged_qty'  => $i->damaged_qty,
                'remaining'    => $i->remainingQty(),
                'suggestion'   => $i->suggestion,
            ]);
            $data['receipts'] = $po->relationLoaded('receipts') ? $po->receipts->map(fn($r) => [
                'id'          => $r->id,
                'received_at' => $r->received_at?->toISOString(),
                'received_by' => $r->receivedBy?->name,
                'note'        => $r->note,
                'lines'       => $r->items->map(fn($ri) => $ri->only(['purchase_order_item_id', 'quantity', 'damaged_quantity', 'lot_number', 'record_id'])),
            ]) : [];
        }

        return $data;
    }

    private function authorizePerm(Request $request, string $permission): void
    {
        abort_unless($request->user()->hasPermission($permission), 403);
        abort_unless($request->user()->company_id, 422, 'Bu hesap bir şirkete bağlı değil. Şirket kullanıcısıyla giriş yapın.');
    }
}
