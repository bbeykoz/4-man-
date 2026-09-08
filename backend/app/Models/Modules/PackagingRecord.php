<?php

namespace App\Models\Modules;

use App\Enums\Priority;
use App\Enums\RecordStatus;
use App\Traits\HasActivityLog;
use App\Traits\HasRecordNumber;
use App\Traits\HasRecordRelations;
use App\Traits\HasUuid;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class PackagingRecord extends Model
{
    use HasFactory, HasUuid, SoftDeletes, HasRecordRelations, HasRecordNumber, HasActivityLog;

    protected $table = 'packaging_records';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'        => RecordStatus::class,
            'priority'      => Priority::class,
            'completed_at'  => 'datetime',
            'shipping_date' => 'date',
            'meta'          => 'array',
            'items'         => 'array',
            'weight'        => 'float',
            'desi'          => 'float',
            'width'         => 'float',
            'height'        => 'float',
            'depth'         => 'float',
        ];
    }

    public function packedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'packed_by');
    }
}
