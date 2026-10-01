<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * Platform ekibinin hazır rolleri. Hepsi seviye 1 ve şirketsizdir; süper adminden farkı
 * is_super işaretinin olmaması, yani yalnızca kendilerine verilen izinleri kullanmalarıdır.
 * Bu roller şablondur: panelden izinleri değiştirilebilir, yenileri eklenebilir.
 */
class PlatformRoleSeeder extends Seeder
{
    private array $roles = [
        [
            'slug'         => 'platform-support',
            'display_name' => 'Destek Ekibi',
            'description'  => 'Destek taleplerini yönetir, şirketleri görüntüler ve gerektiğinde şirkete bağlanır.',
            'color'        => 'blue',
            'permissions'  => [
                'platform.companies.view',
                'platform.companies.impersonate',
                'platform.tickets.view',
                'platform.tickets.manage',
                'platform.users.view',
                'platform.logs.view',
            ],
        ],
        [
            'slug'         => 'platform-sales',
            'display_name' => 'Satış Ekibi',
            'description'  => 'Yeni şirket açar, şirket bilgilerini düzenler, abonelik durumunu yönetir.',
            'color'        => 'emerald',
            'permissions'  => [
                'platform.companies.view',
                'platform.companies.create',
                'platform.companies.edit',
                'platform.companies.suspend',
                'platform.users.view',
                'platform.notifications.send',
            ],
        ],
        [
            'slug'         => 'platform-tech',
            'display_name' => 'Teknik Ekip',
            'description'  => 'Departman modüllerini açıp kapatır, sistem kayıtlarını inceler, şirkete bağlanır.',
            'color'        => 'violet',
            'permissions'  => [
                'platform.companies.view',
                'platform.companies.impersonate',
                'platform.modules.manage',
                'platform.logs.view',
                'platform.users.view',
                'platform.users.manage',
            ],
        ],
    ];

    public function run(): void
    {
        foreach ($this->roles as $definition) {
            $role = Role::updateOrCreate(
                ['slug' => $definition['slug'], 'company_id' => null],
                [
                    'name'         => $definition['slug'],
                    'display_name' => $definition['display_name'],
                    'description'  => $definition['description'],
                    'level'        => 1,
                    'is_system'    => true,
                    'is_super'     => false,
                    'color'        => $definition['color'],
                ]
            );

            $role->permissions()->sync(
                Permission::whereIn('name', $definition['permissions'])->pluck('id')
            );
        }

        $this->command?->info('Platform rolleri hazır: destek, satış, teknik.');
    }
}
