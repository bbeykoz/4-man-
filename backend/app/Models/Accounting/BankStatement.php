<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Models\User;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Banka ekstresi.
 *
 * Dosya özeti (file_hash) benzersiz: aynı ekstre iki kez yüklenirse satırlar
 * mükerrer girer ve mutabakat bozulur.
 */
class BankStatement extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'statement_date'  => 'date',
            'period_start'    => 'date',
            'period_end'      => 'date',
            'opening_balance' => 'decimal:6',
            'closing_balance' => 'decimal:6',
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

    public function transactions(): HasMany
    {
        return $this->hasMany(BankTransaction::class, 'statement_id');
    }

    public function importedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'imported_by');
    }

    /** Satır toplamları açılış ve kapanış bakiyesiyle tutuyor mu. */
    public function isInternallyConsistent(): bool
    {
        $hareket = round((float) $this->transactions()->sum('amount'), 2);
        $beklenen = round((float) $this->opening_balance + $hareket, 2);

        return abs($beklenen - (float) $this->closing_balance) < 0.01;
    }
}
