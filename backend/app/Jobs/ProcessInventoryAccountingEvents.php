<?php

namespace App\Jobs;

use App\Models\Company;
use App\Services\Accounting\InventoryPostingService;
use App\Support\AppTime;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Depo olay kuyruğunu işleyen kuyruk işi.
 *
 * Mesaj kuyruğu altyapısı yok; outbox tablosu + Laravel queue aynı garantiyi
 * veriyor. İş başarısız olsa bile olaylar tabloda duruyor, bir sonraki koşuda
 * tekrar deneniyor.
 */
class ProcessInventoryAccountingEvents implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;

    public function __construct(
        private readonly ?string $companyId = null,
        private readonly int $limit = 200,
    ) {}

    public function handle(InventoryPostingService $servis): void
    {
        $sirket = $this->companyId ? Company::find($this->companyId) : null;

        // Şirket bazlı saat dilimi: gün sınırı hesapları doğru olsun.
        if ($sirket) {
            AppTime::useCompany($sirket);
        }

        try {
            $servis->processPending($sirket, $this->limit);
        } finally {
            AppTime::forget();
        }
    }
}
