<?php

namespace App\Models\Accounting;

use App\Enums\Accounting\TaxTreatment;
use App\Models\Company;
use App\Models\User;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Vergi kodu.
 *
 * Aynı kod zaman içinde birden çok satır olabilir: oran değiştiğinde eskisi
 * valid_to ile kapatılır, yenisi açılır. Geçmiş fişler kendi dönemlerindeki
 * satırı gösterir, yeni oran onlara sıçramaz.
 */
class TaxCode extends Model
{
    use HasUuid, SoftDeletes, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'treatment'           => TaxTreatment::class,
            'rate'                => 'decimal:4',
            'deductible_rate'     => 'decimal:2',
            'valid_from'          => 'date',
            'valid_to'            => 'date',
            'eu_reportable'       => 'boolean',
            'affects_vat_return'  => 'boolean',
            'is_default'          => 'boolean',
            'approved_at'         => 'datetime',
            'meta'                => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function outputAccount(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'output_account_id');
    }

    public function inputAccount(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'input_account_id');
    }

    public function expenseAccount(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'expense_account_id');
    }

    /** Verilen tarihte geçerli kodlar. */
    public function scopeEffectiveOn(Builder $query, string $tarih): Builder
    {
        return $query->whereDate('valid_from', '<=', $tarih)
            ->where(fn (Builder $q) => $q->whereNull('valid_to')->orWhereDate('valid_to', '>=', $tarih));
    }

    /** Canlıda kullanılabilir: danışman onaylı. */
    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('approval_status', 'approved');
    }

    public function scopeForDirection(Builder $query, string $yon): Builder
    {
        return $query->whereIn('direction', [$yon, 'both']);
    }

    public function isEffectiveOn(string $tarih): bool
    {
        return $this->valid_from->toDateString() <= $tarih
            && ($this->valid_to === null || $this->valid_to->toDateString() >= $tarih);
    }

    public function isApproved(): bool
    {
        return $this->approval_status === 'approved';
    }

    /** Kısmi indirim var mı; %100 dışındaki her oran gider tarafı doğurur. */
    public function hasPartialDeduction(): bool
    {
        return (float) $this->deductible_rate < 100.0;
    }

    public function displayName(): string
    {
        $oran = rtrim(rtrim(number_format((float) $this->rate, 2, ',', '.'), '0'), ',');

        return "{$this->code} — {$this->name} (%{$oran})";
    }
}
