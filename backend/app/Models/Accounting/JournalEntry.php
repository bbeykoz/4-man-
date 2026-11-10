<?php

namespace App\Models\Accounting;

use App\Enums\Accounting\JournalStatus;
use App\Enums\Accounting\JournalType;
use App\Models\Company;
use App\Models\User;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use RuntimeException;

/**
 * Yevmiye fişi.
 *
 * Projedeki diğer modellerin aksine SoftDeletes kullanmıyor: deftere işlenmiş
 * fiş silinmez, ters kayıtla düzeltilir. Taslak fiş gerçekten silinebilir
 * çünkü deftere hiç etki etmemiştir.
 *
 * Numara post anında atanır. Taslağın numarası yoktur; yasal numara gibi
 * görünen bir taslak numarası üretmek denetimde yanıltıcı olur.
 */
class JournalEntry extends Model
{
    use HasUuid, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'journal_type'  => JournalType::class,
            'status'        => JournalStatus::class,
            'document_date' => 'date',
            'posting_date'  => 'date',
            'total_debit'   => 'decimal:6',
            'total_credit'  => 'decimal:6',
            'approved_at'   => 'datetime',
            'posted_at'     => 'datetime',
            'reversed_at'   => 'datetime',
            'meta'          => 'array',
        ];
    }

    protected static function booted(): void
    {
        // Uygulama tarafında da engelle: veritabanı trigger'ı son savunma hattı,
        // ilk hattı burada olsun ki hata mesajı anlaşılır çıksın.
        static::deleting(function (self $fis) {
            if ($fis->status->isFinal()) {
                throw new RuntimeException(
                    "Deftere işlenmiş fiş silinemez ({$fis->journal_no}). Ters kayıt kullanın."
                );
            }
        });
    }

    // ─── İlişkiler ──────────────────────────────────────────────────

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class, 'entry_id')->orderBy('line_no');
    }

    public function period(): BelongsTo
    {
        return $this->belongsTo(AccountingPeriod::class, 'period_id');
    }

    /** Bu fiş hangi fişi tersliyor. */
    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }

    /** Bu fişi hangi fiş tersledi. */
    public function reversedBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversed_by_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function postedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    // ─── Kapsamlar ──────────────────────────────────────────────────

    public function scopePosted(Builder $query): Builder
    {
        return $query->whereIn('status', [JournalStatus::Posted->value, JournalStatus::Reversed->value]);
    }

    /** Defter bakiyesine giren fişler: ters kayıt da deftere girmiştir. */
    public function scopeAffectsLedger(Builder $query): Builder
    {
        return $this->scopePosted($query);
    }

    public function scopeInPeriod(Builder $query, string $periodId): Builder
    {
        return $query->where('period_id', $periodId);
    }

    public function scopeBetweenPostingDates(Builder $query, ?string $from, ?string $to): Builder
    {
        return $query
            ->when($from, fn (Builder $q) => $q->whereDate('posting_date', '>=', $from))
            ->when($to,   fn (Builder $q) => $q->whereDate('posting_date', '<=', $to));
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /**
     * Onaylanan içeriğin parmak izi.
     *
     * Onay ile post arasında satırlar değişirse post reddedilir. Tutarlar
     * metin olarak katılıyor: float karşılaştırması burada yanlış sonuç verir.
     */
    public function computeContentHash(): string
    {
        $satirlar = $this->lines()
            ->orderBy('line_no')
            ->get(['line_no', 'account_id', 'debit', 'credit', 'txn_currency', 'txn_debit', 'txn_credit', 'partner_id', 'dimensions'])
            ->map(fn (JournalLine $s) => implode('|', [
                $s->line_no,
                $s->account_id,
                number_format((float) $s->debit, 6, '.', ''),
                number_format((float) $s->credit, 6, '.', ''),
                $s->txn_currency ?? '',
                $s->txn_debit  === null ? '' : number_format((float) $s->txn_debit, 6, '.', ''),
                $s->txn_credit === null ? '' : number_format((float) $s->txn_credit, 6, '.', ''),
                $s->partner_id ?? '',
                json_encode($s->dimensions ?? [], JSON_UNESCAPED_UNICODE),
            ]))
            ->implode("\n");

        return hash('sha256', implode("\n", [
            $this->company_id,
            $this->journal_type->value,
            $this->document_date?->toDateString(),
            $this->posting_date?->toDateString(),
            $this->currency,
            $satirlar,
        ]));
    }

    public function isBalanced(): bool
    {
        // Defter hassasiyeti 6 hane; karşılaştırma tam sayı üzerinden yapılıyor.
        return $this->toMicro($this->total_debit) === $this->toMicro($this->total_credit);
    }

    private function toMicro(string|float|null $tutar): int
    {
        return (int) round(((float) $tutar) * 1_000_000);
    }

    public function isEditable(): bool
    {
        return $this->status->isEditable();
    }

    public function label(): string
    {
        return $this->journal_no ?: 'Taslak';
    }
}
