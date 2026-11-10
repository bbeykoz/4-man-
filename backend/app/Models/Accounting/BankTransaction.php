<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Models\User;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Ekstre satırı: bankanın bize söylediği hareket.
 *
 * Bu kayıt dış gerçektir, düzeltilmez. Bizim kaydımız (Payment) ayrı durur;
 * ikisi eşleştirilir. Eşleşmeyen satır "unmatched" kalır ve mutabakatta
 * açıklanması gereken fark olarak görünür.
 */
class BankTransaction extends Model
{
    use HasUuid, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'booking_date'     => 'date',
            'value_date'       => 'date',
            'amount'           => 'decimal:6',
            'running_balance'  => 'decimal:6',
            'match_confidence' => 'decimal:2',
            'match_reasons'    => 'array',
            'matched_at'       => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function statement(): BelongsTo
    {
        return $this->belongsTo(BankStatement::class, 'statement_id');
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function matchedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'matched_by');
    }

    public function scopeUnmatched(Builder $q): Builder
    {
        return $q->whereIn('match_status', ['unmatched', 'suggested']);
    }

    /** Para girişi mi; negatif tutar çıkış demek. */
    public function isIncoming(): bool
    {
        return (float) $this->amount > 0;
    }

    public function absAmount(): float
    {
        return round(abs((float) $this->amount), 2);
    }

    /** Mutabakata giren satır mı; göz ardı edilenler sayılmaz. */
    public function countsForReconciliation(): bool
    {
        return $this->match_status !== 'ignored';
    }
}
