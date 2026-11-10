<?php

namespace App\Models\Accounting;

use App\Enums\Accounting\InventoryEventType;
use App\Models\Company;
use App\Models\User;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Depo → muhasebe olay kaydı (outbox satırı).
 *
 * Hem kuyruk hem denetim izi: olayın ne zaman geldiği, hangi fişi ürettiği,
 * neden atlandığı ya da neden hata verdiği burada duruyor. Drill-down iki
 * yönde de bu kayıt üzerinden kuruluyor.
 */
class InventoryAccountingEvent extends Model
{
    use HasUuid, HasCompanyScope;

    protected $table = 'inventory_accounting_events';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'event_type'      => InventoryEventType::class,
            'payload'         => 'array',
            'occurred_at'     => 'datetime',
            'accounting_date' => 'date',
            'processed_at'    => 'datetime',
            'attempts'        => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function scopePending(Builder $q): Builder
    {
        return $q->where('status', 'pending');
    }

    /** İnsan müdahalesi bekleyenler: kapalı dönem ya da teknik hata. */
    public function scopeNeedsAttention(Builder $q): Builder
    {
        return $q->whereIn('status', ['exception', 'failed']);
    }

    public function isProcessed(): bool
    {
        return in_array($this->status, ['processed', 'skipped'], true);
    }

    /** Olay yükündeki toplam değer; fiş tutarı buna eşit olmalı. */
    public function totalValue(): float
    {
        return round(array_sum(array_map(
            fn (array $s) => (float) ($s['value'] ?? 0),
            $this->payload['lines'] ?? [],
        )), 2);
    }
}
