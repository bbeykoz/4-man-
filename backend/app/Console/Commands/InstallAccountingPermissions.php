<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\Accounting\AccountingRoleService;
use Illuminate\Console\Command;

/**
 * Muhasebe izinlerini ve rol şablonlarını kurar.
 *
 * İzinler global olduğu için bir kez; roller şirket başına.
 */
class InstallAccountingPermissions extends Command
{
    protected $signature = 'accounting:install-permissions
                            {--company= : Yalnız bu şirkete rol şablonlarını kur}
                            {--roles : Rol şablonlarını da kur}
                            {--prune : Kaldırılan eski şablon rollerini sil (yalnız kimseye atanmamışsa)}';

    protected $description = 'Muhasebe izinlerini ve rol şablonlarını kurar';

    public function handle(AccountingRoleService $servis): int
    {
        $eklenen = $servis->installPermissions();

        $this->info($eklenen > 0
            ? "$eklenen muhasebe izni eklendi."
            : 'Muhasebe izinleri zaten tanımlı.');

        if (! $this->option('roles') && ! $this->option('company')) {
            $this->comment('Rol şablonlarını kurmak için --roles ekleyin.');
            return self::SUCCESS;
        }

        $sirketler = Company::query()
            ->when($this->option('company'), fn ($q) => $q->whereKey($this->option('company')))
            ->get();

        foreach ($sirketler as $sirket) {
            $sonuc = $servis->installRoleTemplates($sirket);

            $this->line(sprintf('  <info>%s</info>: %d rol eklendi, %d atlandı',
                $sirket->name, $sonuc['created'], $sonuc['skipped']));

            if ($this->option('prune')) {
                $temizlik = $servis->pruneRetiredTemplates($sirket);

                if ($temizlik['deleted']) {
                    $this->line('    silindi: ' . implode(', ', $temizlik['deleted']));
                }

                foreach ($temizlik['kept'] as $ad) {
                    $this->warn("    \"$ad\" rolünde kullanıcı var, silinmedi. Kullanıcıları taşıyıp tekrar çalıştırın.");
                }
            }
        }

        return self::SUCCESS;
    }
}
