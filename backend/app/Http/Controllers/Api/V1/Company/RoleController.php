<?php

namespace App\Http\Controllers\Api\V1\Company;

use App\Http\Controllers\Controller;
use App\Http\Requests\Company\CreateRoleRequest;
use App\Http\Resources\RoleResource;
use App\Repositories\RoleRepository;
use App\Services\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function __construct(
        private readonly PermissionService $permissionService,
        private readonly RoleRepository $roleRepository,
    ) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.roles.view'), 403);

        $roles = $this->roleRepository->getForCompany($request->user()->company_id);

        return response()->json(['success' => true, 'data' => RoleResource::collection($roles)]);
    }

    public function store(CreateRoleRequest $request): JsonResponse
    {
        $role = $this->permissionService->createRole(
            $request->validated(),
            $request->user()->company_id,
        );

        return response()->json([
            'success' => true,
            'data'    => new RoleResource($role),
            'message' => 'Rol oluşturuldu.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.roles.view'), 403);

        $role = $this->roleRepository->findOrFail($id, ['permissions', 'users']);

        return response()->json(['success' => true, 'data' => new RoleResource($role)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.roles.edit'), 403);

        $request->validate([
            'display_name'  => ['sometimes', 'string', 'max:100'],
            'description'   => ['nullable', 'string', 'max:500'],
            'level'         => ['sometimes', 'integer', 'min:2', 'max:5'],
            'department_id' => ['nullable', 'uuid', 'exists:departments,id'],
            'permissions'   => ['nullable', 'array'],
            'permissions.*' => ['string'],
        ]);

        $role    = $this->roleRepository->findOrFail($id);
        $updated = $this->permissionService->updateRole($role, $request->all());

        return response()->json([
            'success' => true,
            'data'    => new RoleResource($updated),
            'message' => 'Rol güncellendi.',
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.roles.delete'), 403);

        $role = $this->roleRepository->findOrFail($id);

        try {
            $this->permissionService->deleteRole($role);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json(['success' => true, 'message' => 'Rol silindi.']);
    }

    public function permissions(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->permissionService->getAllPermissionsGrouped(),
        ]);
    }
}
