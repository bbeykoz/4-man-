<?php

namespace App\Services\Copilot\Tools;

use App\Models\StockMovement;
use App\Models\User;
use App\Models\WarehouseProduct;
use App\Services\Copilot\Contracts\CopilotTool;
use Illuminate\Support\Facades\DB;

/** Şirketin genel stok durumu: ürün sayısı, kritik stok, karantina/hasar, depo kırılımı. */
class StockSummaryTool implements CopilotTool
{
    public function name(): string
    {
        return 'stock_summary';
    }

    public function description(): string
    {
        return 'Şirketin güncel stok özetini döner: toplam ürün, kritik stok altındaki ürünler, '
            . 'kullanılabilir/karantina/hasarlı miktarlar ve depo bazında dağılım.';
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
        $companyId = $user->company_id;

        $products = WarehouseProduct::forCompany($companyId)->active()
            ->get(['id', 'name', 'sku', 'unit', 'current_stock', 'min_stock']);

        $critical = $products
            ->filter(fn($p) => $p->min_stock > 0 && $p->current_stock <= $p->min_stock)
            ->map(fn($p) => $p->only(['name', 'sku', 'unit', 'current_stock', 'min_stock']))
            ->values();

        $buckets = StockMovement::forCompany($companyId)
            ->groupBy('bucket')
            ->get(['bucket', DB::raw('SUM(quantity) as qty')])
            ->mapWithKeys(fn($r) => [$r->bucket => round((float) $r->qty, 3)]);

        $byWarehouse = StockMovement::where('stock_movements.company_id', $companyId)
            ->join('warehouses', 'warehouses.id', '=', 'stock_movements.warehouse_id')
            ->where('stock_movements.bucket', StockMovement::BUCKET_AVAILABLE)
            ->groupBy('warehouses.name')
            ->get(['warehouses.name', DB::raw('SUM(stock_movements.quantity) as qty')])
            ->mapWithKeys(fn($r) => [$r->name => round((float) $r->qty, 3)]);

        return [
            'active_products'   => $products->count(),
            'critical_products' => $critical,
            'buckets'           => $buckets,
            'available_by_warehouse' => $byWarehouse,
        ];
    }
}
