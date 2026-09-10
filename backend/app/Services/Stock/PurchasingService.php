<?php

namespace App\Services\Stock;

use App\Exceptions\StockException;
use App\Models\Modules\WarehouseRecord;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseOrderReceipt;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Satın alma: otomatik öneri → (kullanıcı onayıyla) taslak sipariş → gönderim → teslim alma.
 * Teslim alınan sağlam miktar QC bekleyen stok girişi olarak karantinaya işlenir.
 */
class PurchasingService
{
    public function __construct(
        private readonly StockRiskService $risk,
        private readonly StockLedgerService $ledger,
    ) {}

    // ─── Öneriler ───────────────────────────────────────────────────

    /** Sipariş gereken ürünler; öneri miktarı risk hesabıyla aynı (tek kaynak). */
    public function suggestions(string $companyId, ?string $warehouseId = null): Collection
    {
        $review = (int) config('stock.review_period_days', 7);

        return $this->risk->assessCompany($companyId, $warehouseId)
            ->filter(fn($r) => $r['suggested_order_qty'] > 0 && in_array($r['driver'], ['stockout', 'below_min', 'reorder'], true))
            ->map(fn($r) => [
                'product_id'          => $r['product_id'],
                'name'                => $r['name'],
                'sku'                 => $r['sku'],
                'unit'                => $r['unit'],
                'supplier_id'         => $r['default_supplier_id'],
                'supplier_name'       => $r['supplier_name'],
                'available'           => $r['available'],
                'on_order'            => $r['on_order'],
                'daily_consumption'   => $r['daily_consumption'],
                'lead_time_days'      => $r['lead_time_days'],
                'lead_time_estimated' => $r['lead_time_estimated'],
                'safety_stock'        => $r['safety_stock'],
                'risk_score'          => $r['risk_score'],
                'risk_level'          => $r['risk_level'],
                'suggested_qty'       => $r['suggested_order_qty'],
                'unit_price'          => $r['unit_price'],
                'estimated_amount'    => $r['unit_price'] !== null ? round($r['suggested_order_qty'] * $r['unit_price'], 2) : null,
                'reason'              => $this->reason($r, $review),
            ])
            ->sortByDesc('risk_score')
            ->values();
    }

    /**
     * Seçilen öneri satırlarından tedarikçi başına bir taslak sipariş oluşturur.
     * @param array<int, array{product_id: string, quantity: float, supplier_id?: string}> $lines
     * @return Collection<int, PurchaseOrder>
     */
    public function createDraftsFromSuggestions(User $user, array $lines, string $warehouseId): Collection
    {
        $companyId   = $user->company_id;
        $suggestions = $this->suggestions($companyId)->keyBy('product_id');
        $warehouse   = $this->warehouse($companyId, $warehouseId);

        $bySupplier = collect($lines)->groupBy(function ($line) use ($suggestions) {
            $supplierId = $line['supplier_id'] ?? $suggestions[$line['product_id']]['supplier_id'] ?? null;
            if (!$supplierId) {
                throw new StockException('Tedarikçisi olmayan ürün var. Satırda tedarikçi seçin.');
            }
            return $supplierId;
        });

        return DB::transaction(fn() => $bySupplier->map(function (Collection $supplierLines, string $supplierId) use ($user, $warehouse, $suggestions) {
            $supplier = $this->supplier($user->company_id, $supplierId);
            $po = PurchaseOrder::create([
                'company_id'   => $user->company_id,
                'supplier_id'  => $supplier->id,
                'warehouse_id' => $warehouse->id,
                'status'       => PurchaseOrder::STATUS_DRAFT,
                'source'       => 'suggestion',
                'created_by'   => $user->id,
            ]);

            $this->syncItems($po, $supplierLines->map(fn($l) => [
                'product_id' => $l['product_id'],
                'quantity'   => (float) $l['quantity'],
                'suggestion' => isset($suggestions[$l['product_id']])
                    ? collect($suggestions[$l['product_id']])->only(['suggested_qty', 'daily_consumption', 'lead_time_days', 'safety_stock', 'available', 'on_order', 'reason'])->all()
                    : null,
            ])->all());

            return $po->fresh(['supplier', 'warehouse', 'items.product']);
        })->values());
    }

    // ─── Sipariş yaşam döngüsü ──────────────────────────────────────

    /** Manuel taslak oluşturma / taslak düzenleme. */
    public function saveDraft(User $user, array $data, ?PurchaseOrder $po = null): PurchaseOrder
    {
        if ($po && $po->status !== PurchaseOrder::STATUS_DRAFT) {
            throw new StockException('Sadece taslak siparişler düzenlenebilir.');
        }

        return DB::transaction(function () use ($user, $data, $po) {
            $supplier  = $this->supplier($user->company_id, $data['supplier_id'] ?? $po?->supplier_id);
            $warehouse = $this->warehouse($user->company_id, $data['warehouse_id'] ?? $po?->warehouse_id);

            $po ??= new PurchaseOrder([
                'company_id' => $user->company_id,
                'status'     => PurchaseOrder::STATUS_DRAFT,
                'source'     => 'manual',
                'created_by' => $user->id,
            ]);
            $po->fill([
                'supplier_id'   => $supplier->id,
                'warehouse_id'  => $warehouse->id,
                'expected_date' => $data['expected_date'] ?? $po->expected_date,
                'notes'         => $data['notes'] ?? $po->notes,
            ])->save();

            if (isset($data['items'])) {
                $this->syncItems($po, $data['items']);
            }

            return $po->fresh(['supplier', 'warehouse', 'items.product']);
        });
    }

    public function send(User $user, PurchaseOrder $po, ?string $expectedDate = null): PurchaseOrder
    {
        if ($po->status !== PurchaseOrder::STATUS_DRAFT) {
            throw new StockException('Sadece taslak sipariş gönderilebilir.');
        }
        if (!$po->items()->exists()) {
            throw new StockException('Siparişte kalem yok.');
        }

        $leadTime = $this->orderLeadTime($po);

        $po->update([
            'status'        => PurchaseOrder::STATUS_SENT,
            'order_date'    => now()->toDateString(),
            'expected_date' => $expectedDate ?? $po->expected_date?->toDateString() ?? now()->addDays($leadTime)->toDateString(),
            'sent_at'       => now(),
            'sent_by'       => $user->id,
        ]);

        return $po->fresh(['supplier', 'warehouse', 'items.product']);
    }

    /** Taslak/gönderilmiş: iptal. Kısmi teslim: kalan kapatılır (teslim alınan korunur). */
    public function cancel(PurchaseOrder $po): PurchaseOrder
    {
        return match ($po->status) {
            PurchaseOrder::STATUS_DRAFT, PurchaseOrder::STATUS_SENT => tap($po)->update([
                'status'       => PurchaseOrder::STATUS_CANCELLED,
                'cancelled_at' => now(),
            ]),
            PurchaseOrder::STATUS_PARTIAL => tap($po)->update([
                'status'       => PurchaseOrder::STATUS_RECEIVED,
                'received_at'  => now(),
                'cancelled_at' => now(), // kalan miktar iptal edildi
            ]),
            default => throw new StockException('Bu sipariş iptal edilemez.'),
        };
    }

    /**
     * Teslim alma. Sağlam miktar için stok girişi oluşturulur ve stoğa (karantina) işlenir;
     * QC onaylanınca kullanılabilir stoğa geçer. Hasarlı miktar stoğa girmez.
     * @param array<int, array{item_id: string, quantity?: float, damaged_quantity?: float, lot_number?: ?string, expiry_date?: ?string}> $lines
     */
    public function receive(User $user, PurchaseOrder $po, array $lines, ?string $note = null): PurchaseOrder
    {
        if (!in_array($po->status, PurchaseOrder::OPEN_STATUSES, true)) {
            throw new StockException('Sadece gönderilmiş siparişler teslim alınabilir.');
        }

        return DB::transaction(function () use ($user, $po, $lines, $note) {
            $po    = PurchaseOrder::whereKey($po->id)->lockForUpdate()->first();
            $items = $po->items()->with('product')->get()->keyBy('id');

            $receipt = PurchaseOrderReceipt::create([
                'purchase_order_id' => $po->id,
                'received_at'       => now(),
                'received_by'       => $user->id,
                'note'              => $note,
            ]);

            $any = false;
            foreach ($lines as $line) {
                /** @var PurchaseOrderItem|null $item */
                $item    = $items->get($line['item_id']);
                $good    = round((float) ($line['quantity'] ?? 0), 3);
                $damaged = round((float) ($line['damaged_quantity'] ?? 0), 3);

                if (!$item) {
                    throw new StockException('Sipariş kalemi bulunamadı.');
                }
                if ($good + $damaged <= 0) {
                    continue;
                }
                if ($good + $damaged > $item->remainingQty() + 0.0005) {
                    throw new StockException(
                        "{$item->product->name}: kalan {$item->remainingQty()} {$item->product->unit}, teslim girilen " . ($good + $damaged) . '.'
                    );
                }

                $record = null;
                if ($good > 0) {
                    $record = WarehouseRecord::create([
                        'company_id'       => $po->company_id,
                        'created_by'       => $user->id,
                        'updated_by'       => $user->id,
                        'title'            => "{$po->po_number} teslimi — {$item->product->name}",
                        'type'             => 'stock_in',
                        'status'           => 'approved',
                        'approved_by'      => $user->id,
                        'priority'         => 'medium',
                        'product_id'       => $item->product_id,
                        'product_name'     => $item->product->name,
                        'sku'              => $item->product->sku,
                        'quantity'         => $good,
                        'unit'             => $item->product->unit,
                        'warehouse_id'     => $po->warehouse_id,
                        'batch_number'     => $line['lot_number'] ?? null,
                        'expiry_date'      => $line['expiry_date'] ?? null,
                        'transaction_date' => now()->toDateString(),
                        'qc_status'        => WarehouseRecord::QC_PENDING,
                        'meta'             => ['purchase_order_id' => $po->id, 'po_number' => $po->po_number, 'receipt_id' => $receipt->id],
                    ]);
                    $this->ledger->post($record, $user);
                }

                $receipt->items()->create([
                    'purchase_order_item_id' => $item->id,
                    'quantity'               => $good,
                    'damaged_quantity'       => $damaged,
                    'lot_number'             => $line['lot_number'] ?? null,
                    'expiry_date'            => $line['expiry_date'] ?? null,
                    'record_id'              => $record?->id,
                ]);

                $item->update([
                    'received_qty' => $item->received_qty + $good,
                    'damaged_qty'  => $item->damaged_qty + $damaged,
                ]);
                $any = true;
            }

            if (!$any) {
                throw new StockException('Teslim alınacak miktar girilmedi.');
            }

            $complete = $po->items()->get()->every(fn(PurchaseOrderItem $i) => $i->remainingQty() <= 0);
            $po->update([
                'status'      => $complete ? PurchaseOrder::STATUS_RECEIVED : PurchaseOrder::STATUS_PARTIAL,
                'received_at' => $complete ? now() : null,
            ]);

            return $po->fresh(['supplier', 'warehouse', 'items.product', 'receipts.items']);
        });
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /** @param array<int, array{product_id: string, quantity: float, unit_price?: ?float, suggestion?: ?array}> $items */
    private function syncItems(PurchaseOrder $po, array $items): void
    {
        $products = WarehouseProduct::forCompany($po->company_id)
            ->whereIn('id', collect($items)->pluck('product_id'))
            ->get()
            ->keyBy('id');

        $po->items()->delete();
        foreach (collect($items)->groupBy('product_id') as $productId => $rows) {
            $product = $products->get($productId) ?? throw new StockException('Ürün bulunamadı.');
            $qty     = round((float) $rows->sum('quantity'), 3);
            if ($qty <= 0) {
                throw new StockException("{$product->name}: miktar sıfırdan büyük olmalı.");
            }

            $po->items()->create([
                'product_id' => $product->id,
                'quantity'   => $qty,
                'unit_price' => $rows->first()['unit_price'] ?? $product->unit_price,
                'suggestion' => $rows->first()['suggestion'] ?? null,
            ]);
        }

        $po->recalculateTotal();
    }

    private function orderLeadTime(PurchaseOrder $po): int
    {
        $productLead = $po->items()->with('product')->get()->map(fn($i) => $i->product?->lead_time_days)->filter()->max();

        return (int) ($productLead ?? $po->supplier?->default_lead_time_days ?? config('stock.default_lead_time_days', 7));
    }

    private function supplier(string $companyId, ?string $id): Supplier
    {
        return ($id ? Supplier::forCompany($companyId)->active()->find($id) : null)
            ?? throw new StockException('Geçerli ve aktif bir tedarikçi seçin.');
    }

    private function warehouse(string $companyId, ?string $id): Warehouse
    {
        return ($id ? Warehouse::forCompany($companyId)->active()->find($id) : Warehouse::defaultFor($companyId))
            ?? throw new StockException('Teslim deposu bulunamadı.');
    }

    /** Belgedeki gibi: "Son 30 günlük tüketim, 12 günlük tedarik süresi ve 100 adet güvenlik stoğu dikkate alındı." */
    private function reason(array $r, int $review): string
    {
        $window = (int) config('stock.consumption_short_window', 30);
        $parts  = [];
        if ($r['daily_consumption'] > 0) {
            $parts[] = "son {$window} günlük tüketim (günde " . rtrim(rtrim(number_format($r['daily_consumption'], 1, ',', '.'), '0'), ',') . " {$r['unit']})";
        }
        $parts[] = "{$r['lead_time_days']} günlük tedarik süresi" . ($r['lead_time_estimated'] ? ' (tahmini)' : '') . " + {$review} gün gözden geçirme";
        if ($r['safety_stock'] > 0) {
            $parts[] = rtrim(rtrim(number_format($r['safety_stock'], 1, ',', '.'), '0'), ',') . " {$r['unit']} güvenlik stoğu";
        }
        if ($r['on_order'] > 0) {
            $parts[] = "yoldaki {$r['on_order']} {$r['unit']} sipariş";
        }

        return ucfirst(implode(', ', $parts)) . ' dikkate alındı.';
    }
}
