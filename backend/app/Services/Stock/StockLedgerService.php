<?php

namespace App\Services\Stock;

use App\Exceptions\StockException;
use App\Models\Modules\WarehouseRecord;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Stok defteri: onaylanan depo hareketlerini stock_movements'a işler.
 *
 * Kurallar:
 * - Kayıt onaylanınca işlenir (post), iptal edilince ters kayıtla geri alınır (reverse).
 * - Kalite kontrolü bekleyen girişler karantinaya, QC onayında kullanılabilir stoğa geçer.
 * - Çıkışlar lot seçilmediyse FEFO ile (SKT'si en yakın lot önce) dağıtılır.
 * - Hiçbir kova (available/quarantine/damaged/reserved) eksiye düşemez.
 */
class StockLedgerService
{
    private const EPSILON = 0.0005;

    // ─── Kayıt işleme ───────────────────────────────────────────────

    public function post(WarehouseRecord $record, User $user): void
    {
        if ($record->isPosted() || !$record->product_id || $record->type === 'inspection') {
            return; // zaten işlenmiş / ürünsüz kayıt / stok etkisi olmayan denetim
        }

        if ($record->reversed_at) {
            throw new StockException('Stoğu geri alınmış kayıt tekrar işlenemez. Yeni kayıt oluşturun.');
        }

        $qty = (float) $record->quantity;
        if ($record->type !== 'stock_count' && $qty <= 0) {
            throw new StockException('Stoğa işlemek için miktar girilmelidir.');
        }

        DB::transaction(function () use ($record, $user, $qty) {
            $product   = $this->lockProduct($record);
            $warehouse = $this->resolveWarehouse($record);
            $base      = $this->baseRow($record, $user, $warehouse->id);

            match ($record->type) {
                'stock_in', 'return_in' => $this->insert($base, [
                    'movement_type' => $record->type,
                    'bucket'        => $record->qc_status === WarehouseRecord::QC_PENDING
                        ? StockMovement::BUCKET_QUARANTINE
                        : StockMovement::BUCKET_AVAILABLE,
                    'quantity'      => $qty,
                    'lot_number'    => $record->batch_number,
                    'expiry_date'   => $record->expiry_date,
                ]),
                'stock_out'   => $this->takeOut($base, $product, $warehouse, $qty, $record->batch_number, 'stock_out'),
                'damage'      => $this->moveBetweenBuckets(
                    $base, $product, $warehouse, $qty, $record->batch_number,
                    StockMovement::BUCKET_AVAILABLE, StockMovement::BUCKET_DAMAGED, 'damage'
                ),
                'transfer'    => $this->transfer($base, $record, $product, $warehouse, $qty),
                'adjustment'  => $this->adjust($base, $record, $product, $warehouse, $qty),
                'stock_count' => $this->count($base, $record, $product, $warehouse, $qty),
                default       => throw new StockException("'{$record->type}' hareket tipi stoğa işlenemez."),
            };

            $record->forceFill([
                'warehouse_id' => $warehouse->id,
                'posted_at'    => now(),
                'reversed_at'  => null,
            ])->save();

            $this->syncProductStock($product);
        });
    }

    /** İptal: kaydın tüm defter satırlarını ters kayıtla sıfırlar. */
    public function reverse(WarehouseRecord $record, User $user): void
    {
        if (!$record->isPosted()) {
            return;
        }

        DB::transaction(function () use ($record, $user) {
            $product = $this->lockProduct($record);
            $rows    = StockMovement::where('record_id', $record->id)->get();

            foreach ($rows as $row) {
                StockMovement::create([
                    ...$row->only(['company_id', 'product_id', 'warehouse_id', 'record_id', 'bucket', 'lot_number', 'expiry_date', 'unit_cost']),
                    'movement_type' => 'reversal',
                    'quantity'      => -$row->quantity,
                    'occurred_at'   => now(),
                    'created_by'    => $user->id,
                    'note'          => "{$record->record_number} iptali",
                ]);
            }

            // Geri alma bir lotu eksiye düşürüyorsa stok zaten kullanılmıştır
            foreach ($rows->unique(fn($r) => "{$r->warehouse_id}|{$r->bucket}|{$r->lot_number}") as $row) {
                $balance = (float) StockMovement::where('company_id', $record->company_id)
                    ->where('product_id', $row->product_id)
                    ->where('warehouse_id', $row->warehouse_id)
                    ->where('bucket', $row->bucket)
                    ->where(fn($q) => $row->lot_number === null
                        ? $q->whereNull('lot_number')
                        : $q->where('lot_number', $row->lot_number))
                    ->sum('quantity');
                if ($balance < -self::EPSILON) {
                    throw new StockException(
                        'Bu kaydın stoğu sonraki hareketlerde kullanılmış; iptal edilemez. Önce bağlı çıkışları iptal edin.'
                    );
                }
            }

            $record->forceFill(['reversed_at' => now()])->save();
            $this->syncProductStock($product);
        });
    }

    /** Kalite kontrol onayı: karantinadaki giriş miktarını kullanılabilir stoğa taşır. */
    public function releaseQuarantine(WarehouseRecord $record, User $user): void
    {
        if (!$record->isPosted() || !in_array($record->type, ['stock_in', 'return_in'], true)) {
            return;
        }

        DB::transaction(function () use ($record, $user) {
            $product    = $this->lockProduct($record);
            $quarantine = StockMovement::where('record_id', $record->id)
                ->where('bucket', StockMovement::BUCKET_QUARANTINE)
                ->get();

            foreach ($quarantine->groupBy(fn($r) => "{$r->warehouse_id}|{$r->lot_number}|{$r->expiry_date?->toDateString()}") as $group) {
                $qty = $group->sum('quantity');
                if ($qty <= self::EPSILON) {
                    continue;
                }
                $first = $group->first();
                $base  = $this->baseRow($record, $user, $first->warehouse_id);
                $lot   = ['lot_number' => $first->lot_number, 'expiry_date' => $first->expiry_date];

                $this->insert($base, [...$lot, 'movement_type' => 'qc_release', 'bucket' => StockMovement::BUCKET_QUARANTINE, 'quantity' => -$qty]);
                $this->insert($base, [...$lot, 'movement_type' => 'qc_release', 'bucket' => StockMovement::BUCKET_AVAILABLE, 'quantity' => $qty]);
            }

            $this->syncProductStock($product);
        });
    }

    /** Ürün kartında açılış stoğu (kayıtsız defter satırı). */
    public function opening(WarehouseProduct $product, float $qty, Warehouse $warehouse, User $user): void
    {
        if ($qty <= self::EPSILON) {
            return;
        }

        DB::transaction(function () use ($product, $qty, $warehouse, $user) {
            StockMovement::create([
                'company_id'    => $product->company_id,
                'product_id'    => $product->id,
                'warehouse_id'  => $warehouse->id,
                'movement_type' => 'opening',
                'bucket'        => StockMovement::BUCKET_AVAILABLE,
                'quantity'      => $qty,
                'unit_cost'     => $product->unit_price,
                'occurred_at'   => now(),
                'created_by'    => $user->id,
                'note'          => 'Açılış stoğu',
            ]);
            $this->syncProductStock($product);
        });
    }

    // ─── Bakiye sorguları ───────────────────────────────────────────

    public function balance(string $companyId, string $productId, ?string $warehouseId, string $bucket, ?string $lot = null): float
    {
        return (float) StockMovement::where('company_id', $companyId)
            ->where('product_id', $productId)
            ->when($warehouseId, fn($q) => $q->where('warehouse_id', $warehouseId))
            ->where('bucket', $bucket)
            ->when($lot !== null, fn($q) => $q->where('lot_number', $lot))
            ->sum('quantity');
    }

    /** Pozitif lot bakiyeleri, FEFO sırasıyla (SKT'si en yakın önce, SKT'siz en sona). */
    public function lotBalances(string $companyId, string $productId, string $warehouseId, string $bucket): Collection
    {
        // Not: SQLite'ta bound parametreli havingRaw('SUM(quantity) > ?', ...) sayısal
        // karşılaştırmayı tip uyuşmazlığı yüzünden hep başarısız yapıyordu (satır hiç
        // dönmüyordu). Sıfır/negatif bakiyeleri SQL yerine burada eleyerek çözüyoruz;
        // lot sayısı ürün+depo başına zaten küçük olduğu için maliyeti yok.
        return StockMovement::where('company_id', $companyId)
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->where('bucket', $bucket)
            ->groupBy('lot_number', 'expiry_date')
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC, lot_number ASC')
            ->get(['lot_number', 'expiry_date', DB::raw('SUM(quantity) as qty')])
            ->map(fn($r) => [
                'lot_number'  => $r->lot_number,
                'expiry_date' => $r->expiry_date ? substr((string) $r->expiry_date, 0, 10) : null,
                'qty'         => (float) $r->qty,
            ])
            ->filter(fn($row) => $row['qty'] > self::EPSILON)
            ->values();
    }

    // ─── Hareket tipleri ────────────────────────────────────────────

    private function takeOut(array $base, WarehouseProduct $product, Warehouse $warehouse, float $qty, ?string $lot, string $type): void
    {
        foreach ($this->allocate($product, $warehouse, StockMovement::BUCKET_AVAILABLE, $qty, $lot) as $slice) {
            $this->insert($base, [
                'movement_type' => $type,
                'bucket'        => StockMovement::BUCKET_AVAILABLE,
                'quantity'      => -$slice['qty'],
                'lot_number'    => $slice['lot_number'],
                'expiry_date'   => $slice['expiry_date'],
            ]);
        }
    }

    private function moveBetweenBuckets(
        array $base, WarehouseProduct $product, Warehouse $warehouse, float $qty, ?string $lot,
        string $from, string $to, string $type
    ): void {
        foreach ($this->allocate($product, $warehouse, $from, $qty, $lot) as $slice) {
            $lotData = ['lot_number' => $slice['lot_number'], 'expiry_date' => $slice['expiry_date']];
            $this->insert($base, [...$lotData, 'movement_type' => $type, 'bucket' => $from, 'quantity' => -$slice['qty']]);
            $this->insert($base, [...$lotData, 'movement_type' => $type, 'bucket' => $to,   'quantity' => $slice['qty']]);
        }
    }

    private function transfer(array $base, WarehouseRecord $record, WarehouseProduct $product, Warehouse $source, float $qty): void
    {
        $target = $record->to_warehouse_id
            ? Warehouse::forCompany($record->company_id)->find($record->to_warehouse_id)
            : null;

        if (!$target) {
            throw new StockException('Transfer için hedef depo seçilmelidir.');
        }
        if ($target->id === $source->id) {
            throw new StockException('Kaynak ve hedef depo aynı olamaz.');
        }

        foreach ($this->allocate($product, $source, StockMovement::BUCKET_AVAILABLE, $qty, $record->batch_number) as $slice) {
            $lotData = ['lot_number' => $slice['lot_number'], 'expiry_date' => $slice['expiry_date'], 'bucket' => StockMovement::BUCKET_AVAILABLE];
            $this->insert($base, [...$lotData, 'movement_type' => 'transfer_out', 'quantity' => -$slice['qty']]);
            $this->insert([...$base, 'warehouse_id' => $target->id], [...$lotData, 'movement_type' => 'transfer_in', 'quantity' => $slice['qty']]);
        }
    }

    private function adjust(array $base, WarehouseRecord $record, WarehouseProduct $product, Warehouse $warehouse, float $qty): void
    {
        if ($record->direction === 'increase') {
            $this->insert($base, [
                'movement_type' => 'adjustment',
                'bucket'        => StockMovement::BUCKET_AVAILABLE,
                'quantity'      => $qty,
                'lot_number'    => $record->batch_number,
                'expiry_date'   => $record->expiry_date,
            ]);
            return;
        }

        if ($record->direction !== 'decrease') {
            throw new StockException('Düzeltme kaydında yön (artış / azalış) seçilmelidir.');
        }

        $this->takeOut($base, $product, $warehouse, $qty, $record->batch_number, 'adjustment');
    }

    /** Sayım: sayılan miktar ile sistem stoğu arasındaki fark defterlenir. */
    private function count(array $base, WarehouseRecord $record, WarehouseProduct $product, Warehouse $warehouse, float $counted): void
    {
        $system = $this->balance($record->company_id, $product->id, $warehouse->id, StockMovement::BUCKET_AVAILABLE, $record->batch_number);
        $diff   = round($counted - $system, 3);

        $record->forceFill(['system_quantity' => $system])->save();

        if ($diff > self::EPSILON) {
            $this->insert($base, [
                'movement_type' => 'count_adjustment',
                'bucket'        => StockMovement::BUCKET_AVAILABLE,
                'quantity'      => $diff,
                'lot_number'    => $record->batch_number,
                'expiry_date'   => $record->expiry_date,
            ]);
        } elseif ($diff < -self::EPSILON) {
            $this->takeOut($base, $product, $warehouse, -$diff, $record->batch_number, 'count_adjustment');
        }
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /**
     * Miktarı lotlara böler. Lot verilmişse sadece o lot, yoksa FEFO.
     * @return array<int, array{lot_number: ?string, expiry_date: ?string, qty: float}>
     */
    private function allocate(WarehouseProduct $product, Warehouse $warehouse, string $bucket, float $qty, ?string $lot): array
    {
        $lots = $this->lotBalances($product->company_id, $product->id, $warehouse->id, $bucket);
        if ($lot) {
            $lots = $lots->where('lot_number', $lot)->values();
        }

        $slices    = [];
        $remaining = $qty;
        foreach ($lots as $l) {
            if ($remaining <= self::EPSILON) {
                break;
            }
            $take        = min($remaining, $l['qty']);
            $slices[]    = [...$l, 'qty' => round($take, 3)];
            $remaining  -= $take;
        }

        if ($remaining > self::EPSILON) {
            $available = round($lots->sum('qty'), 3);
            $unit      = $product->unit ?: 'adet';
            $scope     = $lot ? "{$lot} lotunda" : '';
            throw new StockException(
                "Yetersiz stok: {$warehouse->name} deposunda {$scope} {$this->bucketLabel($bucket)} {$this->fmt($available)} {$unit} var, " .
                "istenen {$this->fmt($qty)} {$unit}."
            );
        }

        return $slices;
    }

    private function lockProduct(WarehouseRecord $record): WarehouseProduct
    {
        $product = WarehouseProduct::whereKey($record->product_id)
            ->where('company_id', $record->company_id)
            ->lockForUpdate()
            ->first();

        if (!$product) {
            throw new StockException('Kayıttaki ürün bulunamadı.');
        }

        return $product;
    }

    private function resolveWarehouse(WarehouseRecord $record): Warehouse
    {
        $warehouse = $record->warehouse_id
            ? Warehouse::forCompany($record->company_id)->find($record->warehouse_id)
            : Warehouse::defaultFor($record->company_id);

        if (!$warehouse) {
            throw new StockException('Depo bulunamadı. Önce bir depo tanımlayın.');
        }
        if (!$warehouse->is_active) {
            throw new StockException("{$warehouse->name} deposu pasif; hareket işlenemez.");
        }

        return $warehouse;
    }

    private function baseRow(WarehouseRecord $record, User $user, string $warehouseId): array
    {
        return [
            'company_id'   => $record->company_id,
            'product_id'   => $record->product_id,
            'warehouse_id' => $warehouseId,
            'record_id'    => $record->id,
            'occurred_at'  => $record->transaction_date ?? now(),
            'created_by'   => $user->id,
            'unit_cost'    => $record->product?->unit_price,
        ];
    }

    private function insert(array $base, array $row): void
    {
        StockMovement::create([...$base, ...$row]);
    }

    /** current_stock = tüm depolardaki kullanılabilir stok (mevcut ekranlar bununla çalışır). */
    private function syncProductStock(WarehouseProduct $product): void
    {
        $available = $this->balance($product->company_id, $product->id, null, StockMovement::BUCKET_AVAILABLE);
        $product->forceFill(['current_stock' => round($available, 3)])->saveQuietly();
    }

    private function bucketLabel(string $bucket): string
    {
        return match ($bucket) {
            StockMovement::BUCKET_AVAILABLE  => 'kullanılabilir',
            StockMovement::BUCKET_QUARANTINE => 'karantinada',
            StockMovement::BUCKET_DAMAGED    => 'hasarlı',
            StockMovement::BUCKET_RESERVED   => 'rezerve',
            default                          => $bucket,
        };
    }

    private function fmt(float $n): string
    {
        return rtrim(rtrim(number_format($n, 3, ',', '.'), '0'), ',');
    }
}
