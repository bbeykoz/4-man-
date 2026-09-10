<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\MessageAttachment;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MessageController extends Controller
{
    /**
     * Serialize a User model to a simple array with avatar_url accessor.
     */
    private function serializeUser(?User $user): ?array
    {
        if (! $user) return null;
        return [
            'id'         => $user->id,
            'name'       => $user->name,
            'email'      => $user->email,
            'avatar_url' => $user->avatar_url,
        ];
    }

    /**
     * List all conversations for the authenticated user.
     */
    public function conversations(Request $request): JsonResponse
    {
        $userId    = $request->user()->id;
        $companyId = $request->user()->company_id;

        $conversations = Conversation::where('company_id', $companyId)
            ->where(function ($q) use ($userId) {
                $q->where('participant_one_id', $userId)
                  ->orWhere('participant_two_id', $userId);
            })
            ->with(['participantOne', 'participantTwo'])
            ->orderByDesc('last_message_at')
            ->get();

        $convIds = $conversations->pluck('id')->toArray();

        // DISTINCT ON (PostgreSQL): one latest message per conversation
        $lastMessages = Message::selectRaw('DISTINCT ON (conversation_id) messages.*')
            ->whereIn('conversation_id', $convIds)
            ->orderBy('conversation_id')
            ->orderByDesc('created_at')
            ->with(['attachments', 'sender'])
            ->get()
            ->keyBy('conversation_id');

        // Unread counts in a single query
        $unreadCounts = Message::selectRaw('conversation_id, COUNT(*) as cnt')
            ->whereIn('conversation_id', $convIds)
            ->where('sender_id', '!=', $userId)
            ->whereNull('read_at')
            ->groupBy('conversation_id')
            ->pluck('cnt', 'conversation_id');

        $result = $conversations->map(function ($conv) use ($userId, $lastMessages, $unreadCounts) {
            $other   = $conv->participant_one_id === $userId ? $conv->participantTwo : $conv->participantOne;
            $lastMsg = $lastMessages->get($conv->id);

            return [
                'id'              => $conv->id,
                'other_user'      => $this->serializeUser($other),
                'last_message'    => $lastMsg ? array_merge($lastMsg->toArray(), ['sender' => $this->serializeUser($lastMsg->sender)]) : null,
                'unread_count'    => (int) ($unreadCounts->get($conv->id, 0)),
                'last_message_at' => $conv->last_message_at,
                'created_at'      => $conv->created_at,
            ];
        });

        return response()->json(['success' => true, 'data' => $result]);
    }

    /**
     * Find or create a conversation with another user.
     */
    public function findOrCreate(Request $request): JsonResponse
    {
        $request->validate(['user_id' => 'required|uuid|exists:users,id']);

        $userId    = $request->user()->id;
        $companyId = $request->user()->company_id;
        $otherId   = $request->user_id;

        if ($userId === $otherId) {
            return response()->json([
                'success' => false,
                'message' => 'Kendinize mesaj gönderemezsiniz.',
            ], 422);
        }

        $pOne = $userId < $otherId ? $userId : $otherId;
        $pTwo = $userId < $otherId ? $otherId : $userId;

        $conv = Conversation::firstOrCreate(
            ['company_id' => $companyId, 'participant_one_id' => $pOne, 'participant_two_id' => $pTwo],
            ['last_message_at' => null]
        );

        $conv->load(['participantOne', 'participantTwo']);

        $other = $conv->participant_one_id === $userId
            ? $conv->participantTwo
            : $conv->participantOne;

        $unreadCount = $conv->messages()
            ->where('sender_id', '!=', $userId)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'success' => true,
            'data'    => [
                'id'             => $conv->id,
                'other_user'     => $this->serializeUser($other),
                'last_message'   => null,
                'unread_count'   => $unreadCount,
                'last_message_at'=> $conv->last_message_at,
                'created_at'     => $conv->created_at,
            ],
        ]);
    }

    /**
     * Get messages in a conversation (paginated).
     */
    public function messages(Request $request, string $conversationId): JsonResponse
    {
        $userId = $request->user()->id;

        $conv = Conversation::where('id', $conversationId)
            ->where(function ($q) use ($userId) {
                $q->where('participant_one_id', $userId)
                  ->orWhere('participant_two_id', $userId);
            })
            ->firstOrFail();

        $messages = Message::where('conversation_id', $conv->id)
            ->with(['sender', 'attachments'])
            ->orderBy('created_at', 'asc')
            ->paginate(50);

        $items = collect($messages->items())->map(function ($msg) {
            return array_merge($msg->toArray(), [
                'sender' => $this->serializeUser($msg->sender),
            ]);
        });

        return response()->json([
            'success' => true,
            'data'    => $items,
            'meta'    => [
                'current_page' => $messages->currentPage(),
                'per_page'     => $messages->perPage(),
                'total'        => $messages->total(),
                'last_page'    => $messages->lastPage(),
            ],
        ]);
    }

    /**
     * Send a message (text and/or file attachment).
     */
    public function send(Request $request, string $conversationId): JsonResponse
    {
        $request->validate([
            'body'       => 'nullable|string|max:5000',
            'attachment' => 'nullable|file|max:20480',
        ]);

        if (! $request->body && ! $request->hasFile('attachment')) {
            return response()->json([
                'success' => false,
                'message' => 'Mesaj veya dosya gerekli.',
            ], 422);
        }

        $userId = $request->user()->id;

        $conv = Conversation::where('id', $conversationId)
            ->where(function ($q) use ($userId) {
                $q->where('participant_one_id', $userId)
                  ->orWhere('participant_two_id', $userId);
            })
            ->firstOrFail();

        $type = $request->hasFile('attachment') ? 'file' : 'text';

        $message = Message::create([
            'conversation_id' => $conv->id,
            'sender_id'       => $userId,
            'body'            => $request->body,
            'type'            => $type,
        ]);

        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            $path = $file->store('message-attachments/' . $conv->id, 'public');

            MessageAttachment::create([
                'message_id'    => $message->id,
                'original_name' => $file->getClientOriginalName(),
                'file_path'     => $path,
                'mime_type'     => $file->getMimeType(),
                'size'          => $file->getSize(),
            ]);
        }

        $conv->update(['last_message_at' => now()]);

        // Notify the recipient
        $recipientId = $conv->participant_one_id === $userId
            ? $conv->participant_two_id
            : $conv->participant_one_id;

        Notification::create([
            'user_id'    => $recipientId,
            'company_id' => $conv->company_id,
            'type'       => 'info',
            'title'      => 'Yeni Mesaj',
            'body'       => $request->user()->name . ' size bir mesaj gönderdi',
            'action_url' => '/messages',
            'data'       => ['conversation_id' => $conv->id],
            'created_at' => now(),
        ]);

        $message->load(['sender', 'attachments']);

        return response()->json([
            'success' => true,
            'data'    => array_merge($message->toArray(), [
                'sender' => $this->serializeUser($message->sender),
            ]),
        ], 201);
    }

    /**
     * Mark all messages in a conversation as read.
     */
    public function markRead(Request $request, string $conversationId): JsonResponse
    {
        $userId = $request->user()->id;

        $conv = Conversation::where('id', $conversationId)
            ->where(function ($q) use ($userId) {
                $q->where('participant_one_id', $userId)
                  ->orWhere('participant_two_id', $userId);
            })
            ->firstOrFail();

        $conv->messages()
            ->where('sender_id', '!=', $userId)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['success' => true]);
    }

    /**
     * Get total unread message count for the authenticated user.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $userId    = $request->user()->id;
        $companyId = $request->user()->company_id;

        $count = Message::whereHas('conversation', function ($q) use ($userId, $companyId) {
            $q->where('company_id', $companyId)
              ->where(function ($q2) use ($userId) {
                  $q2->where('participant_one_id', $userId)
                     ->orWhere('participant_two_id', $userId);
              });
        })
        ->where('sender_id', '!=', $userId)
        ->whereNull('read_at')
        ->count();

        return response()->json(['success' => true, 'data' => ['count' => $count]]);
    }

    /**
     * Delete a message (sender only).
     */
    public function destroyMessage(Request $request, string $conversationId, string $messageId): JsonResponse
    {
        $userId = $request->user()->id;

        $conv = Conversation::where('id', $conversationId)
            ->where(function ($q) use ($userId) {
                $q->where('participant_one_id', $userId)
                  ->orWhere('participant_two_id', $userId);
            })
            ->firstOrFail();

        $message = Message::where('id', $messageId)
            ->where('conversation_id', $conv->id)
            ->where('sender_id', $userId)
            ->firstOrFail();

        foreach ($message->attachments as $att) {
            Storage::disk('public')->delete($att->file_path);
        }

        $message->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Search company users to start a new conversation.
     */
    public function searchUsers(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $userId    = $request->user()->id;
        $search    = $request->query('q', '');

        $users = User::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->where('id', '!=', $userId)
            ->where('status', '!=', 'suspended')
            ->whereNull('deleted_at')
            ->when($search !== '', function ($q) use ($search) {
                $term = mb_strtolower($search);
                $q->where(function ($q2) use ($term) {
                    $q2->whereRaw('LOWER(name) LIKE ?', ["%{$term}%"])
                       ->orWhereRaw('LOWER(email) LIKE ?', ["%{$term}%"]);
                });
            })
            ->orderBy('name')
            ->limit(20)
            ->get();

        $result = $users->map(fn($u) => [
            'id'         => $u->id,
            'name'       => $u->name,
            'email'      => $u->email,
            'avatar_url' => $u->avatar_url,
            'department_id' => $u->department_id,
            'department' => $u->department ? ['id' => $u->department->id, 'name' => $u->department->name] : null,
        ]);

        return response()->json(['success' => true, 'data' => $result]);
    }
}
