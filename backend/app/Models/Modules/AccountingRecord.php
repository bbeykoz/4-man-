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

class AccountingRecord extends Model
{
    use HasFactory, HasUuid, SoftDeletes, HasRecordRelations, HasRecordNumber, HasActivityLog;

    protected $table = 'accounting_records';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'              => RecordStatus::class,
            'priority'            => Priority::class,
            'amount'              => 'decimal:2',
            'vat_rate'            => 'decimal:2',
            'vat_included'        => 'boolean',
            'vat_amount'          => 'decimal:2',
            'exchange_rate'       => 'decimal:6',
            'is_recurring'        => 'boolean',
            'transaction_date'    => 'date',
            'due_date'            => 'date',
            'paid_at'             => 'date',
            'recurring_end_date'  => 'date',
            'completed_at'        => 'datetime',
            'meta'                => 'array',
        ];
    }
}
