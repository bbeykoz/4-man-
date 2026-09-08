<?php

namespace App\Services;

use App\Models\Permission;
use App\Models\Role;
use App\Repositories\RoleRepository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PermissionService
{
    public function __construct(
        private readonly RoleRepository $roleRepository,
        private readonly ActivityLogService $activityLogService,
    ) {}

    public function createRole(array $data, ?string $companyId = null): Role
    {
        return DB::transaction(function () use ($data, $companyId) {
            $role = Role::create([
                'company_id'    => $companyId,
                'department_id' => $data['department_id'] ?? null,
                'name'          => Str::slug($data['display_name']),
                'slug'          => Str::slug($data['display_name']),
                'display_name'  => $data['display_name'],
                'description'   => $data['description'] ?? null,
                'level'         => $data['level'] ?? 4,
                'color'         => $data['color'] ?? 'gray',
                'is_system'     => false,
            ]);

            if (!empty($data['permissions'])) {
                $permIds = Permission::whereIn('name', $data['permissions'])->pluck('id');
                $role->permissions()->sync($permIds);
            }

            $this->activityLogService->log(
                action: 'role.created',
                model: $role,
                newValues: ['name' => $role->display_name],
            );

            return $role->load('permissions');
        });
    }

    public function updateRole(Role $role, array $data): Role
    {
        return DB::transaction(function () use ($role, $data) {
            $updateData = array_filter([
                'display_name'  => $data['display_name'] ?? null,
                'description'   => $data['description'] ?? null,
                'level'         => $data['level'] ?? null,
                'color'         => $data['color'] ?? null,
            ], fn($v) => $v !== null);

            // department_id can be explicitly null (to remove) so handle separately
            if (array_key_exists('department_id', $data)) {
                $updateData['department_id'] = $data['department_id'];
            }

            $role->update($updateData);

            if (isset($data['permissions'])) {
                $permIds = Permission::whereIn('name', $data['permissions'])->pluck('id');
                $role->permissions()->sync($permIds);

                // Cache temizle
                $role->users()->each(fn($u) => $u->clearPermissionCache());
            }

            $this->activityLogService->log('role.updated', $role);

            return $role->load('permissions');
        });
    }

    public function deleteRole(Role $role): void
    {
        if ($role->is_system) {
            throw new \Exception('Sistem rolleri silinemez.');
        }

        if ($role->users()->exists()) {
            throw new \Exception('Bu role atanmış kullanıcılar var. Önce rolleri kaldırın.');
        }

        $role->delete();
        $this->activityLogService->log('role.deleted', $role);
    }

    public function assignRole(string $userId, string $roleId, ?string $departmentId, string $assignedBy): void
    {
        DB::table('user_roles')->updateOrInsert(
            ['user_id' => $userId, 'role_id' => $roleId],
            [
                'department_id' => $departmentId,
                'assigned_by'   => $assignedBy,
                'assigned_at'   => now(),
            ]
        );

        $user = \App\Models\User::find($userId);
        $user?->clearPermissionCache();
    }

    public function revokeRole(string $userId, string $roleId): void
    {
        DB::table('user_roles')
            ->where('user_id', $userId)
            ->where('role_id', $roleId)
            ->delete();

        $user = \App\Models\User::find($userId);
        $user?->clearPermissionCache();
    }

    public function getAllPermissionsGrouped(): array
    {
        return Permission::all()
            ->groupBy('module')
            ->map(fn($perms) => $perms->groupBy('resource'))
            ->toArray();
    }
}
