<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use PragmaRX\Google2FALaravel\Google2FA;

class TwoFactorController extends Controller
{
    public function __construct(
        private readonly Google2FA   $google2fa,
        private readonly AuthService $authService,
    ) {}

    // ──────────────────────────────────────────────────────────────────────────
    // LOGIN-TIME SETUP (public, uses cache to verify pending user)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Generate secret + QR for a login-pending user (no auth token needed).
     */
    public function setupPending(Request $request): JsonResponse
    {
        $request->validate(['user_id' => 'required|uuid|exists:users,id']);

        if (! Cache::has("2fa_setup_pending_{$request->user_id}")) {
            return response()->json(['success' => false, 'message' => 'Geçersiz veya süresi dolmuş oturum.'], 422);
        }

        $user   = User::findOrFail($request->user_id);
        $secret = $this->google2fa->generateSecretKey();
        $user->update(['two_factor_secret' => $secret]);

        $otpauthUrl = $this->google2fa->getQRCodeUrl(
            config('app.name'),
            $user->email,
            $secret
        );

        return response()->json([
            'success' => true,
            'data'    => ['secret' => $secret, 'otpauth_url' => $otpauthUrl],
        ]);
    }

    /**
     * Verify OTP, enable 2FA, and return full auth token (completes login).
     */
    public function completePendingSetup(Request $request): JsonResponse
    {
        $request->validate([
            'user_id' => 'required|uuid|exists:users,id',
            'otp'     => 'required|string|size:6',
        ]);

        if (! Cache::has("2fa_setup_pending_{$request->user_id}")) {
            return response()->json(['success' => false, 'message' => 'Geçersiz veya süresi dolmuş oturum.'], 422);
        }

        $user = User::findOrFail($request->user_id);

        if (! $user->two_factor_secret) {
            return response()->json(['success' => false, 'message' => 'Önce QR kodu oluşturun.'], 422);
        }

        if (! $this->google2fa->verifyKey($user->two_factor_secret, $request->otp)) {
            return response()->json(['success' => false, 'message' => 'Geçersiz kod. Lütfen tekrar deneyin.'], 422);
        }

        $user->update(['two_factor_enabled' => true]);
        Cache::forget("2fa_setup_pending_{$request->user_id}");

        $result = $this->authService->generateLoginResponsePublic($user);

        return response()->json([
            'success' => true,
            'message' => 'Google Authenticator etkinleştirildi. Giriş yapıldı.',
            'data'    => [
                'token'       => $result['token'],
                'user'        => new UserResource($result['user']),
                'permissions' => $result['permissions'],
                'role_level'  => $result['role_level'],
            ],
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AUTHENTICATED MANAGEMENT (settings page)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Generate a new TOTP secret for the authenticated user.
     */
    public function setup(Request $request): JsonResponse
    {
        $user   = $request->user();
        $secret = $this->google2fa->generateSecretKey();
        $user->update(['two_factor_secret' => $secret]);

        $otpauthUrl = $this->google2fa->getQRCodeUrl(
            config('app.name'),
            $user->email,
            $secret
        );

        return response()->json([
            'success' => true,
            'data'    => ['secret' => $secret, 'otpauth_url' => $otpauthUrl],
        ]);
    }

    /**
     * Verify OTP and enable 2FA for the authenticated user.
     */
    public function enable(Request $request): JsonResponse
    {
        $request->validate(['otp' => 'required|string|size:6']);

        $user = $request->user();

        if (! $user->two_factor_secret) {
            return response()->json(['success' => false, 'message' => '2FA kurulumu başlatılmamış.'], 422);
        }

        if (! $this->google2fa->verifyKey($user->two_factor_secret, $request->otp)) {
            return response()->json(['success' => false, 'message' => 'Geçersiz kod. Google Authenticator\'daki kodu kontrol edin.'], 422);
        }

        $user->update(['two_factor_enabled' => true]);

        return response()->json(['success' => true, 'message' => 'Google Authenticator başarıyla etkinleştirildi.']);
    }

    /**
     * Disable 2FA after password confirmation.
     */
    public function disable(Request $request): JsonResponse
    {
        $request->validate(['password' => 'required|string']);

        $user = $request->user();

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['success' => false, 'message' => 'Şifre hatalı.'], 422);
        }

        $user->update(['two_factor_enabled' => false, 'two_factor_secret' => null]);

        return response()->json(['success' => true, 'message' => 'Google Authenticator devre dışı bırakıldı.']);
    }
}
