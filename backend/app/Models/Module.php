<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Cache;

class Module extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_active'   => 'boolean',
            'order_index' => 'integer',
        ];
    }

    // ─── Relations ──────────────────────────────────────────────────

    public function companies(): BelongsToMany
    {
        return $this->belongsToMany(Company::class, 'company_modules')
            ->withPivot(['is_active', 'settings', 'activated_at']);
    }

    // ─── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeOrdered($query)
    {
        return $query->orderBy('order_index');
    }

    // ─── Helpers ────────────────────────────────────────────────────

    /**
     * Süper admin tarafından sistem genelinde pasife alınmamış mı?
     * Tanımsız slug engellenmez; şirket bazlı kontrol ayrıca yapılır.
     */
    public static function isSlugActive(string $slug): bool
    {
        return Cache::rememberForever(
            self::activeCacheKey($slug),
            fn() => (bool) (static::where('slug', $slug)->value('is_active') ?? true)
        );
    }

    public static function forgetActiveCache(string $slug): void
    {
        Cache::forget(self::activeCacheKey($slug));
    }

    private static function activeCacheKey(string $slug): string
    {
        return "module_active_{$slug}";
    }
}
