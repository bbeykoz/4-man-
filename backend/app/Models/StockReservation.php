<?php

namespace App\Models;

use App\Models\Modules\WarehouseRecord;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Booked (rezerve) kayıt: bir stok çıkışı kaydı için ayrılan stok.
 *
 * quantity          → siparişte istenen miktar
 * reserved_quantity → stoktan fiilen ayrılabilen miktar (serbest stok yetmezse daha az olur)
 * delivered_quantity→ rezerveden teslim edilen miktar
 */
class StockReservation extends Model
{
    use HasUuid;

    public const STATUS_OPEN      = 'open';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_CANCELLED = 'cancelled';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'quantity'           => 'float',
            'reserved_quantity'  => 'float',
            'delivered_quantity' => 'float',
            'due_date'           => 'date',
            'closed_at'          => 'datetime',
        ];
    }

    // ─── İlişkiler ──────────────────────────────────────────────────

    public function record(): BelongsTo
    {
        return $this->belongsTo(WarehouseRecord::class, 'record_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(WarehouseProduct::class, 'product_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ─── Hesaplanan değerler ────────────────────────────────────────

    /** Rezervede duran, henüz teslim edilmemiş miktar. */
    public function remaining(): float
    {
        return round($this->reserved_quantity - $this->delivered_quantity, 3);
    }

    /** Serbest stok yetmediği için rezerve edilemeyen miktar. */
    public function shortage(): float
    {
        return round(max(0, $this->quantity - $this->reserved_quantity), 3);
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_OPEN;
    }

    public function scopeOpen($query)
    {
        return $query->where('status', self::STATUS_OPEN);
    }
}
