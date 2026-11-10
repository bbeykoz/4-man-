<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Models\User;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Mahsup: aynı carinin alacağı ile borcunun karşılıklı kapatılması.
 * Muhasebe etkisi bir fişle kaydedilir; hangi belgelerin kapandığı satırlarda.
 */
class PartnerOffset extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['offset_date' => 'date', 'amount' => 'decimal:6'];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function partner(): BelongsTo
    {
        return $this->belongsTo(BusinessPartner::class, 'partner_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PartnerOffsetLine::class, 'offset_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
