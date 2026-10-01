<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ActivityLogResource;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\Company;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Modules\WarehouseRecord;
use App\Models\Ticket;
use App\Models\User;
use App\Services\ActivityLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Platform tarafının şirket içine bakışı: özet, kullanıcılar, hareketler, mesajlar
 * ve "şirkete bağlan" (kimliğe bürünme).
 *
 * Mesaj okuma ve şirkete bağlanma iz bırakır: kim, hangi şirket, ne zaman.
 */
class CompanyAccessController extends Controller
{
    public function __construct(private readonly ActivityLogService $logger) {}

    /** Şirket özeti: kullanıcı, departman, kayıt ve destek talebi sayıları. */
    public function overview(string $id): JsonResponse
    {
        $company = Company::withCount(['users', 'departments'])->findOrFail($id);

        $userIds = User::where('company_id', $company->id)->pluck('id');

        return response()->json([
            'success' => true,
            'data'    => [
                'company' => [
                    'id'         => $company->id,
                    'name'       => $company->name,
                    'email'      => $company->email,
                    'phone'      => $company->phone,
                    'status'     => $company->status,
                    'created_at' => $company->created_at?->toISOString(),
                ],
                'counts'  => [
                    'users'          => $company->users_count,
                    'departments'    => $company->departments_count,
                    'warehouse'      => WarehouseRecord::where('company_id', $company->id)->count(),
                    'tickets_open'   => Ticket::where('company_id', $company->id)->where('status', '!=', 'closed')->count(),
                    'tickets_total'  => Ticket::where('company_id', $company->id)->count(),
                    'conversations'  => Conversation::where('company_id', $company->id)->count(),
                    'messages'       => Message::whereIn('sender_id', $userIds)->count(),
                    'activity_today' => ActivityLog::where('company_id', $company->id)->whereDate('created_at', today())->count(),
                ],
            ],
        ]);
    }

    /** Şirketin kullanıcıları ve rolleri. */
    public function users(string $id): JsonResponse
    {
        $company = Company::findOrFail($id);

        $users = User::where('company_id', $company->id)
            ->with('roles')
            ->orderBy('name')
            ->get();

        return response()->json(['success' => true, 'data' => UserResource::collection($users)]);
    }

    /** Şirket içindeki son hareketler. */
    public function activity(Request $request, string $id): JsonResponse
    {
        $company = Company::findOrFail($id);

        $logs = ActivityLog::where('company_id', $company->id)
            ->with('user:id,name,email')
            ->orderByDesc('created_at')
            ->limit($request->integer('limit', 50))
            ->get();

        return response()->json(['success' => true, 'data' => ActivityLogResource::collection($logs)]);
    }

    /**
     * Şirketin yazışmaları. Her çağrı log'a yazılır: kim hangi şirketin mesajlarını okudu.
     * Okuma amaçlıdır; buradan mesaj yazılamaz veya silinemez.
     */
    public function conversations(Request $request, string $id): JsonResponse
    {
        $company = Company::findOrFail($id);

        $this->logger->log(
            action: 'platform.company.messages_viewed',
            model: $company,
            description: "{$company->name} şirketinin yazışmaları görüntülendi",
        );

        $conversations = Conversation::where('company_id', $company->id)
            ->with(['participantOne:id,name,email', 'participantTwo:id,name,email', 'lastMessage'])
            ->withCount('messages')
            ->orderByDesc('last_message_at')
            ->limit($request->integer('limit', 50))
            ->get()
            ->map(fn (Conversation $c) => [
                'id'              => $c->id,
                'participants'    => collect([$c->participantOne, $c->participantTwo])
                    ->filter()
                    ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])
                    ->values(),
                'messages_count'  => $c->messages_count,
                'last_message_at' => $c->last_message_at?->toISOString(),
                'last_message'    => $c->lastMessage->first()?->body,
            ]);

        return response()->json(['success' => true, 'data' => $conversations]);
    }

    /** Tek bir yazışmanın mesajları. */
    public function messages(Request $request, string $id, string $conversationId): JsonResponse
    {
        $company = Company::findOrFail($id);

        $conversation = Conversation::where('company_id', $company->id)->findOrFail($conversationId);

        $this->logger->log(
            action: 'platform.company.messages_read',
            model: $company,
            newValues: ['conversation_id' => $conversation->id],
            description: "{$company->name} · yazışma okundu",
        );

        $messages = Message::where('conversation_id', $conversation->id)
            ->with('sender:id,name,email')
            ->orderBy('created_at')
            ->limit($request->integer('limit', 200))
            ->get()
            ->map(fn (Message $m) => [
                'id'         => $m->id,
                'body'       => $m->body,
                'sender'     => $m->sender?->name,
                'created_at' => $m->created_at?->toISOString(),
            ]);

        return response()->json(['success' => true, 'data' => $messages]);
    }

    /**
     * Şirkete bağlan: o şirketin sahibi olarak iki saatlik bir oturum açar.
     * Kendi oturumun kapanmaz; arayüz eski jetonu saklar ve "çık" dediğinde geri döner.
     */
    public function impersonate(Request $request, string $id): JsonResponse
    {
        $company = Company::findOrFail($id);

        $owner = User::where('company_id', $company->id)
            ->whereHas('roles', fn ($q) => $q->where('level', 2))
            ->where('status', 'active')
            ->orderBy('created_at')
            ->first();

        if (!$owner) {
            return response()->json([
                'success' => false,
                'message' => 'Bu şirkette aktif sahip hesabı yok.',
            ], 422);
        }

        $token = $owner->createToken('impersonation', ['*'], now()->addHours(2))->plainTextToken;

        $this->logger->log(
            action: 'platform.company.impersonated',
            model: $company,
            newValues: ['as_user' => $owner->email],
            description: "{$company->name} şirketine {$owner->email} kimliğiyle bağlanıldı",
        );

        return response()->json([
            'success' => true,
            'message' => "{$company->name} şirketine bağlanıldı.",
            'data'    => [
                'token'      => $token,
                'user'       => new UserResource($owner->fresh('roles')),
                'company'    => ['id' => $company->id, 'name' => $company->name],
                'expires_at' => now()->addHours(2)->toISOString(),
            ],
        ]);
    }
}
