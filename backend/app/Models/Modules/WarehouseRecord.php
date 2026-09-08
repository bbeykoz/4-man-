<?php

namespace App\Models\Modules;

use App\Enums\Priority;
use App\Enums\RecordStatus;
use App\Models\WarehouseProduct;
use App\Models\User;
use App\Traits\HasActivityLog;
use App\Traits\HasRecordNumber;
use App\Traits\HasRecordRelations;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class WarehouseRecord extends Model
{
    use HasFactory, HasUuid, SoftDeletes, HasRecordRelations, HasRecordNumber, HasActivityLog;

    protected $table = 'warehouse_records';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'           => RecordStatus::class,
            'priority'         => Priority::class,
            'completed_at'     => 'datetime',
            'transaction_date' => 'date',
            'expiry_date'      => 'date',
            'meta'             => 'array',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(WarehouseProduct::class, 'product_id');
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }
}
