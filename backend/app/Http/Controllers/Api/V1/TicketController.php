<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TicketController extends Controller
{
    /**
     * List tickets submitted by the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $tickets = Ticket::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'success' => true,
            'data'    => $tickets->items(),
            'meta'    => [
                'total'        => $tickets->total(),
                'current_page' => $tickets->currentPage(),
                'last_page'    => $tickets->lastPage(),
                'per_page'     => $tickets->perPage(),
            ],
        ]);
    }

    /**
     * Create a new ticket.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title'    => 'required|string|max:255',
            'body'     => 'required|string|max:5000',
            'type'     => 'required|in:support,idea',
            'team'     => 'sometimes|in:support,sales,technical',
            'priority' => 'sometimes|in:low,medium,high',
        ], [
            'team.in' => 'Geçersiz konu başlığı.',
        ]);

        // Konu seçilmezse: fikir/talep satışa, diğerleri desteğe gider
        $team = $request->input('team')
            ?? ($request->type === 'idea' ? Ticket::TEAM_SALES : Ticket::TEAM_SUPPORT);

        $ticket = Ticket::create([
            'user_id'    => $request->user()->id,
            'company_id' => $request->user()->company_id,
            'title'      => $request->title,
            'body'       => $request->body,
            'type'       => $request->type,
            'team'       => $team,
            'source'     => 'panel',
            'priority'   => $request->input('priority', 'medium'),
        ]);

        return response()->json(['success' => true, 'data' => $ticket], 201);
    }

    /**
     * View a single ticket (own only).
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $ticket = Ticket::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        return response()->json(['success' => true, 'data' => $ticket]);
    }
}
