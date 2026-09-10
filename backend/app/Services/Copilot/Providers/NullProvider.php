<?php

namespace App\Services\Copilot\Providers;

use App\Services\Copilot\Contracts\CopilotProvider;
use App\Services\Copilot\CopilotReply;
use App\Services\Copilot\CopilotRequest;

/** Yapay zekâ servisi bağlanana kadar kullanılan yer tutucu. */
class NullProvider implements CopilotProvider
{
    public function name(): string
    {
        return 'null';
    }

    public function isConfigured(): bool
    {
        return false;
    }

    public function reply(CopilotRequest $request): CopilotReply
    {
        return new CopilotReply(
            'AI Asistan henüz kurulmadı. Altyapı hazır; yapay zekâ servisi bağlandığında stok, SKT, risk ve '
            . 'satın alma sorularınızı buradan cevaplayacağım. Mesajınız kaydedildi.',
            ['provider' => $this->name()],
        );
    }
}
