<?php

namespace App\Models;

use App\Enums\UserStatus;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasUuid, SoftDeletes, HasCompanyScope;

    protected $guarded = ['id'];

    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at'  => 'datetime',
            'last_login_at'      => 'datetime',
            'two_factor_enabled' => 'boolean',
            'status'             => UserStatus::class,
            'preferences'        => 'array',
            'password'           => 'hashed',
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

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')
            ->withPivot(['company_id', 'department_id', 'assigned_by', 'assigned_at', 'expires_at'])
            ->where(fn($q) => $q->whereNull('user_roles.expires_at')->orWhere('user_roles.expires_at', '>', now()));
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(UserSession::class);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    // ─── Permission Helpers ──────────────────────────────────────────

    public function isSuperAdmin(): bool
    {
        return Cache::remember(
            "user_is_super_{$this->id}",
            now()->addMinutes(10),
            fn() => $this->roles()->where('level', 1)->exists()
        );
    }

    public function isCompanyOwner(): bool
    {
        return $this->roles()->where('level', 2)->exists();
    }

    public function isDepartmentManager(): bool
    {
        return $this->roles()->where('level', 3)->exists();
    }

    public function getRoleLevel(): int
    {
        return $this->roles()->min('level') ?? 5;
    }

    public function getPermissions(): \Illuminate\Support\Collection
    {
        return Cache::remember(
            "user_perms_{$this->id}_{$this->company_id}",
            now()->addMinutes(10),
            fn() => $this->roles()
                ->with('permissions')
                ->get()
                ->flatMap(fn($role) => $role->permissions)
                ->pluck('name')
                ->unique()
        );
    }

    public function hasPermission(string $permission): bool
    {
        if ($this->isSuperAdmin() || $this->isCompanyOwner()) {
            return true;
        }
        return $this->getPermissions()->contains($permission);
    }

    public function hasAnyPermission(array $permissions): bool
    {
        if ($this->isSuperAdmin() || $this->isCompanyOwner()) {
            return true;
        }
        $userPerms = $this->getPermissions();
        foreach ($permissions as $permission) {
            if ($userPerms->contains($permission)) {
                return true;
            }
        }
        return false;
    }

    public function clearPermissionCache(): void
    {
        Cache::forget("user_perms_{$this->id}_{$this->company_id}");
        Cache::forget("user_is_super_{$this->id}");
    }

    // ─── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', UserStatus::Active);
    }

    public function scopeVerified($query)
    {
        return $query->whereNotNull('email_verified_at');
    }

    // ─── Accessors ──────────────────────────────────────────────────

    public function getAvatarUrlAttribute(): string
    {
        if ($this->avatar) {
            return Storage::disk('s3')->url($this->avatar);
        }
        return 'https://ui-avatars.com/api/?name=' . urlencode($this->name) . '&background=2563eb&color=fff&bold=true';
    }

    public function updateLastLogin(): void
    {
        $this->updateQuietly([
            'last_login_at' => now(),
            'last_login_ip' => request()->ip(),
        ]);
    }
}
