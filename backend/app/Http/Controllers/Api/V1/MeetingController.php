<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Meeting;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class MeetingController extends Controller
{
    /**
     * List meetings where the user is creator or participant.
     */
    public function index(Request $request): JsonResponse
    {
        $userId    = Auth::id();
        $companyId = Auth::user()->company_id;

        $meetings = Meeting::with(['creator:id,name,email,avatar', 'participants:id,name,email,avatar'])
            ->where('company_id', $companyId)
            ->where(function ($q) use ($userId) {
                $q->where('created_by', $userId)
                  ->orWhereHas('participants', fn($p) => $p->where('user_id', $userId));
            })
            ->orderBy('starts_at')
            ->get()
            ->map(fn($m) => $this->format($m));

        return response()->json(['success' => true, 'data' => $meetings]);
    }

    /**
     * Create a meeting and notify all participants.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title'            => 'required|string|max:255',
            'description'      => 'nullable|string|max:2000',
            'starts_at'        => 'required|date|after:now',
            'ends_at'          => 'nullable|date|after:starts_at',
            'participant_ids'  => 'required|array|min:1',
            'participant_ids.*'=> 'uuid|exists:users,id',
        ]);

        $user = Auth::user();

        $meeting = Meeting::create([
            'company_id'  => $user->company_id,
            'created_by'  => $user->id,
            'title'       => $validated['title'],
            'description' => $validated['description'] ?? null,
            'starts_at'   => $validated['starts_at'],
            'ends_at'     => $validated['ends_at'] ?? null,
        ]);

        // Attach participants (always include creator)
        $participantIds = collect($validated['participant_ids'])
            ->push($user->id)
            ->unique()
            ->values()
            ->toArray();

        $meeting->participants()->sync($participantIds);

        // Send notifications to participants (excluding the creator)
        $dateStr = $meeting->starts_at->format('d.m.Y H:i');
        foreach ($participantIds as $participantId) {
            if ($participantId === $user->id) continue;

            Notification::create([
                'user_id'    => $participantId,
                'company_id' => $user->company_id,
                'type'       => 'info',
                'title'      => 'Toplantı Daveti',
                'body'       => $user->name . ' sizi "' . $meeting->title . '" toplantısına davet etti. ' . $dateStr,
                'action_url' => '/meetings',
                'data'       => ['meeting_id' => $meeting->id],
            ]);
        }

        $meeting->load(['creator:id,name,email,avatar', 'participants:id,name,email,avatar']);

        return response()->json([
            'success' => true,
            'message' => 'Toplantı oluşturuldu.',
            'data'    => $this->format($meeting),
        ], 201);
    }

    /**
     * Show a single meeting.
     */
    public function show(string $id): JsonResponse
    {
        $userId  = Auth::id();
        $meeting = Meeting::with(['creator:id,name,email,avatar', 'participants:id,name,email,avatar'])
            ->where(function ($q) use ($userId) {
                $q->where('created_by', $userId)
                  ->orWhereHas('participants', fn($p) => $p->where('user_id', $userId));
            })
            ->findOrFail($id);

        return response()->json(['success' => true, 'data' => $this->format($meeting)]);
    }

    /**
     * Delete a meeting (creator only).
     */
    public function destroy(string $id): JsonResponse
    {
        $meeting = Meeting::where('created_by', Auth::id())->findOrFail($id);
        $meeting->delete();

        return response()->json(['success' => true, 'message' => 'Toplantı silindi.']);
    }

    private function format(Meeting $meeting): array
    {
        return [
            'id'          => $meeting->id,
            'title'       => $meeting->title,
            'description' => $meeting->description,
            'starts_at'   => $meeting->starts_at?->toIso8601String(),
            'ends_at'     => $meeting->ends_at?->toIso8601String(),
            'created_by'  => $meeting->created_by,
            'creator'     => $meeting->creator ? [
                'id'         => $meeting->creator->id,
                'name'       => $meeting->creator->name,
                'avatar_url' => $meeting->creator->avatar_url,
            ] : null,
            'participants' => $meeting->participants->map(fn($u) => [
                'id'         => $u->id,
                'name'       => $u->name,
                'avatar_url' => $u->avatar_url,
            ]),
            'created_at' => $meeting->created_at?->toIso8601String(),
        ];
    }
}
