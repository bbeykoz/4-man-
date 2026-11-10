<?php

namespace App\Models;

use App\Enums\CompanyStatus;
use App\Support\CountryPack;
use Carbon\CarbonImmutable;
use App\Enums\PlanType;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Cache;

class Company extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'status'   => CompanyStatus::class,
            'plan_type'=> PlanType::class,
            'settings' => 'array',
            'max_users'=> 'integer',
            'max_departments' => 'integer',
            'fiscal_year_start_month' => 'integer',
            'vat_registered'          => 'boolean',
            'vat_registered_at'       => 'date',
        ];
    }

    // ─── Ülke paketi ────────────────────────────────────────────────

    /** Şirketin ülke paketi: para birimi, saat dilimi, vergi kodları, hesap planı şablonu. */
    public function countryPack(): array
    {
        return CountryPack::forCompany($this);
    }

    /** Defter para birimi. İşlem para birimi belge bazında farklı olabilir. */
    public function functionalCurrency(): string
    {
        return $this->functional_currency ?: $this->countryPack()['currency'];
    }

    /** Mali yılın verilen takvim yılındaki başlangıç tarihi. */
    public function fiscalYearStart(int $yil): CarbonImmutable
    {
        return CarbonImmutable::create($yil, $this->fiscal_year_start_month ?: 1, 1)->startOfDay();
    }

    /** Resmi belgelerin dili; arayüz dilinden ayrıdır. */
    public function documentLocale(): string
    {
        return $this->document_locale ?: $this->countryPack()['document_locale'];
    }

    /** Ülke paketinde bu raporlama yükümlülüğü var mı (saf_t, vies, e_fatura …). */
    public function requiresReporting(string $anahtar): bool
    {
        return (bool) data_get($this->countryPack(), "reporting.$anahtar", false);
    }

    // ─── Relations ──────────────────────────────────────────────────

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function departments(): HasMany
    {
        return $this->hasMany(Department::class);
    }

    public function roles(): HasMany
    {
        return $this->hasMany(Role::class);
    }

    public function modules(): BelongsToMany
    {
        return $this->belongsToMany(Module::class, 'company_modules')
            ->withPivot(['is_active', 'settings', 'activated_at', 'activated_by']);
    }

    public function activeModules(): BelongsToMany
    {
        return $this->modules()->wherePivot('is_active', true);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function settings(): HasMany
    {
        return $this->hasMany(Setting::class);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    public function isModuleEnabled(string $moduleSlug): bool
    {
        return Cache::remember(
            "company_module_{$this->id}_{$moduleSlug}",
            now()->addMinutes(5),
            fn() => $this->modules()
                ->where('slug', $moduleSlug)
                ->wherePivot('is_active', true)
                ->exists()
        );
    }

    public function isActive(): bool
    {
        return $this->status === CompanyStatus::Active;
    }

    public function hasReachedUserLimit(): bool
    {
        return $this->users()->count() >= $this->max_users;
    }

    public function getSetting(string $key, mixed $default = null): mixed
    {
        return $this->settings()->where('key', $key)->value('value') ?? $default;
    }

    // ─── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', CompanyStatus::Active);
    }
}
