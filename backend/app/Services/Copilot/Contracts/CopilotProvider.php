<?php

namespace App\Services\Copilot\Contracts;

use App\Services\Copilot\CopilotReply;
use App\Services\Copilot\CopilotRequest;

/**
 * Yapay zekâ sağlayıcısı. Yeni sağlayıcı bu arayüzü uygular ve config/copilot.php'ye kaydedilir.
 * Araç çağrısı (tool use) destekleyen sağlayıcı, $request->tools tanımlarını modele verir ve
 * gelen çağrıları CopilotToolRegistry::run() ile çalıştırıp sonucu modele geri döndürür.
 */
interface CopilotProvider
{
    public function name(): string;

    /** API anahtarı vb. ayarlar tamam mı? */
    public function isConfigured(): bool;

    public function reply(CopilotRequest $request): CopilotReply;
}
