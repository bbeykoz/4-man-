<?php

namespace App\Models\Accounting;

use App\Enums\Accounting\AccountType;
use App\Enums\Accounting\NormalBalance;
use App\Models\Company;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Hesap planı kalemi.
 *
 * Plan şirkete aittir: ülke paketi yalnızca başlangıç şablonu verir, şirket
 * kendi kodlamasını kullanabilir. Hesap bir fişte kullanıldıysa silinemez.
 */
class ChartAccount extends Model
{
    use HasUuid, SoftDeletes, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'account_type'        => AccountType::class,
            'normal_balance'      => NormalBalance::class,
            'required_dimensions' => 'array',
            'is_control'          => 'boolean',
            'requires_partner'    => 'boolean',
            'is_active'           => 'boolean',
            'active_from'         => 'date',
            'active_to'           => 'date',
            'meta'                => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class, 'account_id');
    }

    /** Verilen tarihte kullanılabilir hesaplar. */
    public function scopeUsableOn(Builder $query, string $tarih): Builder
    {
        return $query->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('active_from')->orWhere('active_from', '<=', $tarih))
            ->where(fn (Builder $q) => $q->whereNull('active_to')->orWhere('active_to', '>=', $tarih));
    }

    /** Elle fiş satırı yazılabilir mi. Kontrol hesaplarına yalnız alt defter yazar. */
    public function allowsManualEntry(): bool
    {
        return ! $this->is_control;
    }

    /** Hesabın tam adı: "600 — Yurtiçi satışlar". */
    public function displayName(): string
    {
        return "{$this->code} — {$this->name}";
    }

    public function isUsed(): bool
    {
        return $this->lines()->exists();
    }
}
