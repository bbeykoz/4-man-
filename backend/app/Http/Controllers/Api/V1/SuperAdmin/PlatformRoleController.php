<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Services\ActivityLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Platform ekibinin rolleri ve izinleri.
 * Süper admin rolü (is_super) listelenir ama değiştirilemez; sınırsız kalması gerekir.
 */
class PlatformRoleController extends Controller
{
    public function __construct(private readonly ActivityLogService $logger) {}

    public function index(): JsonResponse
    {
        $roles = Role::whereNull('company_id')
            ->where('level', 1)
            ->with('permissions:id,name,display_name,group')
            ->withCount('users')
            ->orderByDesc('is_super')
            ->orderBy('display_name')
            ->get()
            ->map(fn (Role $role) => [
                'id'           => $role->id,
                'slug'         => $role->slug,
                'display_name' => $role->display_name,
                'description'  => $role->description,
                'color'        => $role->color,
                'is_super'     => (bool) $role->is_super,
                'is_system'    => (bool) $role->is_system,
                'users_count'  => $role->users_count,
                'permissions'  => $role->permissions->pluck('name'),
            ]);

        return response()->json(['success' => true, 'data' => $roles]);
    }

    /** İzin listesi: platform izinleri önce, sonra diğer gruplar. */
    public function permissions(): JsonResponse
    {
        $permissions = Permission::orderByRaw("case when \"group\" = 'platform' then 0 else 1 end")
            ->orderBy('group')
            ->orderBy('name')
            ->get(['id', 'name', 'display_name', 'group'])
            ->groupBy('group');

        return response()->json(['success' => true, 'data' => $permissions]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'display_name' => ['required', 'string', 'max:120'],
            'description'  => ['nullable', 'string', 'max:500'],
            'color'        => ['nullable', 'string', 'max:30'],
            'permissions'  => ['array'],
            'permissions.*'=> ['string', 'exists:permissions,name'],
        ]);

        $slug = 'platform-' . Str::slug($data['display_name']);

        if (Role::whereNull('company_id')->where('slug', $slug)->exists()) {
            return response()->json(['success' => false, 'message' => 'Bu adda bir rol zaten var.'], 422);
        }

        $role = Role::create([
            'company_id'   => null,
            'name'         => $slug,
            'slug'         => $slug,
            'display_name' => $data['display_name'],
            'description'  => $data['description'] ?? null,
            'color'        => $data['color'] ?? 'zinc',
            'level'        => 1,
            'is_system'    => false,
            'is_super'     => false,
        ]);

        $role->permissions()->sync(Permission::whereIn('name', $data['permissions'] ?? [])->pluck('id'));

        $this->logger->log(
            action: 'platform.role.created',
            model: $role,
            newValues: ['role' => $role->display_name, 'permissions' => $data['permissions'] ?? []],
            description: "Platform rolü oluşturuldu: {$role->display_name}",
        );

        return response()->json(['success' => true, 'message' => 'Rol oluşturuldu.'], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $role = Role::whereNull('company_id')->where('level', 1)->findOrFail($id);

        if ($role->is_super) {
            return response()->json([
                'success' => false,
                'message' => 'Süper admin rolü değiştirilemez.',
            ], 403);
        }

        $data = $request->validate([
            'display_name' => ['sometimes', 'string', 'max:120'],
            'description'  => ['sometimes', 'nullable', 'string', 'max:500'],
            'color'        => ['sometimes', 'nullable', 'string', 'max:30'],
            'permissions'  => ['sometimes', 'array'],
            'permissions.*'=> ['string', 'exists:permissions,name'],
        ]);

        $role->update(array_filter([
            'display_name' => $data['display_name'] ?? null,
            'description'  => $data['description']  ?? null,
            'color'        => $data['color']        ?? null,
        ], fn ($v) => $v !== null));

        if (array_key_exists('permissions', $data)) {
            $role->permissions()->sync(Permission::whereIn('name', $data['permissions'])->pluck('id'));
            $this->forgetRoleUserCaches($role);
        }

        $this->logger->log(
            action: 'platform.role.updated',
            model: $role,
            newValues: ['role' => $role->display_name, 'permissions' => $data['permissions'] ?? null],
            description: "Platform rolü güncellendi: {$role->display_name}",
        );

        return response()->json(['success' => true, 'message' => 'Rol güncellendi.']);
    }

    public function destroy(string $id): JsonResponse
    {
        $role = Role::whereNull('company_id')->where('level', 1)->withCount('users')->findOrFail($id);

        if ($role->is_super) {
            return response()->json(['success' => false, 'message' => 'Süper admin rolü silinemez.'], 403);
        }

        if ($role->users_count > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Bu rolde ekip üyesi var. Önce onları başka role taşıyın.',
            ], 422);
        }

        $name = $role->display_name;
        $role->permissions()->detach();
        $role->delete();

        $this->logger->log(
            action: 'platform.role.deleted',
            newValues: ['role' => $name],
            description: "Platform rolü silindi: {$name}",
        );

        return response()->json(['success' => true, 'message' => 'Rol silindi.']);
    }

    /** İzin değişince o roldeki kullanıcıların önbelleği düşer, değişiklik hemen geçerli olur. */
    private function forgetRoleUserCaches(Role $role): void
    {
        foreach ($role->users()->get(['users.id', 'users.company_id']) as $user) {
            Cache::forget("user_is_super_{$user->id}");
            Cache::forget("user_is_platform_{$user->id}");
            Cache::forget("user_perms_{$user->id}_{$user->company_id}");
        }
    }
}
