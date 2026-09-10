<?php

namespace App\Services\Copilot\Tools;

use App\Models\User;
use App\Services\Copilot\Contracts\CopilotTool;
use App\Services\Stock\AbcXyzService;

/** ABC/XYZ sınıfları, matris ve sınıf politikaları. */
class AbcXyzTool implements CopilotTool
{
    public function __construct(private readonly AbcXyzService $abc) {}

    public function name(): string
    {
        return 'abc_xyz';
    }

    public function description(): string
    {
        return 'Ürünlerin tüketim değerine göre ABC ve talep düzenine göre XYZ sınıfını, 3x3 matris dağılımını, '
            . 'sınıf politikalarını (sayım sıklığı, sipariş yöntemi, güvenlik stoğu) ve önerilen güvenlik stoklarını döner.';
    }

    public function inputSchema(): array
    {
        return ['type' => 'object', 'properties' => ['days' => ['type' => 'integer', 'enum' => [90, 180, 365]]]];
    }

    public function authorize(User $user): bool
    {
        return (bool) $user->company_id && $user->hasPermission('warehouse.records.view');
    }

    public function run(User $user, array $input): array
    {
        $days   = in_array((int) ($input['days'] ?? 90), [90, 180, 365], true) ? (int) ($input['days'] ?? 90) : 90;
        $result = $this->abc->analyze($user->company_id, $days);

        return [
            'summary'  => $result['summary'],
            'matrix'   => $result['matrix'],
            'products' => $result['rows']->take(30)->map(fn($r) => collect($r)->only([
                'name', 'class', 'consumed_value', 'value_share', 'cv', 'safety_stock', 'recommended_safety',
            ]))->values()->all(),
            'policies' => $result['policies'],
        ];
    }
}
