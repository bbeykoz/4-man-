<?php

namespace App\Services;

use App\Models\Setting;
use App\Models\User;
use App\Models\UserSession;
use App\Repositories\UserRepository;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function __construct(
        private readonly UserRepository $userRepository,
        private readonly ActivityLogService $activityLogService,
        private readonly NotificationService $notificationService,
    ) {}

    public function login(string $email, string $password, string $deviceName = 'web'): array
    {
        $this->checkBruteForce($email);

        $user = $this->userRepository->findByEmail($email);

        if (!$user || !Hash::check($password, $user->password)) {
            $this->recordFailedAttempt($email);
            throw ValidationException::withMessages([
                'email' => ['E-posta veya şifre hatalı.'],
            ]);
        }

        if ($user->status->value === 'inactive') {
            throw ValidationException::withMessages([
                'email' => ['Hesabınız devre dışı bırakılmış.'],
            ]);
        }

        if ($user->status->value === 'suspended') {
            throw ValidationException::withMessages([
                'email' => ['Hesabınız askıya alınmış. Lütfen yöneticinizle iletişime geçin.'],
            ]);
        }

        // Global 2FA zorunluluğu kapalıysa direkt giriş
        $force2fa = Setting::get('force_2fa', true);
        if ($force2fa === false || $force2fa === 'false' || $force2fa === 0) {
            return $this->generateLoginResponse($user, $deviceName);
        }

        // 2FA kontrolü
        if ($user->two_factor_enabled) {
            Cache::put("2fa_pending_{$user->id}", true, now()->addMinutes(10));
            return ['requires_2fa' => true, 'user_id' => $user->id];
        }

        // Secret varsa ama 2FA pasife alınmışsa → direkt giriş
        if ($user->two_factor_secret) {
            return $this->generateLoginResponse($user, $deviceName);
        }

        // 2FA kurulmamış — zorunlu kurulum akışı
        Cache::put("2fa_setup_pending_{$user->id}", true, now()->addMinutes(15));
        return ['requires_2fa_setup' => true, 'user_id' => $user->id];
    }

    public function verifyTwoFactor(string $userId, string $otp): array
    {
        $user = $this->userRepository->findOrFail($userId);

        $google2fa = app(\PragmaRX\Google2FALaravel\Google2FA::class);

        if (!$google2fa->verifyKey($user->two_factor_secret, $otp)) {
            throw ValidationException::withMessages([
                'otp' => ['Geçersiz doğrulama kodu.'],
            ]);
        }

        Cache::forget("2fa_pending_{$userId}");

        return $this->generateLoginResponse($user, 'web');
    }

    public function logout(User $user, string $tokenId): void
    {
        $user->tokens()->where('id', $tokenId)->delete();

        UserSession::where('user_id', $user->id)
            ->where('token_hash', hash('sha256', request()->bearerToken() ?? ''))
            ->update(['is_active' => false]);

        $this->activityLogService->log('auth.logout', null, $user);
    }

    public function logoutAllSessions(User $user): void
    {
        $user->tokens()->delete();
        UserSession::where('user_id', $user->id)->update(['is_active' => false]);
    }

    public function generateLoginResponsePublic(User $user, string $deviceName = 'web'): array
    {
        return $this->generateLoginResponse($user, $deviceName);
    }

    private function generateLoginResponse(User $user, string $deviceName): array
    {
        $this->clearBruteForce($user->email);
        $user->updateLastLogin();

        $token = $user->createToken($deviceName, $this->getTokenAbilities($user));

        // Session kaydet
        UserSession::create([
            'user_id'          => $user->id,
            'company_id'       => $user->company_id,
            'token_hash'       => hash('sha256', $token->plainTextToken),
            'device_name'      => $deviceName,
            'ip_address'       => request()->ip(),
            'user_agent'       => request()->userAgent(),
            'last_activity_at' => now(),
        ]);

        $this->activityLogService->log('auth.login', null, $user, description: 'Giriş yapıldı');

        return [
            'token'       => $token->plainTextToken,
            'user'        => $user->load(['company', 'department', 'roles.permissions']),
            'permissions' => $user->getPermissions()->values()->toArray(),
            'role_level'  => $user->getRoleLevel(),
        ];
    }

    private function getTokenAbilities(User $user): array
    {
        if ($user->isSuperAdmin()) {
            return ['*'];
        }
        return $user->getPermissions()->toArray();
    }

    private function checkBruteForce(string $email): void
    {
        $key     = 'login_attempts_' . md5($email . request()->ip());
        $attempts = Cache::get($key, 0);

        if ($attempts >= 5) {
            throw ValidationException::withMessages([
                'email' => ['Çok fazla başarısız deneme. 15 dakika bekleyin.'],
            ]);
        }
    }

    private function recordFailedAttempt(string $email): void
    {
        $key = 'login_attempts_' . md5($email . request()->ip());
        Cache::put($key, Cache::get($key, 0) + 1, now()->addMinutes(15));
    }

    private function clearBruteForce(string $email): void
    {
        Cache::forget('login_attempts_' . md5($email . request()->ip()));
    }
}
