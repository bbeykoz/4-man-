<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Notification;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(private readonly NotificationService $notificationService) {}

    public function index(Request $request): JsonResponse
    {
        $notifications = Notification::where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->paginate($request->integer('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => $notifications->items(),
            'meta'    => [
                'current_page' => $notifications->currentPage(),
                'total'        => $notifications->total(),
            ],
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => ['count' => $this->notificationService->getUnreadCount($request->user()->id)],
        ]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        Notification::where('user_id', $request->user()->id)
            ->where('id', $id)
            ->update(['read_at' => now()]);

        return response()->json(['success' => true, 'message' => 'Bildirim okundu.']);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $count = $this->notificationService->markAllRead($request->user()->id);

        return response()->json(['success' => true, 'message' => "{$count} bildirim okundu olarak işaretlendi."]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        Notification::where('user_id', $request->user()->id)->where('id', $id)->delete();

        return response()->json(['success' => true, 'message' => 'Bildirim silindi.']);
    }

    /**
     * Süper admin tarafından toplu bildirim gönderimi.
     * target: all | owners | company | user
     */
    public function broadcast(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'target'     => ['required', 'in:all,owners,company,user'],
            'company_id' => ['required_if:target,company', 'nullable', 'uuid', 'exists:companies,id'],
            'user_id'    => ['required_if:target,user',    'nullable', 'uuid', 'exists:users,id'],
            'title'      => ['required', 'string', 'max:255'],
            'message'    => ['required', 'string', 'max:1000'],
            'type'       => ['nullable', 'in:info,success,warning,error'],
        ]);

        $type  = $validated['type'] ?? 'info';
        $title = $validated['title'];
        $body  = $validated['message'];
        $count = 0;

        switch ($validated['target']) {
            case 'all':
                User::where('status', 'active')->whereNotNull('company_id')
                    ->chunk(100, function ($users) use ($title, $body, $type, &$count) {
                        foreach ($users as $u) {
                            $this->notificationService->send($u, $title, $body, $type);
                            $count++;
                        }
                    });
                break;

            case 'owners':
                User::where('status', 'active')
                    ->whereNotNull('company_id')
                    ->whereHas('roles', fn($q) => $q->where('slug', 'company-owner'))
                    ->chunk(100, function ($users) use ($title, $body, $type, &$count) {
                        foreach ($users as $u) {
                            $this->notificationService->send($u, $title, $body, $type);
                            $count++;
                        }
                    });
                break;

            case 'company':
                $this->notificationService->sendToCompany($validated['company_id'], $title, $body, $type);
                $count = User::where('company_id', $validated['company_id'])->where('status', 'active')->count();
                break;

            case 'user':
                $user = User::findOrFail($validated['user_id']);
                $this->notificationService->send($user, $title, $body, $type);
                $count = 1;
                break;
        }

        return response()->json([
            'success' => true,
            'message' => "{$count} kullanıcıya bildirim gönderildi.",
        ]);
    }
}
