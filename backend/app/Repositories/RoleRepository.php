<?php

namespace App\Repositories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Collection;

class RoleRepository extends BaseRepository
{
    public function __construct()
    {
        parent::__construct(new Role());
    }

    public function getForCompany(?string $companyId): Collection
    {
        return $this->query()
            ->forCompany($companyId)
            ->where('level', '>', 1)
            ->with(['permissions', 'department:id,name'])
            ->withCount('users')
            ->orderBy('level')
            ->orderBy('display_name')
            ->get();
    }

    public function getSystemRoles(): Collection
    {
        return $this->query()->system()->with('permissions')->get();
    }

    public function findBySlugAndCompany(string $slug, ?string $companyId): ?Role
    {
        return $this->query()
            ->where('slug', $slug)
            ->where(fn($q) => $q->whereNull('company_id')->orWhere('company_id', $companyId))
            ->first();
    }
}
