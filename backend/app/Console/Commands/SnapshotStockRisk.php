<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\Stock\StockRiskService;
use Illuminate\Console\Command;

/** Günlük stok risk anlık görüntüsü (risk trendi grafiği için). Zamanlayıcı her gece çalıştırır. */
class SnapshotStockRisk extends Command
{
    protected $signature = 'stock:snapshot-risk {--company= : Sadece bu şirket}';

    protected $description = 'Ürün risk skorlarını günlük olarak kaydeder';

    public function handle(StockRiskService $risk): int
    {
        $companies = Company::query()
            ->when($this->option('company'), fn($q, $id) => $q->whereKey($id))
            ->pluck('id');

        foreach ($companies as $companyId) {
            $count = $risk->snapshot($companyId);
            $this->line("{$companyId}: {$count} ürün");
        }

        return self::SUCCESS;
    }
}
