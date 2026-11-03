<?php

namespace App\Services\Stock;

use App\Exceptions\StockException;
use App\Models\Modules\WarehouseRecord;
use App\Models\StockReservation;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Booked (rezerve) akışı.
 *
 * Stok çıkışı kaydı açıldığında ürün serbest stoktan rezerveye alınır; böylece
 * verilen siparişler depodaki kullanılabilir stokla karışmaz. Teslim edildikçe
 * rezerveden düşer, iptalde kalan miktar serbest stoğa döner.
 */
class StockReservationService
{
    private const EPSILON = 0.0005;

    public function __construct(private readonly StockLedgerService $ledger) {}

    /**
     * Stok çıkışı kaydı için rezervasyon açar.
     * Serbest stok yetmezse bulabildiği kadarını ayırır; kalan "eksik" olarak görünür.
     */
    public function openFor(WarehouseRecord $record, User $user): ?StockReservation
    {
        if (!$this->isReservable($record)) {
            return null;
        }

        if (StockReservation::where('record_id', $record->id)->exists()) {
            return null;
        }

        $quantity = (float) $record->quantity;
        $reserved = $this->ledger->reserve($record, $user, $quantity);

        return StockReservation::create([
            'company_id'         => $record->company_id,
            'record_id'          => $record->id,
            'product_id'         => $record->product_id,
            'warehouse_id'       => $record->fresh()->warehouse_id ?? $record->warehouse_id,
            'quantity'           => $quantity,
            'reserved_quantity'  => $reserved,
            'delivered_quantity' => 0,
            'status'             => StockReservation::STATUS_OPEN,
            'reference'          => $record->to_location ?: $record->record_number,
            'due_date'           => $record->transaction_date,
            'created_by'         => $user->id,
        ]);
    }

    /** Serbest stok sonradan geldiğinde rezerveyi sipariş miktarına tamamlar. */
    public function topUp(StockReservation $reservation, User $user): float
    {
        $this->assertOpen($reservation);

        $missing = $reservation->shortage();
        if ($missing <= self::EPSILON) {
            throw new StockException('Bu sipariş için eksik rezerve yok.');
        }

        $added = $this->ledger->reserve($reservation->record, $user, $missing);

        if ($added <= self::EPSILON) {
            throw new StockException('Serbest stok yok; rezerve tamamlanamadı.');
        }

        $reservation->forceFill([
            'reserved_quantity' => round($reservation->reserved_quantity + $added, 3),
        ])->save();

        return $added;
    }

    /** Teslimat: rezerveden düşer, tamamı teslim edildiyse kaydı kapatır. */
    public function deliver(StockReservation $reservation, User $user, ?float $quantity = null): StockReservation
    {
        $this->assertOpen($reservation);

        $remaining = $reservation->remaining();
        if ($remaining <= self::EPSILON) {
            throw new StockException('Rezervede teslim edilecek miktar kalmadı.');
        }

        $qty = $quantity === null ? $remaining : round($quantity, 3);

        if ($qty <= self::EPSILON) {
            throw new StockException('Teslim miktarı sıfırdan büyük olmalıdır.');
        }

        if ($qty - $remaining > self::EPSILON) {
            throw new StockException("Rezervede {$remaining} birim var, {$qty} birim teslim edilemez.");
        }

        return DB::transaction(function () use ($reservation, $user, $qty) {
            $record = $reservation->record;

            $this->ledger->deliverReserved($record, $user, $qty);

            $delivered = round($reservation->delivered_quantity + $qty, 3);
            // Sipariş miktarının tamamı teslim edildiyse kayıt kapanır; eksik rezerve
            // kalmışsa sipariş açık kalır ve "Rezerveyi Tamamla" ile devam edilir.
            $closed = $delivered + self::EPSILON >= $reservation->quantity;

            $reservation->forceFill([
                'delivered_quantity' => $delivered,
                'status'             => $closed ? StockReservation::STATUS_DELIVERED : StockReservation::STATUS_OPEN,
                'closed_at'          => $closed ? now() : null,
            ])->save();

            if ($closed) {
                // Kayıt stoğa işlenmiş sayılır: teslimat defterde zaten var
                $record->forceFill([
                    'status'     => 'completed',
                    'posted_at'  => $record->posted_at ?? now(),
                    'updated_by' => $user->id,
                ])->save();
            }

            return $reservation->fresh(['record', 'product', 'warehouse']);
        });
    }

    /** İptal: rezervede kalan miktar serbest stoğa döner. */
    public function cancel(StockReservation $reservation, User $user): StockReservation
    {
        $this->assertOpen($reservation);

        return DB::transaction(function () use ($reservation, $user) {
            $remaining = $reservation->remaining();

            if ($remaining > self::EPSILON) {
                $this->ledger->releaseReservation($reservation->record, $user, $remaining);
            }

            $reservation->forceFill([
                'reserved_quantity' => $reservation->delivered_quantity,
                'status'            => StockReservation::STATUS_CANCELLED,
                'closed_at'         => now(),
            ])->save();

            return $reservation->fresh(['record', 'product', 'warehouse']);
        });
    }

    /** Depo kaydı iptal edilir ya da silinirse rezerve serbest bırakılır. */
    public function releaseForRecord(WarehouseRecord $record, User $user): void
    {
        $reservation = StockReservation::open()->where('record_id', $record->id)->first();

        if ($reservation) {
            $this->cancel($reservation, $user);
        }
    }

    /** Rezerve edilmiş ve henüz tamamlanmamış sipariş var mı? */
    public function hasOpenReservation(WarehouseRecord $record): bool
    {
        return StockReservation::open()->where('record_id', $record->id)->exists();
    }

    /** Ürünlü, miktarlı, henüz işlenmemiş stok çıkışı kaydı rezerve edilir. */
    private function isReservable(WarehouseRecord $record): bool
    {
        return $record->type === 'stock_out'
            && $record->product_id
            && (float) $record->quantity > self::EPSILON
            && !$record->isPosted();
    }

    private function assertOpen(StockReservation $reservation): void
    {
        if (!$reservation->isOpen()) {
            throw new StockException('Bu sipariş kapanmış; işlem yapılamaz.');
        }
    }
}
