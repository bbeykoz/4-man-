<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\Warehouse\WarehouseRoleService;
use Illuminate\Console\Command;

class InstallWarehouseRoles extends Command
{
    protected $signature = 'warehouse:install-roles {--company= : Yalnız bu şirkete kur}';

    protected $description = 'Depo rol şablonlarını (Depo Sorumlusu, Depo Müdürü) şirketlere kurar';

    public function handle(WarehouseRoleService $servis): int
    {
        $sirketler = Company::query()
            ->when($this->option('company'), fn ($q) => $q->whereKey($this->option('company')))
            ->get();

        foreach ($sirketler as $sirket) {
            $sonuc = $servis->installRoleTemplates($sirket);

            $this->line(sprintf('  <info>%s</info>: %d rol eklendi, %d atlandı',
                $sirket->name, $sonuc['created'], $sonuc['skipped']));
        }

        return self::SUCCESS;
    }
}
