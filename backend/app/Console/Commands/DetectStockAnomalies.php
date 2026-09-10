<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\Stock\AnomalyService;
use Illuminate\Console\Command;

/** Günlük anomali taraması; yeni ve önemli anomaliler depo yetkililerine bildirilir. */
class DetectStockAnomalies extends Command
{
    protected $signature = 'stock:detect-anomalies {--company= : Sadece bu şirket}';

    protected $description = 'Stok hareketlerinde anomali taraması yapar';

    public function handle(AnomalyService $anomalies): int
    {
        $companies = Company::query()
            ->when($this->option('company'), fn($q, $id) => $q->whereKey($id))
            ->pluck('id');

        foreach ($companies as $companyId) {
            $r = $anomalies->scan($companyId);
            $this->line("{$companyId}: {$r['detected']} tespit, {$r['new']} yeni, {$r['open']} açık");
        }

        return self::SUCCESS;
    }
}
