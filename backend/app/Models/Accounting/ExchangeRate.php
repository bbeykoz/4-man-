<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Models\User;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use RuntimeException;

/**
 * Kur kaydı.
 *
 * "1 base = rate quote" okunur: EUR/BGN 1.95583 → 1 EUR = 1.95583 BGN.
 * Sabit kurlar (mevzuatla belirlenen) değiştirilemez; veritabanı trigger'ı da
 * engelliyor.
 */
class ExchangeRate extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'rate_date'    => 'date',
            'rate'         => 'decimal:10',
            'is_fixed'     => 'boolean',
            'retrieved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (self $kur) {
            if ($kur->is_fixed && $kur->isDirty('rate')) {
                throw new RuntimeException("Sabit kur değiştirilemez ({$kur->pair()}).");
            }
        });

        static::deleting(function (self $kur) {
            if ($kur->is_fixed) {
                throw new RuntimeException("Sabit kur silinemez ({$kur->pair()}).");
            }
        });
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function enteredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'entered_by');
    }

    public function scopeForPair(Builder $q, string $base, string $quote): Builder
    {
        return $q->where('base_currency', strtoupper($base))->where('quote_currency', strtoupper($quote));
    }

    /** Verilen tarihte ya da ondan önceki en yakın kur. */
    public function scopeAsOf(Builder $q, string $tarih): Builder
    {
        return $q->whereDate('rate_date', '<=', $tarih)->orderByDesc('rate_date');
    }

    public function pair(): string
    {
        return "{$this->base_currency}/{$this->quote_currency}";
    }

    /** Ters kur: 1 quote kaç base eder. */
    public function inverse(): float
    {
        $r = (float) $this->rate;

        return $r == 0.0 ? 0.0 : round(1 / $r, 10);
    }
}
