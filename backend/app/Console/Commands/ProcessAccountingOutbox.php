<?php

namespace App\Console\Commands;

use App\Models\Accounting\InventoryAccountingEvent;
use App\Models\Company;
use App\Services\Accounting\InventoryPostingService;
use App\Support\AppTime;
use Illuminate\Console\Command;

/**
 * Depo → muhasebe kuyruğunu işler.
 *
 * Zamanlanmış görev olarak ya da elle çalıştırılır. --retry-failed teknik
 * hatayla duranları yeniden dener; "exception" durumundakilere dokunmaz
 * çünkü onlar insan kararı bekliyor (kapalı dönem gibi).
 */
class ProcessAccountingOutbox extends Command
{
    protected $signature = 'accounting:process-outbox
                            {--company= : Yalnız bu şirket (UUID)}
                            {--limit=200 : Tek koşuda işlenecek olay sayısı}
                            {--retry-failed : Teknik hatayla duranları yeniden kuyruğa al}';

    protected $description = 'Depo olaylarını muhasebe fişlerine çevirir';

    public function handle(InventoryPostingService $servis): int
    {
        $sirketler = Company::query()
            ->when($this->option('company'), fn ($q) => $q->whereKey($this->option('company')))
            ->get();

        $toplam = ['processed' => 0, 'skipped' => 0, 'exception' => 0, 'failed' => 0];

        foreach ($sirketler as $sirket) {
            AppTime::useCompany($sirket);

            if ($this->option('retry-failed')) {
                $geri = InventoryAccountingEvent::where('company_id', $sirket->id)
                    ->where('status', 'failed')
                    ->update(['status' => 'pending']);

                if ($geri > 0) {
                    $this->line("  {$sirket->name}: $geri hatalı olay yeniden kuyruğa alındı");
                }
            }

            $bekleyen = InventoryAccountingEvent::where('company_id', $sirket->id)->pending()->count();

            if ($bekleyen === 0) {
                continue;
            }

            $sonuc = $servis->processPending($sirket, (int) $this->option('limit'));

            $this->line(sprintf('  <info>%s</info>: işlenen %d, atlanan %d, istisna %d, hatalı %d',
                $sirket->name, $sonuc['processed'], $sonuc['skipped'], $sonuc['exception'], $sonuc['failed']));

            foreach ($toplam as $k => $v) {
                $toplam[$k] += $sonuc[$k] ?? 0;
            }

            AppTime::forget();
        }

        if (array_sum($toplam) === 0) {
            $this->info('Bekleyen depo olayı yok.');
            return self::SUCCESS;
        }

        $this->newLine();
        $this->info(sprintf('Toplam: işlenen %d, atlanan %d, istisna %d, hatalı %d',
            $toplam['processed'], $toplam['skipped'], $toplam['exception'], $toplam['failed']));

        if ($toplam['exception'] > 0) {
            $this->warn('İstisna durumundaki olaylar insan kararı bekliyor (kapalı dönem ya da eksik hesap eşlemesi).');
        }

        return self::SUCCESS;
    }
}
