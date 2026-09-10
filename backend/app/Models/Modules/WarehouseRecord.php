<?php

namespace App\Models\Modules;

use App\Enums\Priority;
use App\Enums\RecordStatus;
use App\Models\Warehouse;
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

    public const QC_PENDING = 'pending';
    public const QC_PASSED  = 'passed';

    /** Sadece kalite kontrol endpoint'i yazabilir; update() ile değiştirilemez. */
    public const QC_FIELDS = ['qc_status', 'qc_photo_path', 'qc_photo_disk', 'qc_checked_by', 'qc_checked_at'];

    public const TYPES = ['stock_in', 'stock_out', 'transfer', 'adjustment', 'inspection', 'stock_count', 'damage', 'return_in'];

    /** Stoğa işlenmiş kayıtta değiştirilemeyen alanlar. */
    public const STOCK_FIELDS = [
        'type', 'product_id', 'quantity', 'unit', 'warehouse_id', 'to_warehouse_id',
        'direction', 'batch_number', 'expiry_date', 'system_quantity', 'posted_at', 'reversed_at',
    ];

    protected $table = 'warehouse_records';
    protected $guarded = ['id'];
    protected $with = ['qcCheckedBy:id,name', 'warehouse:id,name,code', 'toWarehouse:id,name,code'];

    protected function casts(): array
    {
        return [
            'status'           => RecordStatus::class,
            'priority'         => Priority::class,
            'completed_at'     => 'datetime',
            'transaction_date' => 'date',
            'expiry_date'      => 'date',
            'meta'             => 'array',
            'qc_checked_at'    => 'datetime',
            'system_quantity'  => 'float',
            'posted_at'        => 'datetime',
            'reversed_at'      => 'datetime',
        ];
    }

    /**
     * HasRecordNumber son kaydı created_at ile bulur; aynı saniyede açılan kayıtlarda
     * aynı numarayı üretip unique hatası veriyordu. Depo için en büyük numaradan devam edilir.
     */
    protected function generateRecordNumber(): string
    {
        $prefix = sprintf('WAR-%s-', now()->format('Ym'));

        $last = static::withTrashed()
            ->where('record_number', 'like', $prefix . '%')
            ->orderByDesc('record_number')
            ->value('record_number');

        $sequence = $last ? ((int) substr($last, -5)) + 1 : 1;

        return sprintf('%s%05d', $prefix, $sequence);
    }

    /** Stok defterine işlenmiş ve geri alınmamış mı? */
    public function isPosted(): bool
    {
        return $this->posted_at !== null && $this->reversed_at === null;
    }

    public function qcCheckedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'qc_checked_by');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function toWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'to_warehouse_id');
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
