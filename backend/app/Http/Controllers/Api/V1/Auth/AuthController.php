<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

class AuthController extends Controller
{
    public function __construct(private readonly AuthService $authService) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $result = $this->authService->login(
            email: $request->email,
            password: $request->password,
            deviceName: $request->device_name ?? $request->userAgent() ?? 'web',
        );

        if (isset($result['requires_2fa'])) {
            return response()->json([
                'success'      => true,
                'requires_2fa' => true,
                'user_id'      => $result['user_id'],
                'message'      => 'İki faktörlü doğrulama kodu girin.',
            ]);
        }

        if (isset($result['requires_2fa_setup'])) {
            return response()->json([
                'success'            => true,
                'requires_2fa_setup' => true,
                'user_id'            => $result['user_id'],
                'message'            => 'Hesabınızı korumak için Google Authenticator kurulumu gereklidir.',
            ]);
        }

        return response()->json([
            'success'    => true,
            'message'    => 'Giriş başarılı.',
            'data'       => [
                'token'      => $result['token'],
                'user'       => new UserResource($result['user']),
                'permissions'=> $result['permissions'],
                'role_level' => $result['role_level'],
            ],
        ]);
    }

    public function verify2FA(Request $request): JsonResponse
    {
        $request->validate([
            'user_id' => ['required', 'uuid'],
            'otp'     => ['required', 'string', 'size:6'],
        ]);

        $result = $this->authService->verifyTwoFactor($request->user_id, $request->otp);

        return response()->json([
            'success' => true,
            'message' => 'Giriş başarılı.',
            'data'    => [
                'token'      => $result['token'],
                'user'       => new UserResource($result['user']),
                'permissions'=> $result['permissions'],
                'role_level' => $result['role_level'],
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['company', 'department', 'roles.permissions']);

        return response()->json([
            'success' => true,
            'data'    => [
                'user'        => new UserResource($user),
                'permissions' => $user->getPermissions()->values()->toArray(),
                'role_level'  => $user->getRoleLevel(),
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->authService->logout(
            $request->user(),
            $request->user()->currentAccessToken()->id
        );

        return response()->json(['success' => true, 'message' => 'Çıkış yapıldı.']);
    }

    public function logoutAll(Request $request): JsonResponse
    {
        $this->authService->logoutAllSessions($request->user());

        return response()->json(['success' => true, 'message' => 'Tüm oturumlar kapatıldı.']);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $status = Password::sendResetLink(['email' => $request->email]);

        return response()->json([
            'success' => $status === Password::RESET_LINK_SENT,
            'message' => $status === Password::RESET_LINK_SENT
                ? 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
                : 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.',
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token'                 => ['required'],
            'email'                 => ['required', 'email'],
            'password'              => ['required', 'min:8', 'confirmed'],
            'password_confirmation' => ['required'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, $password) {
                $user->update(['password' => $password]);
                $user->tokens()->delete();
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'success' => false,
                'message' => 'Geçersiz veya süresi dolmuş sıfırlama bağlantısı.',
            ], 422);
        }

        return response()->json(['success' => true, 'message' => 'Şifreniz başarıyla güncellendi.']);
    }

    public function sessions(Request $request): JsonResponse
    {
        $sessions = $request->user()
            ->sessions()
            ->active()
            ->orderBy('last_activity_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $sessions]);
    }

    public function revokeSession(Request $request, string $sessionId): JsonResponse
    {
        $request->user()
            ->sessions()
            ->where('id', $sessionId)
            ->update(['is_active' => false]);

        return response()->json(['success' => true, 'message' => 'Oturum kapatıldı.']);
    }
}
