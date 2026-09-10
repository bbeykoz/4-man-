<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TicketAdminController extends Controller
{
    /**
     * List all tickets with filters.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Ticket::with(['user:id,name,email,avatar', 'company:id,name'])
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }
        if ($request->filled('search')) {
            $term = mb_strtolower($request->search);
            $query->where(function ($q) use ($term) {
                $q->whereRaw('LOWER(title) LIKE ?', ["%{$term}%"])
                  ->orWhereRaw('LOWER(body) LIKE ?', ["%{$term}%"]);
            });
        }

        $tickets = $query->paginate(25);

        // Attach avatar_url accessor
        $items = collect($tickets->items())->map(function ($t) {
            $arr = $t->toArray();
            $arr['user'] = $t->user ? [
                'id'         => $t->user->id,
                'name'       => $t->user->name,
                'email'      => $t->user->email,
                'avatar_url' => $t->user->avatar_url,
            ] : null;
            return $arr;
        });

        return response()->json([
            'success' => true,
            'data'    => $items,
            'meta'    => [
                'total'        => $tickets->total(),
                'current_page' => $tickets->currentPage(),
                'last_page'    => $tickets->lastPage(),
                'per_page'     => $tickets->perPage(),
            ],
        ]);
    }

    /**
     * View a single ticket.
     */
    public function show(string $id): JsonResponse
    {
        $ticket = Ticket::with(['user', 'company:id,name'])->findOrFail($id);

        $arr = $ticket->toArray();
        $arr['user'] = $ticket->user ? [
            'id'         => $ticket->user->id,
            'name'       => $ticket->user->name,
            'email'      => $ticket->user->email,
            'avatar_url' => $ticket->user->avatar_url,
        ] : null;

        return response()->json(['success' => true, 'data' => $arr]);
    }

    /**
     * Update ticket status, priority, and/or admin note.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'status'     => 'sometimes|in:open,in_progress,answered,closed',
            'priority'   => 'sometimes|in:low,medium,high',
            'admin_note' => 'sometimes|nullable|string|max:2000',
        ]);

        $ticket = Ticket::findOrFail($id);

        $data = $request->only(['status', 'priority', 'admin_note']);

        // Auto-set status to answered when admin adds/updates a note and status not explicitly set
        if (! isset($data['status']) && ! empty($data['admin_note'])) {
            $data['status'] = 'answered';
        }

        $ticket->update($data);

        return response()->json(['success' => true, 'message' => 'Ticket güncellendi.', 'data' => $ticket]);
    }

    /**
     * Summary counts for the badge.
     */
    public function counts(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'open'        => Ticket::where('status', 'open')->count(),
                'in_progress' => Ticket::where('status', 'in_progress')->count(),
                'total'       => Ticket::count(),
            ],
        ]);
    }
}
