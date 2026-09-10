<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\WhatIfService;

/** "Talep %20 artarsa / tedarik 5 gün uzarsa ne olur?" sorularını simüle eder (veri değiştirmez). */
class WhatIfTool implements CopilotTool
{
    public function __construct(private readonly WhatIfService $whatIf) {}

    public function name(): string
    {
        return 'what_if';
    }

    public function description(): string
    {
        return 'Varsayım değişikliğinin (talep %, tedarik süresi gün, güvenlik stoğu %) stok üzerindeki etkisini simüle eder: '
            . 'etkilenen ürün sayısı, stok açığı, önerilen sipariş miktarı ve risk değişimi.';
    }

    public function inputSchema(): array
    {
        return [
            'type'       => 'object',
            'properties' => [
                'demand_change_pct'    => ['type' => 'number', 'description' => 'Talep değişimi yüzde (ör. 20 veya -30)'],
                'lead_time_extra_days' => ['type' => 'integer', 'description' => 'Tedarik süresine eklenecek gün'],
                'safety_change_pct'    => ['type' => 'number', 'description' => 'Güvenlik stoğu değişimi yüzde'],
            ],
        ];
    }

    public function authorize(User $user): bool
    {
        return (bool) $user->company_id && $user->hasPermission('warehouse.records.view');
    }

    public function run(User $user, array $input): array
    {
        $result   = $this->whatIf->simulate($user->company_id, [collect($input)->only(['demand_change_pct', 'lead_time_extra_days', 'safety_change_pct'])->all()]);
        $scenario = $result['scenarios'][0];

        return [
            'assumptions' => $scenario['assumptions'],
            'baseline'    => collect($result['baseline'])->only(['shortfall_qty', 'order_qty', 'order_value', 'levels', 'avg_risk']),
            'scenario'    => collect($scenario)->except(['products', 'name'])->all(),
            'top_products'=> array_slice(array_map(fn($p) => collect($p)->only(['name', 'risk_before', 'risk_after', 'shortfall', 'order_before', 'order_after'])->all(), $scenario['products']), 0, 10),
        ];
    }
}
