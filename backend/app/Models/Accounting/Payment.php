<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Models\User;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use RuntimeException;

/**
 * Tahsilat (in) ya da ödeme (out).
 *
 * Belgelere dağıtılmayan kısım avans sayılır; dağıtım payment_allocations
 * üzerinden yapılır ve belgenin settled_amount alanını büyütür.
 */
class Payment extends Model
{
    use HasUuid, SoftDeletes, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'payment_date'     => 'date',
            'amount'           => 'decimal:6',
            'exchange_rate'    => 'decimal:10',
            'amount_fc'        => 'decimal:6',
            'allocated_amount' => 'decimal:6',
            'bank_charge'      => 'decimal:6',
            'approved_at'      => 'datetime',
            'posted_at'        => 'datetime',
            'meta'             => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::deleting(function (self $odeme) {
            if ($odeme->status === 'posted' && ! $odeme->isForceDeleting()) {
                throw new RuntimeException(
                    'Deftere işlenmiş ödeme silinemez (' . ($odeme->number ?: $odeme->id) . '). Ters kayıt kullanın.'
                );
            }
        });
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function partner(): BelongsTo
    {
        return $this->belongsTo(BusinessPartner::class, 'partner_id');
    }

    /** Cariye bağlı olmayan hareketlerin karşı hesabı. */
    public function counterAccount(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'counter_account_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function bankTransactions(): HasMany
    {
        return $this->hasMany(BankTransaction::class);
    }

    public function preparedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function scopePosted(Builder $q): Builder
    {
        return $q->where('status', 'posted');
    }

    public function scopeIncoming(Builder $q): Builder
    {
        return $q->where('direction', 'in');
    }

    public function scopeOutgoing(Builder $q): Builder
    {
        return $q->where('direction', 'out');
    }

    /** Henüz belgeye dağıtılmamış tutar; avans olarak durur. */
    public function unallocated(): float
    {
        return round((float) $this->amount - (float) $this->allocated_amount, 2);
    }

    public function isEditable(): bool
    {
        return in_array($this->status, ['draft', 'pending_approval'], true);
    }

    /** Para girişi mi: tahsilat banka hesabını borçlandırır. */
    public function isIncoming(): bool
    {
        return $this->direction === 'in';
    }

    public function label(): string
    {
        return $this->number ?: 'Taslak';
    }
}
