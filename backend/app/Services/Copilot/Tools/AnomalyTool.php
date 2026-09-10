<?php

namespace App\Services\Copilot\Tools;

use App\Models\StockAnomaly;
use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\AnomalyService;

/** Açık stok anomalileri (olağandışı çıkış, sayım farkı, hasar artışı, kullanıcı davranışı...). */
class AnomalyTool implements CopilotTool
{
    public function name(): string
    {
        return 'stock_anomalies';
    }

    public function description(): string
    {
        return 'İncelenmemiş stok anomalilerini önem sırasıyla döner: tür, önem (0-100), ilgili ürün/depo/kullanıcı ve açıklama.';
    }

    public function inputSchema(): array
    {
        return ['type' => 'object', 'properties' => ['limit' => ['type' => 'integer', 'description' => 'En fazla kayıt (varsayılan 10)']]];
    }

    public function authorize(User $user): bool
    {
        return (bool) $user->company_id && $user->hasPermission('warehouse.records.view');
    }

    public function run(User $user, array $input): array
    {
        return StockAnomaly::forCompany($user->company_id)
            ->where('status', StockAnomaly::STATUS_OPEN)
            ->orderByDesc('severity')
            ->limit(min(50, (int) ($input['limit'] ?? 10)))
            ->get()
            ->map(fn($a) => [
                'type'     => AnomalyService::TYPE_LABELS[$a->type] ?? $a->type,
                'severity' => $a->severity,
                'date'     => $a->detected_for?->toDateString(),
                'message'  => $a->message,
            ])
            ->all();
    }
}
