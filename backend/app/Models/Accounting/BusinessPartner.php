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

/**
 * Cari hesap (iş ortağı).
 *
 * Müşteri ve tedarikçi rolleri aynı kayıtta ayrı bayraklar. Bakiye kolonu
 * yok: bakiye her zaman defterden hesaplanır, böylece cari kartı ile defter
 * ayrışamaz.
 */
class BusinessPartner extends Model
{
    use HasUuid, SoftDeletes, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_customer'     => 'boolean',
            'is_supplier'     => 'boolean',
            'vat_registered'  => 'boolean',
            'vat_verified_at' => 'datetime',
            'is_active'       => 'boolean',
            'is_blocked'      => 'boolean',
            'credit_limit'    => 'decimal:6',
            'discount_rate'   => 'decimal:4',
            'payment_days'    => 'integer',
            'meta'            => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(PartnerAddress::class, 'partner_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'partner_id');
    }

    public function journalLines(): HasMany
    {
        return $this->hasMany(JournalLine::class, 'partner_id');
    }

    public function receivableAccount(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'receivable_account_id');
    }

    public function payableAccount(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'payable_account_id');
    }

    // ─── Kapsamlar ──────────────────────────────────────────────────

    public function scopeCustomers(Builder $q): Builder
    {
        return $q->where('is_customer', true);
    }

    public function scopeSuppliers(Builder $q): Builder
    {
        return $q->where('is_supplier', true);
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true)->where('is_blocked', false);
    }

    public function scopeSearch(Builder $q, string $metin): Builder
    {
        $a = '%' . $metin . '%';

        return $q->where(fn (Builder $s) => $s
            ->where('legal_name', 'ilike', $a)
            ->orWhere('trade_name', 'ilike', $a)
            ->orWhere('code', 'ilike', $a)
            ->orWhere('vat_number', 'ilike', $a)
            ->orWhere('registration_number', 'ilike', $a));
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    public function displayName(): string
    {
        return $this->trade_name ?: $this->legal_name;
    }

    /** Belge kesilebilir mi; bloke ve pasif cariye yeni belge yazılmaz. */
    public function canTransact(): bool
    {
        return $this->is_active && ! $this->is_blocked;
    }

    /** AB içi mi; VIES bildirimi ve reverse charge kararı buna bakar. */
    public function isEuCounterparty(string $sirketUlkesi): bool
    {
        return $this->country_code !== $sirketUlkesi && $this->vat_registered;
    }

    /** Vade tarihi: belge tarihine ödeme gününü ekler. */
    public function dueDateFor(string $belgeTarihi): ?string
    {
        if (! $this->payment_days) {
            return null;
        }

        return \Illuminate\Support\Carbon::parse($belgeTarihi)->addDays($this->payment_days)->toDateString();
    }

    public function defaultAddress(string $tur = 'billing'): ?PartnerAddress
    {
        return $this->addresses()
            ->where('type', $tur)
            ->orderByDesc('is_default')
            ->first();
    }
}
