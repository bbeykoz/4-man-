<?php

namespace App\Models\Modules;

use App\Enums\Priority;
use App\Enums\RecordStatus;
use App\Traits\HasActivityLog;
use App\Traits\HasRecordNumber;
use App\Traits\HasRecordRelations;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ShippingRecord extends Model
{
    use HasFactory, HasUuid, SoftDeletes, HasRecordRelations, HasRecordNumber, HasActivityLog;

    protected $table = 'shipping_records';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'           => RecordStatus::class,
            'priority'         => Priority::class,
            'completed_at'     => 'datetime',
            'pickup_at'        => 'datetime',
            'delivered_at'     => 'datetime',
            'estimated_delivery' => 'date',
            'departure_date'   => 'date',
            'actual_delivery'  => 'date',
            'meta'             => 'array',
            'items'            => 'array',
            'weight'           => 'float',
            'shipping_cost'    => 'float',
            'fuel_cost'        => 'float',
            'driver_cost'      => 'float',
            'extra_cost'       => 'float',
        ];
    }
}
