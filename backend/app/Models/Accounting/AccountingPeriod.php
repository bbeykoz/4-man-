<?php

namespace App\Models\Accounting;

use App\Enums\Accounting\PeriodStatus;
use App\Models\Company;
use App\Models\User;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Muhasebe dönemi.
 *
 * Fişin dönemi posting_date ile belirlenir, belge tarihiyle değil. Kapalı
 * döneme kayıt engellenir; yeniden açma gerekçe ister ve denetim kaydına yazılır.
 */
class AccountingPeriod extends Model
{
    use HasUuid, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'      => PeriodStatus::class,
            'start_date'  => 'date',
            'end_date'    => 'date',
            'closed_at'   => 'datetime',
            'reopened_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(JournalEntry::class, 'period_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function reopenedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /** Verilen tarihi kapsayan dönem. */
    public function scopeCovering(Builder $query, string $tarih): Builder
    {
        return $query->where('start_date', '<=', $tarih)->where('end_date', '>=', $tarih);
    }

    /**
     * Bu fiş türü bu döneme yazılabilir mi.
     * Kapanmakta olan döneme yalnız kapanış işlemleri girer.
     */
    public function accepts(\App\Enums\Accounting\JournalType $tur): bool
    {
        return match ($this->status) {
            PeriodStatus::Open    => true,
            PeriodStatus::Closing => $tur->allowedWhileClosing(),
            default               => false,
        };
    }

    public function isClosed(): bool
    {
        return in_array($this->status, [PeriodStatus::Closed, PeriodStatus::Locked], true);
    }
}
