<?php

namespace App\Models\Modules;

use App\Enums\Priority;
use App\Enums\RecordStatus;
use App\Models\User;
use App\Traits\HasActivityLog;
use App\Traits\HasRecordNumber;
use App\Traits\HasRecordRelations;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class MarketingRecord extends Model
{
    use HasFactory, HasUuid, SoftDeletes, HasRecordRelations, HasRecordNumber, HasActivityLog;

    protected $table = 'marketing_records';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'        => RecordStatus::class,
            'priority'      => Priority::class,
            'completed_at'  => 'datetime',
            'start_date'    => 'date',
            'end_date'      => 'date',
            'budget'        => 'decimal:2',
            'spent_amount'  => 'decimal:2',
            'impressions'   => 'integer',
            'clicks'        => 'integer',
            'conversions'   => 'integer',
            'goal_value'    => 'integer',
            'meta'          => 'array',
        ];
    }

    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** Kalan bütçe */
    public function getRemainingBudgetAttribute(): float
    {
        return max(0, ($this->budget ?? 0) - ($this->spent_amount ?? 0));
    }

    /** CTR (Click-through rate) */
    public function getCtrAttribute(): float
    {
        if (!$this->impressions) return 0;
        return round($this->clicks / $this->impressions * 100, 2);
    }

    /** Conversion rate */
    public function getConversionRateAttribute(): float
    {
        if (!$this->clicks) return 0;
        return round($this->conversions / $this->clicks * 100, 2);
    }

    /** Cost per lead */
    public function getCostPerLeadAttribute(): float
    {
        if (!$this->conversions) return 0;
        return round(($this->spent_amount ?? 0) / $this->conversions, 2);
    }
}
