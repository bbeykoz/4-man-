<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    private array $systemPermissions = [
        // Super Admin
        ['name' => 'system.settings',    'display_name' => 'Sistem Ayarları',    'group' => 'system',  'module' => 'system',  'resource' => 'settings',  'action' => 'manage'],
        ['name' => 'system.modules',     'display_name' => 'Modül Yönetimi',     'group' => 'system',  'module' => 'system',  'resource' => 'modules',   'action' => 'manage'],
        ['name' => 'system.logs',        'display_name' => 'Sistem Logları',     'group' => 'system',  'module' => 'system',  'resource' => 'logs',      'action' => 'view'],
        ['name' => 'companies.view',     'display_name' => 'Şirket Görüntüle',   'group' => 'company', 'module' => 'company', 'resource' => 'companies', 'action' => 'view'],
        ['name' => 'companies.create',   'display_name' => 'Şirket Oluştur',    'group' => 'company', 'module' => 'company', 'resource' => 'companies', 'action' => 'create'],
        ['name' => 'companies.edit',     'display_name' => 'Şirket Düzenle',    'group' => 'company', 'module' => 'company', 'resource' => 'companies', 'action' => 'edit'],
        ['name' => 'companies.delete',   'display_name' => 'Şirket Sil',        'group' => 'company', 'module' => 'company', 'resource' => 'companies', 'action' => 'delete'],

        // Company Owner
        ['name' => 'company.settings',        'display_name' => 'Şirket Ayarları',         'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'settings',    'action' => 'manage'],
        ['name' => 'company.users.view',       'display_name' => 'Kullanıcı Görüntüle',     'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'users',       'action' => 'view'],
        ['name' => 'company.users.create',     'display_name' => 'Kullanıcı Oluştur',       'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'users',       'action' => 'create'],
        ['name' => 'company.users.edit',       'display_name' => 'Kullanıcı Düzenle',       'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'users',       'action' => 'edit'],
        ['name' => 'company.users.delete',     'display_name' => 'Kullanıcı Sil',           'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'users',       'action' => 'delete'],
        ['name' => 'company.departments.view', 'display_name' => 'Departman Görüntüle',     'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'departments', 'action' => 'view'],
        ['name' => 'company.departments.create','display_name'=> 'Departman Oluştur',       'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'departments', 'action' => 'create'],
        ['name' => 'company.departments.edit', 'display_name' => 'Departman Düzenle',       'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'departments', 'action' => 'edit'],
        ['name' => 'company.departments.delete','display_name'=> 'Departman Sil',           'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'departments', 'action' => 'delete'],
        ['name' => 'company.roles.view',       'display_name' => 'Rol Görüntüle',           'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'roles',       'action' => 'view'],
        ['name' => 'company.roles.create',     'display_name' => 'Rol Oluştur',             'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'roles',       'action' => 'create'],
        ['name' => 'company.roles.edit',       'display_name' => 'Rol Düzenle',             'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'roles',       'action' => 'edit'],
        ['name' => 'company.roles.delete',     'display_name' => 'Rol Sil',                 'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'roles',       'action' => 'delete'],
        ['name' => 'company.modules.manage',   'display_name' => 'Modül Aktif/Pasif',       'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'modules',     'action' => 'manage'],
        ['name' => 'company.reports.view',     'display_name' => 'Raporları Görüntüle',     'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'reports',     'action' => 'view'],
        ['name' => 'company.reports.export',   'display_name' => 'Rapor Dışa Aktar',        'group' => 'company_mgmt', 'module' => 'company', 'resource' => 'reports',     'action' => 'export'],
    ];

    public function run(): void
    {
        // System permissions
        foreach ($this->systemPermissions as $perm) {
            Permission::updateOrCreate(['name' => $perm['name']], $perm);
        }

        // Module permissions
        $modules = config('modules.list');
        $actions = config('permissions.actions');

        foreach ($modules as $slug => $config) {
            foreach ($config['permissions'] as $action) {
                $name = "{$slug}.records.{$action}";
                Permission::updateOrCreate(
                    ['name' => $name],
                    [
                        'name'         => $name,
                        'display_name' => $config['name'] . ' ' . ucfirst($action),
                        'group'        => $slug,
                        'module'       => $slug,
                        'resource'     => 'records',
                        'action'       => $action,
                    ]
                );
            }
        }

        // Staff-level permissions for individual module pages
        $staffModules = ['accounting', 'marketing', 'shipping', 'customs', 'returns', 'packaging'];
        foreach ($staffModules as $slug) {
            $config = $modules[$slug] ?? null;
            if (!$config) continue;
            foreach ($config['permissions'] as $action) {
                $name = "{$slug}.staff.{$action}";
                Permission::updateOrCreate(
                    ['name' => $name],
                    [
                        'name'         => $name,
                        'display_name' => $config['name'] . ' Personel ' . ucfirst($action),
                        'group'        => $slug,
                        'module'       => $slug,
                        'resource'     => 'staff',
                        'action'       => $action,
                    ]
                );
            }
        }

        $count = Permission::count();
        $this->command->info("Permissions seeded: {$count}");
    }
}
