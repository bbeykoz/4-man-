<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\StockReservation;
use App\Services\ActivityLogService;
use App\Services\Stock\StockReservationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Booked: siparişe ayrılan stok.
 *
 * Kayıtlar stok çıkışı açıldığında kendiliğinden oluşur; buradan teslim edilir,
 * iptal edilir ya da eksik kalan rezerve tamamlanır.
 */
class StockReservationController extends Controller
{
    public function __construct(
        private readonly StockReservationService $reservations,
        private readonly ActivityLogService $activityLogService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless($this->canView($request), 403);

        $request->validate([
            'status'       => ['nullable', Rule::in(['open', 'delivered', 'cancelled', 'all'])],
            'product_id'   => ['nullable', 'uuid'],
            'warehouse_id' => ['nullable', 'uuid'],
            'search'       => ['nullable', 'string', 'max:100'],
        ]);

        $status = $request->input('status', 'open');

        $query = StockReservation::where('company_id', $request->user()->company_id)
            ->with(['product:id,name,sku,unit', 'warehouse:id,name', 'record:id,record_number,title,batch_number', 'createdBy:id,name'])
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->input('product_id')))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', $request->input('warehouse_id')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%' . $request->input('search') . '%';
                $q->where(fn ($sub) => $sub
                    ->where('reference', 'ilike', $term)
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'ilike', $term)->orWhere('sku', 'ilike', $term))
                    ->orWhereHas('record', fn ($r) => $r->where('record_number', 'ilike', $term)));
            })
            ->orderByRaw('CASE WHEN status = ? THEN 0 ELSE 1 END', [StockReservation::STATUS_OPEN])
            ->orderByDesc('created_at');

        $rows = $query->limit($request->integer('limit', 100))->get();

        return response()->json([
            'success' => true,
            'data'    => $rows->map(fn (StockReservation $r) => $this->toArray($r)),
            'summary' => $this->summary($request->user()->company_id),
        ]);
    }

    public function deliver(Request $request, string $id): JsonResponse
    {
        abort_unless($this->canManage($request), 403);

        $request->validate([
            'quantity' => ['nullable', 'numeric', 'gt:0'],
        ], ['quantity.gt' => 'Teslim miktarı sıfırdan büyük olmalıdır.']);

        $reservation = $this->find($request, $id);
        $updated     = $this->reservations->deliver($reservation, $request->user(), $request->input('quantity'));

        $this->activityLogService->log('warehouse.reservation.delivered', $updated->record, $request->user(), newValues: [
            'quantity' => $request->input('quantity'),
        ]);

        return response()->json([
            'success' => true,
            'data'    => $this->toArray($updated),
            'message' => $updated->status === StockReservation::STATUS_DELIVERED
                ? 'Sipariş teslim edildi.'
                : 'Kısmi teslimat kaydedildi.',
        ]);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        abort_unless($this->canManage($request), 403);

        $reservation = $this->find($request, $id);
        $updated     = $this->reservations->cancel($reservation, $request->user());

        $this->activityLogService->log('warehouse.reservation.cancelled', $updated->record, $request->user());

        return response()->json([
            'success' => true,
            'data'    => $this->toArray($updated),
            'message' => 'Rezerve iptal edildi, kalan miktar serbest stoğa döndü.',
        ]);
    }

    public function topUp(Request $request, string $id): JsonResponse
    {
        abort_unless($this->canManage($request), 403);

        $reservation = $this->find($request, $id);
        $added       = $this->reservations->topUp($reservation, $request->user());

        return response()->json([
            'success' => true,
            'data'    => $this->toArray($reservation->fresh(['product', 'warehouse', 'record', 'createdBy'])),
            'message' => "Rezerveye {$added} birim eklendi.",
        ]);
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    private function find(Request $request, string $id): StockReservation
    {
        return StockReservation::where('company_id', $request->user()->company_id)
            ->with(['record', 'product', 'warehouse'])
            ->findOrFail($id);
    }

    private function summary(string $companyId): array
    {
        $rows = StockReservation::where('company_id', $companyId)->open()->get();

        return [
            'open_count'     => $rows->count(),
            'reserved_total' => round($rows->sum(fn (StockReservation $r) => $r->remaining()), 3),
            'shortage_count' => $rows->filter(fn (StockReservation $r) => $r->shortage() > 0)->count(),
        ];
    }

    private function toArray(StockReservation $r): array
    {
        return [
            'id'                 => $r->id,
            'record_id'          => $r->record_id,
            'record_number'      => $r->record?->record_number,
            'record_title'       => $r->record?->title,
            'product_id'         => $r->product_id,
            'product_name'       => $r->product?->name,
            'sku'                => $r->product?->sku,
            'unit'               => $r->product?->unit,
            'warehouse_name'     => $r->warehouse?->name,
            'lot_number'         => $r->record?->batch_number,
            'quantity'           => $r->quantity,
            'reserved_quantity'  => $r->reserved_quantity,
            'delivered_quantity' => $r->delivered_quantity,
            'remaining'          => $r->remaining(),
            'shortage'           => $r->shortage(),
            'status'             => $r->status,
            'reference'          => $r->reference,
            'due_date'           => $r->due_date?->toDateString(),
            'created_by_name'    => $r->createdBy?->name,
            'created_at'         => $r->created_at?->toISOString(),
            'closed_at'          => $r->closed_at?->toISOString(),
        ];
    }

    private function canView(Request $request): bool
    {
        return $request->user()->hasAnyPermission(['warehouse.records.view', 'warehouse_control.records.view']);
    }

    private function canManage(Request $request): bool
    {
        return $request->user()->hasAnyPermission(['warehouse.records.edit', 'warehouse_control.records.edit']);
    }
}
