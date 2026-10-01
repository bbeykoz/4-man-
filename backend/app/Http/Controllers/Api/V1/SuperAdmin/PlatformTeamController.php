<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\ActivityLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Platform ekibi: hizmeti veren tarafın kendi çalışanları.
 * Bu kullanıcıların şirketi yoktur (company_id null) ve seviye 1 platform rolleri taşırlar.
 * Süper admin rolü (is_super) buradan atanamaz; o rol yalnızca kurulumda verilir.
 */
class PlatformTeamController extends Controller
{
    public function __construct(private readonly ActivityLogService $logger) {}

    /** Ekip üyeleri: süper admin dahil tüm platform kullanıcıları. */
    public function index(Request $request): JsonResponse
    {
        $users = User::query()
            ->whereNull('company_id')
            ->whereHas('roles', fn ($q) => $q->where('level', 1))
            ->with('roles')
            ->when($request->string('search')->toString(), function ($q, $search) {
                $q->where(fn ($x) => $x->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%"));
            })
            ->orderBy('created_at')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => UserResource::collection($users),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => ['required', 'string', 'max:255'],
            'email'    => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role_id'  => ['required', 'uuid', Rule::exists('roles', 'id')->whereNull('company_id')],
        ], [
            'email.unique' => 'Bu e-posta zaten kullanılıyor.',
            'password.min' => 'Şifre en az 8 karakter olmalı.',
        ]);

        $role = $this->assignableRole($data['role_id']);

        if (!$role) {
            return response()->json([
                'success' => false,
                'message' => 'Bu rol ekip üyesine atanamaz.',
            ], 422);
        }

        $user = User::create([
            'name'              => $data['name'],
            'email'             => $data['email'],
            'password'          => Hash::make($data['password']),
            'status'            => 'active',
            'company_id'        => null,
            'email_verified_at' => now(),
        ]);

        $user->roles()->attach($role->id, [
            'assigned_at' => now(),
            'assigned_by' => $request->user()->id,
        ]);

        $this->logger->log(
            action: 'platform.team.created',
            model: $user,
            newValues: ['email' => $user->email, 'role' => $role->display_name],
            description: "Ekip üyesi eklendi: {$user->email} ({$role->display_name})",
        );

        return response()->json([
            'success' => true,
            'message' => 'Ekip üyesi eklendi.',
            'data'    => new UserResource($user->fresh('roles')),
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $this->findTeamMember($id);

        $data = $request->validate([
            'name'     => ['sometimes', 'string', 'max:255'],
            'status'   => ['sometimes', Rule::in(['active', 'inactive'])],
            'password' => ['sometimes', 'nullable', 'string', 'min:8'],
            'role_id'  => ['sometimes', 'uuid', Rule::exists('roles', 'id')->whereNull('company_id')],
        ]);

        if ($user->isSuperAdmin() && $request->user()->id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Süper admin hesabı buradan değiştirilemez.',
            ], 403);
        }

        if (isset($data['role_id'])) {
            $role = $this->assignableRole($data['role_id']);

            if (!$role) {
                return response()->json([
                    'success' => false,
                    'message' => 'Bu rol ekip üyesine atanamaz.',
                ], 422);
            }

            $user->roles()->sync([$role->id => [
                'assigned_at' => now(),
                'assigned_by' => $request->user()->id,
            ]]);
        }

        $user->update(array_filter([
            'name'     => $data['name']   ?? null,
            'status'   => $data['status'] ?? null,
            'password' => isset($data['password']) && $data['password'] ? Hash::make($data['password']) : null,
        ]));

        $this->forgetCaches($user);
        $this->logger->log(
            action: 'platform.team.updated',
            model: $user,
            newValues: ['email' => $user->email],
            description: "Ekip üyesi güncellendi: {$user->email}",
        );

        return response()->json([
            'success' => true,
            'message' => 'Ekip üyesi güncellendi.',
            'data'    => new UserResource($user->fresh('roles')),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $this->findTeamMember($id);

        if ($user->isSuperAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Süper admin hesabı silinemez.',
            ], 403);
        }

        if ($user->id === $request->user()->id) {
            return response()->json([
                'success' => false,
                'message' => 'Kendi hesabınızı silemezsiniz.',
            ], 422);
        }

        $email = $user->email;
        $user->tokens()->delete();
        $user->delete();

        $this->logger->log(
            action: 'platform.team.deleted',
            newValues: ['email' => $email],
            description: "Ekip üyesi silindi: {$email}",
        );

        return response()->json(['success' => true, 'message' => 'Ekip üyesi silindi.']);
    }

    private function findTeamMember(string $id): User
    {
        return User::whereNull('company_id')
            ->whereHas('roles', fn ($q) => $q->where('level', 1))
            ->findOrFail($id);
    }

    /** Süper admin rolü atanamaz; sadece platform rolleri. */
    private function assignableRole(string $roleId): ?Role
    {
        return Role::whereNull('company_id')
            ->where('level', 1)
            ->where('is_super', false)
            ->find($roleId);
    }

    private function forgetCaches(User $user): void
    {
        Cache::forget("user_is_super_{$user->id}");
        Cache::forget("user_is_platform_{$user->id}");
        Cache::forget("user_perms_{$user->id}_{$user->company_id}");
    }
}
