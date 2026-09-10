<?php

namespace App\Services\Copilot;

use App\Models\CopilotConversation;
use App\Models\CopilotMessage;
use App\Models\User;
use App\Services\Copilot\Contracts\CopilotProvider;
use App\Services\Copilot\Providers\NullProvider;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class CopilotService
{
    public function __construct(private readonly CopilotToolRegistry $registry) {}

    public function provider(): CopilotProvider
    {
        $name  = config('copilot.enabled') ? config('copilot.provider') : 'null';
        $class = config("copilot.providers.{$name}", NullProvider::class);

        $provider = app($class);

        return $provider->isConfigured() ? $provider : app(NullProvider::class);
    }

    public function status(User $user): array
    {
        $provider = $this->provider();

        return [
            'enabled'    => $provider->isConfigured(),
            'provider'   => $provider->name(),
            'tools'      => array_column($this->registry->definitions($user), 'name'),
            'suggestions'=> [
                'Bu ay hangi ürünlerde problem var?',
                'Kritik stok altındaki ürünleri listele',
                'SKT\'si yaklaşan ürünler hangileri?',
            ],
        ];
    }

    /** Kullanıcı mesajını kaydeder, sağlayıcıdan cevap alır, cevabı kaydeder. */
    public function send(User $user, string $message, ?string $conversationId = null): array
    {
        $conversation = $conversationId
            ? CopilotConversation::where('user_id', $user->id)->findOrFail($conversationId)
            : CopilotConversation::create([
                'user_id'    => $user->id,
                'company_id' => $user->company_id,
                'title'      => Str::limit($message, 60),
            ]);

        $userMessage = $conversation->messages()->create([
            'role'    => CopilotMessage::ROLE_USER,
            'content' => $message,
        ]);

        $history = $conversation->messages()
            ->latest()
            ->limit((int) config('copilot.history_limit', 20))
            ->get(['role', 'content'])
            ->reverse()
            ->map(fn($m) => ['role' => $m->role, 'content' => $m->content])
            ->values()
            ->all();

        $provider = $this->provider();

        try {
            $reply = $provider->reply(new CopilotRequest(
                user:         $user,
                systemPrompt: (string) config('copilot.system_prompt'),
                messages:     $history,
                tools:        $this->registry->definitions($user),
                registry:     $this->registry,
            ));
        } catch (\Throwable $e) {
            Log::error('Copilot provider failed', ['provider' => $provider->name(), 'error' => $e->getMessage()]);
            $reply = new CopilotReply('Şu anda cevap veremiyorum. Lütfen biraz sonra tekrar deneyin.', [
                'provider' => $provider->name(),
                'error'    => true,
            ]);
        }

        $assistantMessage = $conversation->messages()->create([
            'role'    => CopilotMessage::ROLE_ASSISTANT,
            'content' => $reply->content,
            'meta'    => $reply->meta,
        ]);

        $conversation->touch();

        return [$conversation, $userMessage, $assistantMessage];
    }
}
