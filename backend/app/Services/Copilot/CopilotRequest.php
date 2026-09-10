<?php

namespace App\Services\Copilot;

use App\Models\User;

/** Sağlayıcıya giden istek: sistem talimatı, geçmiş, araç tanımları. */
final class CopilotRequest
{
    /**
     * @param array<int, array{role: string, content: string}> $messages eski → yeni
     * @param array<int, array{name: string, description: string, input_schema: array}> $tools
     */
    public function __construct(
        public readonly User $user,
        public readonly string $systemPrompt,
        public readonly array $messages,
        public readonly array $tools,
        public readonly CopilotToolRegistry $registry,
    ) {}
}
