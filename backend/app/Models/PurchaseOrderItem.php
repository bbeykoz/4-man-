<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderItem extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'quantity'     => 'float',
            'unit_price'   => 'decimal:2',
            'received_qty' => 'float',
            'damaged_qty'  => 'float',
            'suggestion'   => 'array',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(WarehouseProduct::class, 'product_id')->withTrashed();
    }

    /** Henüz gelmemiş miktar (hasarlı gelen de teslim edilmiş sayılır). */
    public function remainingQty(): float
    {
        return max(0, round($this->quantity - $this->received_qty - $this->damaged_qty, 3));
    }
}
