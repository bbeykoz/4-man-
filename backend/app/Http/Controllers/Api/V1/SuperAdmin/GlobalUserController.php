<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Company;
use App\Repositories\UserRepository;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class GlobalUserController extends Controller
{
    public function __construct(
        private readonly UserRepository $userRepo,
        private readonly UserService    $userService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $users = $this->userRepo->paginateAll(
            perPage: $request->integer('per_page', 25),
            filters: $request->only(['search', 'status', 'company_id', 'role_level']),
        );

        return response()->json([
            'success' => true,
            'data'    => UserResource::collection($users->items()),
            'meta'    => [
                'total'        => $users->total(),
                'per_page'     => $users->perPage(),
                'current_page' => $users->currentPage(),
                'last_page'    => $users->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_id'    => 'required|uuid|exists:companies,id',
            'name'          => 'required|string|max:255',
            'email'         => ['required', 'email', Rule::unique('users', 'email')->whereNull('deleted_at')],
            'password'      => 'required|string|min:8',
            'phone'         => 'nullable|string|max:20',
            'role_id'       => 'nullable|uuid|exists:roles,id',
            'department_id' => 'nullable|uuid|exists:departments,id',
        ]);

        $company = Company::findOrFail($validated['company_id']);

        if ($company->hasReachedUserLimit()) {
            return response()->json(['success' => false, 'message' => 'Şirket kullanıcı limitine ulaşıldı.'], 422);
        }

        $user = $this->userService->create($validated, Auth::user());

        return response()->json([
            'success' => true,
            'message' => 'Kullanıcı oluşturuldu.',
            'data'    => new UserResource($user->load(['company', 'roles'])),
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        return response()->json([
            'success' => true,
            'data'    => new UserResource($user->load(['company', 'department', 'roles.permissions'])),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        if ($user->isSuperAdmin()) {
            return response()->json(['success' => false, 'message' => 'Süper admin hesabı düzenlenemez.'], 403);
        }

        $validated = $request->validate([
            'name'   => 'sometimes|string|max:255',
            'email'  => 'sometimes|email|unique:users,email,' . $user->id,
            'phone'  => 'nullable|string|max:20',
            'title'  => 'nullable|string|max:100',
            'status' => 'sometimes|in:active,inactive,suspended',
        ]);

        $updated = $this->userService->update($user, $validated, Auth::user());

        return response()->json([
            'success' => true,
            'message' => 'Kullanıcı güncellendi.',
            'data'    => new UserResource($updated->load(['company', 'roles'])),
        ]);
    }

    public function impersonate(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        if ($user->isSuperAdmin()) {
            return response()->json(['success' => false, 'message' => 'Süper admin hesabına bürünülemez.'], 403);
        }

        $token = $user->createToken('impersonation', ['*'], now()->addHours(2))->plainTextToken;

        return response()->json([
            'success' => true,
            'data'    => ['token' => $token, 'user' => new UserResource($user)],
        ]);
    }

    public function suspend(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        if ($user->isSuperAdmin()) {
            return response()->json(['success' => false, 'message' => 'Süper admin hesabı askıya alınamaz.'], 403);
        }

        $this->userService->deactivate($user, Auth::user());

        return response()->json(['success' => true, 'message' => 'Kullanıcı askıya alındı.']);
    }

    public function activate(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);
        $this->userService->activate($user, Auth::user());

        return response()->json(['success' => true, 'message' => 'Kullanıcı aktifleştirildi.']);
    }

    // 2FA'yı tekrar aktif et (secret varsa)
    public function enable2FA(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        if (! $user->two_factor_secret) {
            return response()->json(['success' => false, 'message' => 'Kullanıcının 2FA kurulumu yok.'], 422);
        }

        if ($user->two_factor_enabled) {
            return response()->json(['success' => false, 'message' => '2FA zaten aktif.'], 422);
        }

        $user->update(['two_factor_enabled' => true]);

        return response()->json(['success' => true, 'message' => '2FA tekrar aktif edildi.']);
    }

    // 2FA'yı pasife al (secret silinmez, sadece zorunluluk kalkar)
    public function disable2FA(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        if (! $user->two_factor_enabled) {
            return response()->json(['success' => false, 'message' => 'Bu kullanıcıda 2FA zaten devre dışı.'], 422);
        }

        $user->update(['two_factor_enabled' => false]);

        return response()->json(['success' => true, 'message' => '2FA pasife alındı. Kullanıcı 2FA olmadan giriş yapabilir.']);
    }

    // 2FA'yı tamamen sil (secret silinir, bir sonraki girişte yeniden kurulum gerekir)
    public function reset2FA(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        $user->update([
            'two_factor_enabled' => false,
            'two_factor_secret'  => null,
        ]);

        return response()->json(['success' => true, 'message' => '2FA sıfırlandı. Kullanıcı bir sonraki girişte yeniden kurulum yapacak.']);
    }

    public function destroy(string $id): JsonResponse
    {
        $user = $this->userRepo->findOrFail($id);

        if ($user->isSuperAdmin()) {
            return response()->json(['success' => false, 'message' => 'Süper admin hesabı silinemez.'], 403);
        }

        $this->userService->delete($user, Auth::user());

        return response()->json(['success' => true, 'message' => 'Kullanıcı silindi.']);
    }
}
