<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Services\ActivityLogService;
use App\Services\Stock\PurchasingService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Satın alma siparişleri ve otomatik sipariş önerileri. */
class PurchaseOrderController extends Controller
{
    private const VIEW_PERM   = 'warehouse.records.view';
    private const CREATE_PERM = 'warehouse.records.create';
    private const EDIT_PERM   = 'warehouse.records.edit';
    private const RECEIPT_DISK = 'local';

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
            ->when($request->input('search'), fn($q, $s) => $q->where('po_number', DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like', "%{$s}%"))
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

    // ─── Fatura PDF'i ─────────────────────────────────────────────────

    private const STATUS_LABELS = [
        PurchaseOrder::STATUS_DRAFT     => 'Taslak',
        PurchaseOrder::STATUS_SENT      => 'Gönderildi',
        PurchaseOrder::STATUS_PARTIAL   => 'Kısmi Teslim',
        PurchaseOrder::STATUS_RECEIVED  => 'Teslim Alındı',
        PurchaseOrder::STATUS_CANCELLED => 'İptal',
    ];

    /** Siparişin tamamını (tüm kalemler + toplam) tek bir PDF fatura olarak anlık üretir. */
    public function invoicePdf(Request $request, string $id): Response
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $po      = $this->find($request, $id);
        $company = $request->user()->company;

        $pdf = Pdf::loadView('purchase-orders.invoice', [
            'po'          => $po,
            'company'     => $company,
            'statusLabel' => self::STATUS_LABELS[$po->status] ?? $po->status,
        ])->setPaper('a4');

        return $pdf->stream("fatura-{$po->po_number}.pdf");
    }

    // ─── Kalem fiş/faturası ─────────────────────────────────────────

    /** Sipariş kalemine fiş/fatura yükler (görsel veya PDF); varsa öncekini değiştirir. */
    public function uploadReceipt(Request $request, string $id, string $itemId): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);

        $request->validate([
            'receipt' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:10240'],
        ], [
            'receipt.required' => 'Fiş/fatura dosyası zorunlu.',
            'receipt.mimes'    => 'Sadece görsel (jpg, png, webp) veya PDF yükleyebilirsiniz.',
            'receipt.max'      => 'Dosya en fazla 10 MB olabilir.',
        ]);

        $user = $request->user();
        $item = $this->findItem($request, $id, $itemId);
        $file = $request->file('receipt');
        $path = $file->store("purchase-receipts/{$user->company_id}", self::RECEIPT_DISK);

        if ($item->receipt_path) {
            Storage::disk($item->receipt_disk ?? self::RECEIPT_DISK)->delete($item->receipt_path);
        }

        $item->update([
            'receipt_path'          => $path,
            'receipt_disk'          => self::RECEIPT_DISK,
            'receipt_original_name' => $file->getClientOriginalName(),
            'receipt_mime'          => $file->getClientMimeType(),
            'receipt_uploaded_at'   => now(),
            'receipt_uploaded_by'   => $user->id,
        ]);

        $this->activityLog->log('purchase_order.receipt_uploaded', $item->purchaseOrder, $user, newValues: ['item_id' => $itemId]);

        return response()->json([
            'success' => true,
            'data'    => $this->present($this->find($request, $id)),
            'message' => 'Fiş/fatura yüklendi.',
        ]);
    }

    /** Kalemin fiş/fatura dosyasını yetkili kullanıcıya akıtır (herkese açık değil). */
    public function receiptFile(Request $request, string $id, string $itemId): StreamedResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $item = $this->findItem($request, $id, $itemId);
        abort_unless($item->receipt_path, 404);

        $disk = Storage::disk($item->receipt_disk ?? self::RECEIPT_DISK);
        abort_unless($disk->exists($item->receipt_path), 404);

        return $disk->response($item->receipt_path, $item->receipt_original_name, [
            'Content-Type'  => $item->receipt_mime ?? 'application/octet-stream',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    /** Kalemden fiş/faturayı kaldırır. */
    public function deleteReceipt(Request $request, string $id, string $itemId): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);

        $item = $this->findItem($request, $id, $itemId);

        if ($item->receipt_path) {
            Storage::disk($item->receipt_disk ?? self::RECEIPT_DISK)->delete($item->receipt_path);
        }

        $item->update([
            'receipt_path' => null, 'receipt_disk' => null, 'receipt_original_name' => null,
            'receipt_mime' => null, 'receipt_uploaded_at' => null, 'receipt_uploaded_by' => null,
        ]);

        return response()->json([
            'success' => true,
            'data'    => $this->present($this->find($request, $id)),
            'message' => 'Fiş/fatura kaldırıldı.',
        ]);
    }

    private function findItem(Request $request, string $id, string $itemId): PurchaseOrderItem
    {
        $po   = $this->find($request, $id);
        $item = $po->items->firstWhere('id', $itemId);
        abort_unless($item, 404);

        return $item;
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
            'supplier'      => $po->supplier ? [
                'id' => $po->supplier->id, 'name' => $po->supplier->name, 'code' => $po->supplier->code,
                'address' => $po->supplier->address, 'phone' => $po->supplier->phone,
                'email' => $po->supplier->email, 'tax_number' => $po->supplier->tax_number,
            ] : null,
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
                'receipt'      => $i->receipt_path ? [
                    'original_name' => $i->receipt_original_name,
                    'mime'          => $i->receipt_mime,
                    'uploaded_at'   => $i->receipt_uploaded_at?->toISOString(),
                ] : null,
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
