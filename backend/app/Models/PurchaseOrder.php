<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseOrder extends Model
{
    use HasUuid, SoftDeletes;

    public const STATUS_DRAFT     = 'draft';
    public const STATUS_SENT      = 'sent';
    public const STATUS_PARTIAL   = 'partially_received';
    public const STATUS_RECEIVED  = 'received';
    public const STATUS_CANCELLED = 'cancelled';

    /** Tedarikçide bekleyen (yoldaki) siparişler */
    public const OPEN_STATUSES = [self::STATUS_SENT, self::STATUS_PARTIAL];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'order_date'    => 'date',
            'expected_date' => 'date',
            'sent_at'       => 'datetime',
            'received_at'   => 'datetime',
            'cancelled_at'  => 'datetime',
            'total_amount'  => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $po) {
            $po->po_number ??= static::nextNumber();
        });
    }

    /** PO-YYYYMM-00001; en büyük numaradan devam eder (aynı saniyede çakışmaz). */
    public static function nextNumber(): string
    {
        $prefix = sprintf('PO-%s-', now()->format('Ym'));
        $last   = static::withTrashed()->where('po_number', 'like', $prefix . '%')->orderByDesc('po_number')->value('po_number');

        return sprintf('%s%05d', $prefix, $last ? ((int) substr($last, -5)) + 1 : 1);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class)->withTrashed();
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(PurchaseOrderReceipt::class)->orderBy('received_at');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeForCompany($query, ?string $companyId)
    {
        return $companyId ? $query->where('company_id', $companyId) : $query->whereRaw('1 = 0');
    }

    public function recalculateTotal(): void
    {
        $this->total_amount = $this->items()->get()->sum(fn($i) => (float) $i->quantity * (float) ($i->unit_price ?? 0));
        $this->save();
    }
}
