<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class ProfileController extends Controller
{
    public function __construct(private readonly UserService $userService) {}

    public function show(): JsonResponse
    {
        $user = Auth::user()->load(['company', 'department', 'roles.permissions']);

        return response()->json(['success' => true, 'data' => new UserResource($user)]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'  => 'required|string|max:255',
            'email' => 'required|email|unique:users,email,' . Auth::id(),
            'phone' => 'nullable|string|max:30',
        ]);

        $user = $this->userService->update(Auth::user(), $validated, Auth::user());

        return response()->json([
            'success' => true,
            'message' => 'Profil güncellendi.',
            'data'    => new UserResource($user),
        ]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password'      => 'required|string',
            'password'              => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ]);

        $user = Auth::user();

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json(['success' => false, 'message' => 'Mevcut şifre hatalı.'], 422);
        }

        $user->update(['password' => Hash::make($request->password)]);
        $user->clearPermissionCache();

        return response()->json(['success' => true, 'message' => 'Şifre başarıyla güncellendi.']);
    }

    public function updateAvatar(Request $request): JsonResponse
    {
        $request->validate(['avatar' => 'required|image|mimes:jpeg,png,webp|max:2048']);

        $user = $this->userService->updateAvatar(Auth::user(), $request->file('avatar'));

        return response()->json([
            'success' => true,
            'message' => 'Profil fotoğrafı güncellendi.',
            'data'    => new UserResource($user),
        ]);
    }
}
