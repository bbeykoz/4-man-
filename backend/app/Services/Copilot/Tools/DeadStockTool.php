<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\DeadStockService;

/** Hızlı / normal / yavaş / ölü stok sınıflaması ve bağlı sermaye. */
class DeadStockTool implements CopilotTool
{
    public function __construct(private readonly DeadStockService $dead) {}

    public function name(): string
    {
        return 'dead_stock';
    }

    public function description(): string
    {
        return 'Ürünleri son 30/60/90 gün hareketine göre hızlı, normal, yavaş, ölü olarak sınıflar; '
            . 'bağlı sermayeyi, fazla stoğu ve siparişi durdurulması önerilen ürünleri döner.';
    }

    public function inputSchema(): array
    {
        return ['type' => 'object', 'properties' => new \stdClass()];
    }

    public function authorize(User $user): bool
    {
        return (bool) $user->company_id && $user->hasPermission('warehouse.records.view');
    }

    public function run(User $user, array $input): array
    {
        $result = $this->dead->analyze($user->company_id);

        return [
            'summary'      => $result['summary'],
            'stop_reorder' => $result['stop_reorder'],
            'slow_or_dead' => $result['rows']->whereIn('class', ['dead', 'slow'])->take(20)->map(fn($r) => collect($r)->only([
                'name', 'class', 'available', 'days_since_consumption', 'days_of_supply', 'stock_value', 'excess_qty', 'recommendation',
            ]))->values()->all(),
        ];
    }
}
