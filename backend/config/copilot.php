<?php

/*
|--------------------------------------------------------------------------
| AI Copilot
|--------------------------------------------------------------------------
| Altyapı hazır, yapay zekâ servisi henüz bağlı değil. Kurulum zamanı gelince:
|   1. App\Services\Copilot\Providers altına sağlayıcı sınıfı ekleyin
|      (CopilotProvider arayüzünü uygular).
|   2. 'providers' dizisine kaydedin.
|   3. .env: COPILOT_ENABLED=true, COPILOT_PROVIDER=<ad>, COPILOT_API_KEY=...
| Kapalıyken widget "henüz kurulmadı" cevabı verir; sohbet geçmişi yine tutulur.
*/

return [
    'enabled'  => (bool) env('COPILOT_ENABLED', false),

    'provider' => env('COPILOT_PROVIDER', 'null'),

    'providers' => [
        'null' => App\Services\Copilot\Providers\NullProvider::class,
    ],

    'model'      => env('COPILOT_MODEL'),
    'api_key'    => env('COPILOT_API_KEY'),
    'max_tokens' => (int) env('COPILOT_MAX_TOKENS', 1024),

    // Sağlayıcıya gönderilecek en fazla geçmiş mesaj sayısı
    'history_limit' => 20,

    'system_prompt' => <<<'PROMPT'
Sen BytePanel ERP'nin depo ve stok asistanısın. Türkçe, kısa ve net cevap ver.
Sadece araçlardan (tools) gelen verilere dayan; veri yoksa bilmediğini söyle.
Stok hareketlerini asla kendin değiştirme: sipariş, transfer gibi aksiyonları sadece öner,
nedenini ve kullandığın göstergeleri açıkla; kritik işlemler kullanıcı onayı gerektirir.
PROMPT,
];
