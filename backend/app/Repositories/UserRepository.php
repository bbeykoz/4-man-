<?php

namespace App\Repositories;

use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class UserRepository extends BaseRepository
{
    public function __construct()
    {
        parent::__construct(new User());
    }

    public function getCompanyUsers(string $companyId): \Illuminate\Database\Eloquent\Builder
    {
        return $this->query()
            ->where('company_id', $companyId)
            ->with(['roles', 'department']);
    }

    public function paginateCompanyUsers(
        string $companyId,
        int $perPage = 15,
        ?string $search = null,
        ?string $status = null,
        ?string $departmentId = null,
        ?string $roleId = null,
    ): LengthAwarePaginator {
        $query = $this->query()
            ->where('company_id', $companyId)
            ->with(['roles', 'department']);

        if ($search) {
            $query->where(fn($q) => $q
                ->where('name', 'ilike', "%{$search}%")
                ->orWhere('email', 'ilike', "%{$search}%")
            );
        }

        if ($status) {
            $query->where('status', $status);
        }

        if ($departmentId) {
            $query->where('department_id', $departmentId);
        }

        if ($roleId) {
            $query->whereHas('roles', fn($q) => $q->where('roles.id', $roleId));
        }

        return $query->orderBy('name')->paginate($perPage);
    }

    public function findByEmail(string $email): ?User
    {
        return $this->query()->where('email', $email)->first();
    }

    public function getDepartmentUsers(string $departmentId): Collection
    {
        return $this->query()
            ->where('department_id', $departmentId)
            ->with('roles')
            ->active()
            ->get();
    }

    public function getActiveUsersCount(string $companyId): int
    {
        return $this->query()
            ->where('company_id', $companyId)
            ->active()
            ->count();
    }

    public function getSuperAdmins(): Collection
    {
        return $this->query()
            ->whereHas('roles', fn($q) => $q->where('level', 1))
            ->get();
    }

    public function paginateAll(int $perPage = 25, array $filters = []): LengthAwarePaginator
    {
        $query = $this->query()->with(['company', 'roles', 'department']);

        if (!empty($filters['search'])) {
            $s = $filters['search'];
            $query->where(fn($q) => $q
                ->where('name', 'ilike', "%{$s}%")
                ->orWhere('email', 'ilike', "%{$s}%")
            );
        }

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (!empty($filters['company_id'])) {
            $query->where('company_id', $filters['company_id']);
        }

        if (!empty($filters['role_level'])) {
            $query->whereHas('roles', fn($q) => $q->where('level', $filters['role_level']));
        }

        return $query->orderBy('created_at', 'desc')->paginate($perPage);
    }
}
