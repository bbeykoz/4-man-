<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\WarehouseKpiService;

/** Depo KPI'ları: bu dönem / önceki dönem, değişim, yorum ve değişimin nedenleri. */
class WarehouseKpiTool implements CopilotTool
{
    public function __construct(private readonly WarehouseKpiService $kpis) {}

    public function name(): string
    {
        return 'warehouse_kpis';
    }

    public function description(): string
    {
        return 'Depo KPI\'larını (stok hareketi, doğruluk, bulunurluk, hasar/iade oranı, işlem süresi, devir hızı, doluluk) '
            . 'son 30 veya 90 günü önceki eşit dönemle karşılaştırarak, değişim nedenleri ve yorumuyla döner.';
    }

    public function inputSchema(): array
    {
        return ['type' => 'object', 'properties' => ['period' => ['type' => 'integer', 'enum' => [30, 90]]]];
    }

    public function authorize(User $user): bool
    {
        return (bool) $user->company_id && $user->hasPermission('warehouse.records.view');
    }

    public function run(User $user, array $input): array
    {
        $period = (int) ($input['period'] ?? 30) === 90 ? 90 : 30;
        $report = $this->kpis->report($user->company_id, $period);

        return [
            'period'     => $report['current'],
            'kpis'       => collect($report['kpis'])->map(fn($k) => collect($k)->only(['label', 'current', 'previous', 'change', 'trend', 'comment', 'drivers']))->all(),
            'warehouses' => $report['warehouses'],
        ];
    }
}
