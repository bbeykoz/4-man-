<?php

namespace App\Models;

use App\Models\Modules\WarehouseRecord;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderReceiptItem extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'quantity'         => 'float',
            'damaged_quantity' => 'float',
            'expiry_date'      => 'date',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderItem::class, 'purchase_order_item_id');
    }

    public function record(): BelongsTo
    {
        return $this->belongsTo(WarehouseRecord::class, 'record_id');
    }
}
