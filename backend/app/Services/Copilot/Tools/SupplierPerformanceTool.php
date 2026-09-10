<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\SupplierPerformanceService;

/** Tedarikçi performansı ve ürün bazında tedarikçi karşılaştırması. */
class SupplierPerformanceTool implements CopilotTool
{
    public function __construct(private readonly SupplierPerformanceService $performance) {}

    public function name(): string
    {
        return 'supplier_performance';
    }

    public function description(): string
    {
        return 'Tedarikçilerin skorunu, gerçekleşen/beyan edilen teslim süresini, zamanında teslim, gecikme, eksik ve hasarlı teslim '
            . 'oranlarını, fiyat değişimini ve aynı ürün/ürün grubunda tedarikçi karşılaştırmalarını döner.';
    }

    public function inputSchema(): array
    {
        return ['type' => 'object', 'properties' => ['days' => ['type' => 'integer', 'enum' => [90, 180, 365], 'description' => 'Dönem (gün)']]];
    }

    public function authorize(User $user): bool
    {
        return (bool) $user->company_id && $user->hasPermission('warehouse.records.view');
    }

    public function run(User $user, array $input): array
    {
        $days   = in_array((int) ($input['days'] ?? 180), [90, 180, 365], true) ? (int) ($input['days'] ?? 180) : 180;
        $result = $this->performance->analyze($user->company_id, $days);

        return [
            'summary'     => $result['summary'],
            'suppliers'   => collect($result['suppliers'])->map(fn($s) => collect($s)->only([
                'name', 'score', 'grade', 'declared_lead_time', 'avg_lead_time', 'on_time_rate', 'avg_delay_days',
                'fill_rate', 'damage_rate', 'price_change_pct', 'insights',
            ]))->all(),
            'comparisons' => collect($result['comparisons'])->pluck('insight')->filter()->values()->all(),
        ];
    }
}
