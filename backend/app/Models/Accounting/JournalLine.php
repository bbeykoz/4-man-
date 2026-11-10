<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Fiş satırı.
 *
 * Bir satır ya borç ya alacaktır; ikisi birden dolu olamaz ve ikisi birden
 * boş olamaz. Kural veritabanında CHECK ile de zorlanıyor.
 *
 * Tutarlar iki katmanda: debit/credit defter para biriminde, txn_debit/
 * txn_credit işlemin kendi para biriminde. Kur, kur tarihi ve kur kaynağı
 * satırda saklanır — sonradan kur tablosu değişse bile kayıt değişmez.
 */
class JournalLine extends Model
{
    use HasUuid, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'line_no'    => 'integer',
            'debit'      => 'decimal:6',
            'credit'     => 'decimal:6',
            'txn_debit'  => 'decimal:6',
            'txn_credit' => 'decimal:6',
            'fx_rate'    => 'decimal:10',
            'tax_base'   => 'decimal:6',
            'tax_amount' => 'decimal:6',
            'tax_rate'   => 'decimal:4',
            'non_deductible_amount' => 'decimal:6',
            'fx_rate_date' => 'date',
            'dimensions' => 'array',
        ];
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'entry_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'account_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function taxCode(): BelongsTo
    {
        return $this->belongsTo(TaxCode::class, 'tax_code_id');
    }

    /** Yalnız deftere işlenmiş fişlerin satırları; bakiye hesapları bunu kullanır. */
    public function scopePosted(Builder $query): Builder
    {
        return $query->whereHas('entry', fn (Builder $q) => $q->posted());
    }

    public function isDebit(): bool
    {
        return (float) $this->debit > 0;
    }

    /** Borç pozitif, alacak negatif. Bakiye toplamlarında kullanılır. */
    public function signedAmount(): float
    {
        return (float) $this->debit - (float) $this->credit;
    }

    /** Analitik boyut değeri: warehouse_id, cost_center, project … */
    public function dimension(string $anahtar): mixed
    {
        return data_get($this->dimensions, $anahtar);
    }
}
