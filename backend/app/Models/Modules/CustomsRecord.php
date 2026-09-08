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

class CustomsRecord extends Model
{
    use HasFactory, HasUuid, SoftDeletes, HasRecordRelations, HasRecordNumber, HasActivityLog;

    protected $table = 'customs_records';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'         => RecordStatus::class,
            'priority'       => Priority::class,
            'completed_at'   => 'datetime',
            'expected_date'  => 'date',
            'meta'           => 'array',
            'items'          => 'array',
            'declared_value' => 'float',
            'customs_duty'   => 'float',
            'vat_amount'     => 'float',
            'other_taxes'    => 'float',
            'exchange_rate'  => 'float',
            'net_weight'     => 'float',
            'gross_weight'   => 'float',
        ];
    }
}
