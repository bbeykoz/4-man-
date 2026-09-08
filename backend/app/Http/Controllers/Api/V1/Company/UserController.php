<?php

namespace App\Http\Controllers\Api\V1\Company;

use App\Http\Controllers\Controller;
use App\Http\Requests\Company\CreateUserRequest;
use App\Http\Resources\UserResource;
use App\Repositories\UserRepository;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function __construct(
        private readonly UserService $userService,
        private readonly UserRepository $userRepository,
    ) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.users.view'), 403, 'Yetkiniz yok.');

        $users = $this->userRepository->paginateCompanyUsers(
            companyId:    $request->user()->company_id,
            perPage:      $request->integer('per_page', 15),
            search:       $request->string('search')->toString() ?: null,
            status:       $request->input('status'),
            departmentId: $request->input('department_id'),
            roleId:       $request->input('role_id'),
        );

        return response()->json([
            'success' => true,
            'data'    => UserResource::collection($users->items()),
            'meta'    => [
                'current_page' => $users->currentPage(),
                'per_page'     => $users->perPage(),
                'total'        => $users->total(),
                'last_page'    => $users->lastPage(),
            ],
        ]);
    }

    public function store(CreateUserRequest $request): JsonResponse
    {
        $user = $this->userService->create($request->validated(), $request->user());

        return response()->json([
            'success' => true,
            'data'    => new UserResource($user->load(['roles', 'department'])),
            'message' => 'Kullanıcı başarıyla oluşturuldu.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.users.view'), 403);

        $user = $this->userRepository->findOrFail($id, ['roles', 'department', 'sessions']);

        abort_unless(
            $user->company_id === $request->user()->company_id || $request->user()->isSuperAdmin(),
            403,
            'Bu kullanıcıya erişim yetkiniz yok.'
        );

        return response()->json(['success' => true, 'data' => new UserResource($user)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.users.edit'), 403);

        $user = $this->userRepository->findOrFail($id);
        abort_unless($user->company_id === $request->user()->company_id || $request->user()->isSuperAdmin(), 403);

        $request->validate([
            'name'          => ['sometimes', 'string', 'max:100'],
            'phone'         => ['nullable', 'string', 'max:20'],
            'title'         => ['nullable', 'string', 'max:100'],
            'department_id' => ['nullable', 'uuid', 'exists:departments,id'],
            'role_id'       => ['nullable', 'uuid', 'exists:roles,id'],
            'status'        => ['nullable', 'in:active,inactive'],
            'email'         => ['sometimes', 'email', "unique:users,email,{$id}"],
        ]);

        $updated = $this->userService->update($user, $request->all(), $request->user());

        return response()->json([
            'success' => true,
            'data'    => new UserResource($updated->load(['roles', 'department'])),
            'message' => 'Kullanıcı güncellendi.',
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.users.delete'), 403);

        $user = $this->userRepository->findOrFail($id);
        abort_unless($user->company_id === $request->user()->company_id || $request->user()->isSuperAdmin(), 403);
        abort_if($user->id === $request->user()->id, 422, 'Kendi hesabınızı silemezsiniz.');

        $this->userService->delete($user, $request->user());

        return response()->json(['success' => true, 'message' => 'Kullanıcı silindi.']);
    }

    public function activate(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.users.edit'), 403);

        $user = $this->userRepository->findOrFail($id);
        $this->userService->activate($user, $request->user());

        return response()->json(['success' => true, 'message' => 'Kullanıcı aktifleştirildi.']);
    }

    public function deactivate(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.users.edit'), 403);
        abort_if($id === $request->user()->id, 422, 'Kendi hesabınızı devre dışı bırakamazsınız.');

        $user = $this->userRepository->findOrFail($id);
        $this->userService->deactivate($user, $request->user());

        return response()->json(['success' => true, 'message' => 'Kullanıcı devre dışı bırakıldı.']);
    }
}
