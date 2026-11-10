<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Models\User;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use RuntimeException;

/**
 * KDV beyanı.
 *
 * Gönderildiği anda içerik donuyor: sonradan bir belge düzeltilse bile beyan
 * değişmemeli, fark görünür kalmalı. snapshot_hash gönderim anındaki defter
 * özetini tutuyor; sonradan defter değişirse tespit edilebiliyor.
 */
class VatReturn extends Model
{
    use HasUuid, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'period_start'       => 'date',
            'period_end'         => 'date',
            'due_date'           => 'date',
            'boxes'              => 'array',
            'validation_issues'  => 'array',
            'output_base'        => 'decimal:6',
            'output_tax'         => 'decimal:6',
            'input_base'         => 'decimal:6',
            'input_tax'          => 'decimal:6',
            'non_deductible_tax' => 'decimal:6',
            'net_payable'        => 'decimal:6',
            'submitted_at'       => 'datetime',
            'meta'               => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::deleting(function (self $beyan) {
            if ($beyan->isSubmitted()) {
                throw new RuntimeException("Gönderilmiş KDV beyanı silinemez ({$beyan->period_key}).");
            }
        });
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(VatReturnEntry::class, 'vat_return_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function isSubmitted(): bool
    {
        return in_array($this->status, ['submitted', 'accepted'], true);
    }

    public function isEditable(): bool
    {
        return in_array($this->status, ['draft', 'validated', 'rejected'], true);
    }

    /** Ödenecek mi devreden mi. */
    public function isPayable(): bool
    {
        return (float) $this->net_payable > 0;
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'draft'     => 'Taslak',
            'validated' => 'Doğrulandı',
            'submitted' => 'Gönderildi',
            'accepted'  => 'Kabul edildi',
            'rejected'  => 'Reddedildi',
            default     => $this->status,
        };
    }

    /** Son tarihe kalan gün; negatifse gecikmiş. */
    public function daysToDue(?string $bugun = null): int
    {
        return (int) \Illuminate\Support\Carbon::parse($bugun ?? now()->toDateString())
            ->diffInDays($this->due_date, false);
    }
}
