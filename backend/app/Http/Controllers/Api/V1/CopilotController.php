<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CopilotConversation;
use App\Models\CopilotMessage;
use App\Services\Copilot\CopilotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** AI Copilot sohbet API'si. Sohbetler kullanıcıya özeldir. */
class CopilotController extends Controller
{
    public function __construct(private readonly CopilotService $copilot) {}

    public function status(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->copilot->status($request->user())]);
    }

    public function conversations(Request $request): JsonResponse
    {
        $items = CopilotConversation::where('user_id', $request->user()->id)
            ->orderByDesc('updated_at')
            ->limit(30)
            ->get(['id', 'title', 'updated_at']);

        return response()->json(['success' => true, 'data' => $items]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $conversation = CopilotConversation::where('user_id', $request->user()->id)->findOrFail($id);

        return response()->json([
            'success' => true,
            'data'    => [
                'id'       => $conversation->id,
                'title'    => $conversation->title,
                'messages' => $conversation->messages()->get()->map(fn(CopilotMessage $m) => $this->message($m)),
            ],
        ]);
    }

    public function send(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message'         => ['required', 'string', 'max:2000'],
            'conversation_id' => ['nullable', 'uuid'],
        ], [
            'message.required' => 'Mesaj boş olamaz.',
            'message.max'      => 'Mesaj en fazla 2000 karakter olabilir.',
        ]);

        [$conversation, $userMessage, $assistantMessage] = $this->copilot->send(
            $request->user(),
            trim($data['message']),
            $data['conversation_id'] ?? null,
        );

        return response()->json([
            'success' => true,
            'data'    => [
                'conversation_id' => $conversation->id,
                'messages'        => [$this->message($userMessage), $this->message($assistantMessage)],
            ],
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        CopilotConversation::where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->json(['success' => true, 'message' => 'Sohbet silindi.']);
    }

    private function message(CopilotMessage $m): array
    {
        return [
            'id'         => $m->id,
            'role'       => $m->role,
            'content'    => $m->content,
            'created_at' => $m->created_at?->toISOString(),
        ];
    }
}
