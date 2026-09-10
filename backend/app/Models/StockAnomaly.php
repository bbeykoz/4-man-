<?php

namespace App\Models;

use App\Models\Modules\WarehouseRecord;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockAnomaly extends Model
{
    use HasUuid;

    public const STATUS_OPEN         = 'open';
    public const STATUS_ACKNOWLEDGED = 'acknowledged'; // incelendi, sorun var / aksiyon alındı
    public const STATUS_DISMISSED    = 'dismissed';    // incelendi, normal

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'severity'     => 'integer',
            'detected_for' => 'date',
            'metrics'      => 'array',
            'reviewed_at'  => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(WarehouseProduct::class, 'product_id')->withTrashed();
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function record(): BelongsTo
    {
        return $this->belongsTo(WarehouseRecord::class, 'record_id')->withTrashed();
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function scopeForCompany($query, ?string $companyId)
    {
        return $companyId ? $query->where('company_id', $companyId) : $query->whereRaw('1 = 0');
    }
}
