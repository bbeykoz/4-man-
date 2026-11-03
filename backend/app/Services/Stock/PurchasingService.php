<?php

namespace App\Services\Stock;

use App\Exceptions\StockException;
use App\Models\Modules\WarehouseRecord;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseOrderReceipt;
use App\Models\PurchaseOrderReceiptItem;
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
        private readonly StockMetricsService $metrics,
    ) {}

    // ─── Öneriler ───────────────────────────────────────────────────

    /** Sipariş gereken ürünler; öneri miktarı risk hesabıyla aynı (tek kaynak). */
    public function suggestions(string $companyId, ?string $warehouseId = null): Collection
    {
        $review = (int) config('stock.review_period_days', 7);

        $rows = $this->risk->assessCompany($companyId, $warehouseId)
            ->filter(fn($r) => $r['suggested_order_qty'] > 0 && in_array($r['driver'], ['stockout', 'below_min', 'reorder'], true));

        // İhtiyacın hangi depoda olduğu hesaplanır: öneri tek bir "varsayılan depoya"
        // teslim ediliyordu ve kullanıcı yanlış depoya sipariş verebiliyordu.
        $needs = $this->warehouseNeeds($companyId, $rows, $review, $warehouseId);

        return $rows
            ->map(fn($r) => [
                ...($needs[$r['product_id']] ?? ['need_warehouse_id' => null, 'need_warehouse_name' => null, 'warehouse_breakdown' => []]),
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
     * Her öneri için ihtiyacın yoğunlaştığı depoyu bulur.
     *
     * Depo bazında hedef stok = o depodaki günlük tüketim × (tedarik + gözden geçirme)
     * + güvenlik stoğu payı. Açığı en büyük depo teslim için önerilir.
     *
     * @param Collection<int|string, array> $rows
     * @return array<string, array{need_warehouse_id: ?string, need_warehouse_name: ?string, warehouse_breakdown: array}>
     */
    private function warehouseNeeds(string $companyId, Collection $rows, int $review, ?string $warehouseId): array
    {
        if ($rows->isEmpty()) {
            return [];
        }

        $ids        = $rows->pluck('product_id')->all();
        $byProduct  = $rows->keyBy('product_id');
        $warehouses = Warehouse::forCompany($companyId)
            ->when($warehouseId, fn($q) => $q->whereKey($warehouseId))
            ->where('is_active', true)
            ->orderByDesc('is_default')
            ->get(['id', 'name']);

        $sonuc = [];

        foreach ($warehouses as $w) {
            $metrics = $this->metrics->forProducts($companyId, $w->id, $ids);

            foreach ($ids as $pid) {
                $m = $metrics[$pid] ?? null;
                if (!$m) {
                    continue;
                }

                $r        = $byProduct[$pid];
                $gunluk   = (float) ($m['daily_consumption_exact'] ?? $m['daily_consumption']);
                $mevcut   = (float) $m['available'] + (float) $m['on_order'];
                $hedef    = $gunluk > 0
                    ? $gunluk * ((int) $r['lead_time_days'] + $review) + (float) $r['safety_stock']
                    : (float) $r['safety_stock'];
                $acik     = round(max(0, $hedef - $mevcut), 3);

                $sonuc[$pid]['warehouse_breakdown'][] = [
                    'warehouse_id'   => $w->id,
                    'warehouse_name' => $w->name,
                    'available'      => (float) $m['available'],
                    'daily'          => round($gunluk, 3),
                    'shortfall'      => $acik,
                ];
            }
        }

        foreach ($sonuc as $pid => $veri) {
            $satirlar = collect($veri['warehouse_breakdown'])->sortByDesc('shortfall')->values();
            $enAcik   = $satirlar->first();
            // Hiçbir depoda açık yoksa yönlendirme yapılmaz; kullanıcı kendi seçer
            $hedefDepo = $enAcik && $enAcik['shortfall'] > 0 ? $enAcik : null;

            $sonuc[$pid] = [
                'need_warehouse_id'   => $hedefDepo['warehouse_id'] ?? null,
                'need_warehouse_name' => $hedefDepo['warehouse_name'] ?? null,
                'warehouse_breakdown' => $satirlar->filter(fn($x) => $x['shortfall'] > 0 || $x['available'] > 0)->values()->all(),
            ];
        }

        return $sonuc;
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

    // ─── Teslimat reddi ─────────────────────────────────────────────

    /**
     * Teslim alınan bir partinin reddedilmesini siparişe işler.
     *
     * Kalite kontrolde "Reddet" seçilince ya da teslimatın stok giriş kaydı iptal
     * edilince çağrılır. Reddedilen miktar teslim alınandan düşülür, ayrı bir
     * sayaçta tutulur ve sipariş yeniden açılır; böylece sipariş kabul edilmeyen
     * malı "teslim alındı" saymaz ve tedarikçi performansı doğru hesaplanır.
     */
    public function rejectReceipt(WarehouseRecord $record, ?string $reason = null): void
    {
        $receiptItem = PurchaseOrderReceiptItem::where('record_id', $record->id)->first();

        if (!$receiptItem || $receiptItem->rejected_at) {
            return; // satın almayla ilgisi yok ya da zaten reddedilmiş
        }

        DB::transaction(function () use ($receiptItem, $reason) {
            $miktar = (float) $receiptItem->quantity;

            $receiptItem->update([
                'rejected_quantity' => $miktar,
                'rejection_reason'  => $reason,
                'rejected_at'       => now(),
            ]);

            $item = $receiptItem->item;
            if (!$item) {
                return;
            }

            $item->update([
                'received_qty' => max(0, round($item->received_qty - $miktar, 3)),
                'rejected_qty' => round($item->rejected_qty + $miktar, 3),
            ]);

            $po = $item->purchaseOrder;
            if (!$po || $po->status === PurchaseOrder::STATUS_CANCELLED) {
                return;
            }

            // Eksik kalan miktar yeniden beklenir hâle gelir
            $kalanVar = $po->items()->get()->contains(fn(PurchaseOrderItem $i) => $i->remainingQty() > 0);

            $po->update([
                'status'      => $kalanVar
                    ? ($po->receipts()->exists() ? PurchaseOrder::STATUS_PARTIAL : PurchaseOrder::STATUS_SENT)
                    : PurchaseOrder::STATUS_RECEIVED,
                'received_at' => $kalanVar ? null : $po->received_at,
            ]);
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

    /**
     * Öneri gerekçesi: "Son 30 günlük tüketim, 12 günlük tedarik süresi … dikkate alındı."
     *
     * Metin gerçekte kullanılan hesabı yazar. Yeni üründe pencere 30 gün değil,
     * ürünün yaşı kadardır (en az min_consumption_days); eski üründe 30/90 günlük
     * ağırlıklı ortalama kullanılır. Eskiden her durumda "son 30 gün" yazıyordu.
     */
    private function reason(array $r, int $review): string
    {
        $parts = [];
        if ($r['daily_consumption'] > 0) {
            $gunluk = rtrim(rtrim(number_format($r['daily_consumption'], 1, ',', '.'), '0'), ',');
            $kisa   = (int) config('stock.consumption_short_window', 30);
            $uzun   = (int) config('stock.consumption_long_window', 90);
            $pencere = (int) ($r['consumption_days'] ?? $kisa);

            $parts[] = ($r['consumption_blended'] ?? false)
                ? "son {$kisa} ve {$uzun} günlük tüketimin ağırlıklı ortalaması (günde {$gunluk} {$r['unit']})"
                : "son {$pencere} günlük tüketim (günde {$gunluk} {$r['unit']})";
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
