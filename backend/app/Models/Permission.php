<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Permission extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    public $timestamps = true;

    // ─── Relations ──────────────────────────────────────────────────

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_permissions');
    }

    // ─── Scopes ─────────────────────────────────────────────────────

    public function scopeForModule($query, string $module)
    {
        return $query->where('module', $module);
    }

    public function scopeForAction($query, string $action)
    {
        return $query->where('action', $action);
    }

    // ─── Static Helpers ─────────────────────────────────────────────

    public static function getGrouped(): array
    {
        return static::all()
            ->groupBy('module')
            ->map(fn($items) => $items->groupBy('resource'))
            ->toArray();
    }
}
