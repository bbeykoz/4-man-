<?php

namespace App\Services\Copilot;

/** Sağlayıcı cevabı; meta sohbet geçmişine yazılır (model, token, araç çağrıları). */
final class CopilotReply
{
    public function __construct(
        public readonly string $content,
        public readonly array $meta = [],
    ) {}
}
