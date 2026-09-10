<?php

namespace App\Services;

use App\Jobs\SendNotificationJob;
use App\Models\Notification;
use App\Models\User;

class NotificationService
{
    public function send(
        User $user,
        string $title,
        string $body,
        string $type = 'info',
        ?string $actionUrl = null,
        array $data = [],
    ): Notification {
        $notification = Notification::create([
            'company_id' => $user->company_id,
            'user_id'    => $user->id,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'action_url' => $actionUrl,
            'data'       => $data,
        ]);

        // Gerçek zamanlı yayın (Broadcasting)
        // event(new NotificationCreated($notification));

        return $notification;
    }

    public function sendToMany(array $userIds, string $title, string $body, string $type = 'info', ?string $actionUrl = null): void
    {
        foreach ($userIds as $userId) {
            $user = User::find($userId);
            if ($user) {
                $this->send($user, $title, $body, $type, $actionUrl);
            }
        }
    }

    public function sendToCompany(string $companyId, string $title, string $body, string $type = 'info'): void
    {
        User::where('company_id', $companyId)
            ->where('status', 'active')
            ->chunk(100, function ($users) use ($title, $body, $type) {
                foreach ($users as $user) {
                    $this->send($user, $title, $body, $type);
                }
            });
    }

    public function markAllRead(string $userId): int
    {
        return Notification::where('user_id', $userId)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    public function getUnreadCount(string $userId): int
    {
        return Notification::where('user_id', $userId)
            ->whereNull('read_at')
            ->count();
    }
}
