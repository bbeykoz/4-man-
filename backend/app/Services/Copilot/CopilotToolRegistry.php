<?php

namespace App\Services\Copilot;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Copilot\Tools\AbcXyzTool;
use App\Services\Copilot\Tools\AnomalyTool;
use App\Services\Copilot\Tools\DeadStockTool;
use App\Services\Copilot\Tools\ExpiryRiskTool;
use App\Services\Copilot\Tools\PurchaseSuggestionsTool;
use App\Services\Copilot\Tools\StockRiskTool;
use App\Services\Copilot\Tools\StockSummaryTool;
use App\Services\Copilot\Tools\SupplierPerformanceTool;
use App\Services\Copilot\Tools\TransferSuggestionsTool;
use App\Services\Copilot\Tools\WarehouseKpiTool;
use App\Services\Copilot\Tools\WhatIfTool;
use InvalidArgumentException;

/**
 * Copilot araçlarının listesi. Sonraki fazlarda risk skoru, SKT, satın alma önerisi,
 * anomali vb. araçlar buraya eklenir.
 */
class CopilotToolRegistry
{
    /** @var array<int, class-string<CopilotTool>> */
    private const TOOLS = [
        StockSummaryTool::class,
        StockRiskTool::class,
        PurchaseSuggestionsTool::class,
        ExpiryRiskTool::class,
        DeadStockTool::class,
        TransferSuggestionsTool::class,
        AnomalyTool::class,
        WhatIfTool::class,
        SupplierPerformanceTool::class,
        WarehouseKpiTool::class,
        AbcXyzTool::class,
    ];

    /** @return array<string, CopilotTool> kullanıcının yetkili olduğu araçlar */
    public function available(User $user): array
    {
        $tools = [];
        foreach (self::TOOLS as $class) {
            $tool = app($class);
            if ($tool->authorize($user)) {
                $tools[$tool->name()] = $tool;
            }
        }

        return $tools;
    }

    /** Sağlayıcıya verilecek tanımlar */
    public function definitions(User $user): array
    {
        return array_values(array_map(fn(CopilotTool $t) => [
            'name'         => $t->name(),
            'description'  => $t->description(),
            'input_schema' => $t->inputSchema(),
        ], $this->available($user)));
    }

    public function run(User $user, string $name, array $input = []): array
    {
        $tool = $this->available($user)[$name] ?? null;
        if (!$tool) {
            throw new InvalidArgumentException("Araç bulunamadı veya yetki yok: {$name}");
        }

        return $tool->run($user, $input);
    }
}
