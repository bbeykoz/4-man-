<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\TransferSuggestionService;

/** Depolar arası transfer önerileri (sadece öneri; emir kullanıcı onayıyla açılır). */
class TransferSuggestionsTool implements CopilotTool
{
    public function __construct(private readonly TransferSuggestionService $transfers) {}

    public function name(): string
    {
        return 'transfer_suggestions';
    }

    public function description(): string
    {
        return 'Depolardaki stok fazlası ve açıklarını karşılaştırıp transfer önerilerini döner: ürün, kaynak/hedef depo, '
            . 'miktar, gerekçe ve satın almanın yerini tutup tutmadığı.';
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
        $result = $this->transfers->suggestions($user->company_id);

        return [
            'message'     => $result['message'],
            'summary'     => $result['summary'],
            'suggestions' => $result['suggestions']->map(fn($s) => collect($s)->only([
                'name', 'from_warehouse', 'to_warehouse', 'source_stock', 'dest_stock', 'dest_need', 'quantity', 'replaces_purchase', 'reason',
            ]))->values()->all(),
        ];
    }
}
