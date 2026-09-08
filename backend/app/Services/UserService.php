<?php

namespace App\Services;

use App\Models\User;
use App\Repositories\UserRepository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserService
{
    public function __construct(
        private readonly UserRepository $userRepository,
        private readonly ActivityLogService $activityLogService,
        private readonly NotificationService $notificationService,
    ) {}

    public function create(array $data, User $creator): User
    {
        return DB::transaction(function () use ($data, $creator) {
            // Şirket kullanıcı limitini kontrol et
            if ($creator->company && $creator->company->hasReachedUserLimit()) {
                throw new \Exception('Şirket kullanıcı limitine ulaşıldı.');
            }

            $password = $data['password'] ?? Str::random(12);

            $user = $this->userRepository->create([
                'company_id'    => $data['company_id'] ?? $creator->company_id,
                'department_id' => $data['department_id'] ?? null,
                'name'          => $data['name'],
                'email'         => $data['email'],
                'phone'         => $data['phone'] ?? null,
                'title'         => $data['title'] ?? null,
                'password'      => Hash::make($password),
                'status'        => 'active',
            ]);

            // Rol atama
            if (!empty($data['role_id'])) {
                $user->roles()->attach($data['role_id'], [
                    'company_id'  => $user->company_id,
                    'assigned_by' => $creator->id,
                    'assigned_at' => now(),
                ]);
            }

            $this->activityLogService->log(
                action: 'user.created',
                model: $user,
                causer: $creator,
                newValues: ['name' => $user->name, 'email' => $user->email],
            );

            // Hoşgeldin bildirimi
            $this->notificationService->send(
                user: $user,
                title: 'BytePanel\'e Hoş Geldiniz!',
                body: "Hesabınız oluşturuldu. Geçici şifreniz: {$password}",
                type: 'info',
            );

            return $user;
        });
    }

    public function update(User $user, array $data, User $updater): User
    {
        return DB::transaction(function () use ($user, $data, $updater) {
            $oldValues = ['name' => $user->name, 'email' => $user->email, 'status' => $user->status];

            $updateData = array_filter([
                'name'          => $data['name'] ?? null,
                'email'         => $data['email'] ?? null,
                'phone'         => $data['phone'] ?? null,
                'title'         => $data['title'] ?? null,
                'department_id' => $data['department_id'] ?? null,
                'status'        => $data['status'] ?? null,
            ], fn($v) => $v !== null);

            if (!empty($data['password'])) {
                $updateData['password'] = Hash::make($data['password']);
            }

            $user = $this->userRepository->update($user, $updateData);

            // Rol değiştir
            if (isset($data['role_id'])) {
                $user->roles()->sync([$data['role_id'] => [
                    'company_id'  => $user->company_id,
                    'assigned_by' => $updater->id,
                    'assigned_at' => now(),
                ]]);
                $user->clearPermissionCache();
            }

            $this->activityLogService->log(
                action: 'user.updated',
                model: $user,
                causer: $updater,
                oldValues: $oldValues,
                newValues: $updateData,
            );

            return $user;
        });
    }

    public function deactivate(User $user, User $actor): void
    {
        $this->userRepository->update($user, ['status' => 'inactive']);
        $user->tokens()->delete();

        $this->activityLogService->log(
            action: 'user.deactivated',
            model: $user,
            causer: $actor,
        );
    }

    public function activate(User $user, User $actor): void
    {
        $this->userRepository->update($user, ['status' => 'active']);

        $this->activityLogService->log(
            action: 'user.activated',
            model: $user,
            causer: $actor,
        );

        $this->notificationService->send(
            user: $user,
            title: 'Hesabınız Aktifleştirildi',
            body: 'Hesabınız tekrar aktif hale getirildi.',
            type: 'success',
        );
    }

    public function delete(User $user, User $actor): void
    {
        DB::transaction(function () use ($user, $actor) {
            $user->tokens()->delete();
            $user->roles()->detach();
            $this->userRepository->delete($user);

            $this->activityLogService->log(
                action: 'user.deleted',
                model: $user,
                causer: $actor,
                oldValues: ['name' => $user->name, 'email' => $user->email],
            );
        });
    }

    public function updateAvatar(User $user, \Illuminate\Http\UploadedFile $file): User
    {
        $path = $file->store("avatars/{$user->company_id}", 's3');

        if ($user->avatar) {
            \Storage::disk('s3')->delete($user->avatar);
        }

        $user->update(['avatar' => $path]);

        return $user->refresh();
    }
}
