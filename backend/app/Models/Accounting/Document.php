<?php

namespace App\Models\Accounting;

use App\Enums\Accounting\DocumentStatus;
use App\Enums\Accounting\DocumentType;
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
 * Ticari belge: satış/alış faturası, iade, avans, proforma, masraf.
 *
 * Belge ticari gerçeği taşır; muhasebe yansıması ayrı bir fiştir
 * (journal_entry_id). Deftere işlenmiş belge silinmez — iptal ya da iade
 * belgesi düzenlenir ve orijinale bağlanır.
 *
 * Karşı tarafın unvanı, vergi numarası ve adresi belge anında kopyalanıyor:
 * cari kartı sonradan değişse bile kesilmiş belge değişmemeli.
 */
class Document extends Model
{
    use HasUuid, SoftDeletes, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'doc_type'        => DocumentType::class,
            'status'          => DocumentStatus::class,
            'issue_date'      => 'date',
            'tax_date'        => 'date',
            'due_date'        => 'date',
            'supply_date'     => 'date',
            'exchange_rate'   => 'decimal:10',
            'exchange_rate_date' => 'date',
            'net_amount'      => 'decimal:6',
            'tax_amount'      => 'decimal:6',
            'gross_amount'    => 'decimal:6',
            'discount_amount' => 'decimal:6',
            'net_amount_fc'   => 'decimal:6',
            'tax_amount_fc'   => 'decimal:6',
            'gross_amount_fc' => 'decimal:6',
            'settled_amount'  => 'decimal:6',
            'partner_address' => 'array',
            'posted_at'       => 'datetime',
            'meta'            => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::deleting(function (self $belge) {
            // Soft delete bile olsa deftere işlenmiş belge listeden kaybolmamalı.
            if ($belge->status->affectsLedger() && ! $belge->isForceDeleting()) {
                throw new RuntimeException(
                    "Deftere işlenmiş belge silinemez ({$belge->number}). İptal ya da iade belgesi düzenleyin."
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
        return $this->hasMany(DocumentLine::class)->orderBy('line_no');
    }

    public function series(): BelongsTo
    {
        return $this->belongsTo(DocumentSeries::class, 'series_id');
    }

    /** Cari kartı. Faz 5'te tablo gelene kadar yalnız partner_name vardı. */
    public function partner(): BelongsTo
    {
        return $this->belongsTo(BusinessPartner::class, 'partner_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    /** Bu belge hangi belgeyi düzeltiyor. */
    public function corrects(): BelongsTo
    {
        return $this->belongsTo(self::class, 'corrects_document_id');
    }

    /** Bu belgeyi düzelten belgeler (iade, borç dekontu). */
    public function corrections(): HasMany
    {
        return $this->hasMany(self::class, 'corrects_document_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function postedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    // ─── Kapsamlar ──────────────────────────────────────────────────

    public function scopePosted(Builder $query): Builder
    {
        return $query->whereIn('status', [
            DocumentStatus::Posted->value,
            DocumentStatus::PartiallySettled->value,
            DocumentStatus::Settled->value,
        ]);
    }

    public function scopeSales(Builder $query): Builder
    {
        return $query->whereIn('doc_type', array_map(
            fn (DocumentType $t) => $t->value,
            array_filter(DocumentType::cases(), fn (DocumentType $t) => $t->direction() === 'sale'),
        ));
    }

    public function scopePurchases(Builder $query): Builder
    {
        return $query->whereIn('doc_type', array_map(
            fn (DocumentType $t) => $t->value,
            array_filter(DocumentType::cases(), fn (DocumentType $t) => $t->direction() === 'purchase'),
        ));
    }

    /** Açık kalemler: kapanmamış, deftere işlenmiş belgeler. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', [
            DocumentStatus::Posted->value,
            DocumentStatus::PartiallySettled->value,
        ]);
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /** Kalan tutar; tahsilat/ödeme eşleştirmesi bunu azaltır. */
    public function outstanding(): float
    {
        return round((float) $this->gross_amount - (float) $this->settled_amount, 2);
    }

    public function isEditable(): bool
    {
        return $this->status->isEditable();
    }

    /** Belgenin tam numarası: seri varsa "SF-A-000001". */
    public function fullNumber(): string
    {
        return $this->number ?: 'Taslak';
    }

    /** Vade geçmiş mi. */
    public function isOverdue(?string $bugun = null): bool
    {
        if (! $this->due_date || ! $this->status->affectsLedger() || $this->outstanding() <= 0) {
            return false;
        }

        return $this->due_date->toDateString() < ($bugun ?? now()->toDateString());
    }

    /** Vergiyi doğuran olay tarihi; verilmediyse belge tarihi. */
    public function taxPointDate(): string
    {
        return ($this->tax_date ?? $this->supply_date ?? $this->issue_date)->toDateString();
    }
}
