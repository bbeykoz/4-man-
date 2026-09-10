<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\StockRiskService;

/** En riskli ürünler: skor, neden, açıklama ve öneri. */
class StockRiskTool implements CopilotTool
{
    public function __construct(private readonly StockRiskService $risk) {}

    public function name(): string
    {
        return 'stock_risk';
    }

    public function description(): string
    {
        return 'Ürünlerin 0-100 stok risk skorlarını döner (tükenme olasılığı, min/güvenlik stoğu altı, SKT riski). '
            . 'Her ürün için günlük tüketim, kaç günlük stok kaldığı, tedarik süresi, açıklama ve öneri içerir.';
    }

    public function inputSchema(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'min_score' => ['type' => 'integer', 'description' => 'Bu skorun altındakileri atla (varsayılan 30)'],
                'limit'     => ['type' => 'integer', 'description' => 'En fazla ürün sayısı (varsayılan 10)'],
            ],
        ];
    }

    public function authorize(User $user): bool
    {
        return (bool) $user->company_id && $user->hasPermission('warehouse.records.view');
    }

    public function run(User $user, array $input): array
    {
        $minScore = (int) ($input['min_score'] ?? 30);
        $limit    = min(50, (int) ($input['limit'] ?? 10));

        return $this->risk->assessCompany($user->company_id)
            ->where('risk_score', '>=', $minScore)
            ->sortByDesc('risk_score')
            ->take($limit)
            ->map(fn($r) => collect($r)->only([
                'name', 'sku', 'unit', 'available', 'daily_consumption', 'days_of_cover', 'lead_time_days',
                'risk_score', 'risk_level', 'driver', 'explanation', 'recommendation',
            ]))
            ->values()
            ->all();
    }
}
