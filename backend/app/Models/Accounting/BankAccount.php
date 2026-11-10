<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

/**
 * Banka, kasa ya da POS hesabı.
 *
 * Bakiye saklanmıyor: defterdeki karşılık hesabından (account_id) okunuyor.
 * Ayrı bir bakiye kolonu tutmak, ödeme fişiyle hesap kaydının ayrışmasına
 * ve mutabakatın anlamsızlaşmasına yol açar.
 */
class BankAccount extends Model
{
    use HasUuid, SoftDeletes, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'cash_limit'         => 'decimal:6',
            'approval_threshold' => 'decimal:6',
            'is_active'          => 'boolean',
            'is_default'         => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'account_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(BankTransaction::class);
    }

    public function statements(): HasMany
    {
        return $this->hasMany(BankStatement::class);
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true);
    }

    public function scopeCash(Builder $q): Builder
    {
        return $q->where('type', 'cash');
    }

    public function isCash(): bool
    {
        return $this->type === 'cash';
    }

    /** Defter bakiyesi; karşılık hesabının borç-alacak farkı. */
    public function ledgerBalance(?string $tarih = null): float
    {
        $satir = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->where('l.account_id', $this->account_id)
            ->whereIn('e.status', ['posted', 'reversed'])
            ->when($tarih, fn ($q) => $q->whereDate('e.posting_date', '<=', $tarih))
            ->selectRaw('COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS bakiye')
            ->first();

        return round((float) ($satir->bakiye ?? 0), 2);
    }

    /** Kasa limiti aşıldı mı; nakit hesaplarında anlamlı. */
    public function exceedsCashLimit(?float $bakiye = null): bool
    {
        if (! $this->isCash() || $this->cash_limit === null) {
            return false;
        }

        return ($bakiye ?? $this->ledgerBalance()) > (float) $this->cash_limit;
    }

    /** Bu tutar ayrı onay ister mi. */
    public function needsApproval(float $tutar): bool
    {
        return $this->approval_threshold !== null && $tutar > (float) $this->approval_threshold;
    }

    public function displayName(): string
    {
        return $this->iban ? "{$this->name} ({$this->iban})" : $this->name;
    }
}
