<?php

namespace App\Models;

use App\Enums\RoleLevel;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Role extends Model
{
    use HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'level'     => 'integer',
            'is_system' => 'boolean',
        ];
    }

    // ─── Relations ──────────────────────────────────────────────────

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_roles')
            ->withPivot(['company_id', 'department_id', 'assigned_by', 'assigned_at']);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    public function getLevelLabel(): string
    {
        return RoleLevel::from($this->level)->label();
    }

    public function isHigherThan(Role $other): bool
    {
        return $this->level < $other->level;
    }

    public function syncPermissionsByNames(array $permissionNames): void
    {
        $permissions = Permission::whereIn('name', $permissionNames)->pluck('id');
        $this->permissions()->sync($permissions);

        // Cache temizle - bu role sahip tüm kullanıcılar için
        $this->users()->each(fn($user) => $user->clearPermissionCache());
    }

    // ─── Scopes ─────────────────────────────────────────────────────

    public function scopeForCompany($query, ?string $companyId)
    {
        return $query->where(fn($q) => $q
            ->whereNull('company_id')
            ->orWhere('company_id', $companyId)
        );
    }

    public function scopeSystem($query)
    {
        return $query->where('is_system', true);
    }
}
