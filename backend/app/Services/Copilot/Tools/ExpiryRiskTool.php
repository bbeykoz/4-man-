<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\ExpiryService;

/** SKT'si yaklaşan / geçmiş lotlar, kayıp riski ve FEFO önerileri. */
class ExpiryRiskTool implements CopilotTool
{
    public function __construct(private readonly ExpiryService $expiry) {}

    public function name(): string
    {
        return 'expiry_risks';
    }

    public function description(): string
    {
        return 'SKT\'si geçmiş veya 90 gün içinde dolacak lotları, tüketim hızına göre kayıp riski miktarını/tutarını '
            . 've öneriyi (transfer, öncelikli sevk, hasara ayırma) döner.';
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
        $result = $this->expiry->analyze($user->company_id);

        return [
            'summary'   => $result['summary'],
            'headlines' => $result['products']->pluck('headline')->take(10)->all(),
            'lots'      => $result['lots']->take(20)->map(fn($l) => collect($l)->only([
                'name', 'warehouse_name', 'lot_number', 'expiry_date', 'days_to_expiry', 'quantity', 'loss_qty', 'recommendation',
            ]))->values()->all(),
        ];
    }
}
