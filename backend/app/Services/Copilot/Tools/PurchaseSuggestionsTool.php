<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\PurchasingService;

/** Otomatik satın alma önerileri (sadece öneri; taslak sipariş kullanıcı onayıyla oluşur). */
class PurchaseSuggestionsTool implements CopilotTool
{
    public function __construct(private readonly PurchasingService $purchasing) {}

    public function name(): string
    {
        return 'purchase_suggestions';
    }

    public function description(): string
    {
        return 'Sipariş verilmesi gereken ürünleri, önerilen miktarı, tedarikçiyi ve hesap gerekçesini döner. '
            . 'Sipariş oluşturmaz; kullanıcı Satın Alma ekranından onaylar.';
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
        return $this->purchasing->suggestions($user->company_id)
            ->map(fn($s) => collect($s)->only(['name', 'sku', 'unit', 'supplier_name', 'available', 'on_order', 'suggested_qty', 'estimated_amount', 'reason']))
            ->all();
    }
}
