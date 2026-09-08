<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Department;
use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoCompanySeeder extends Seeder
{
    public function run(): void
    {
        // Demo şirketi oluştur
        $company = Company::updateOrCreate(
            ['slug' => 'demo-sirket'],
            [
                'name'            => 'Demo Şirket A.Ş.',
                'slug'            => 'demo-sirket',
                'email'           => 'info@demo.com',
                'phone'           => '+90 212 555 0000',
                'address'         => 'İstanbul, Türkiye',
                'plan_type'       => 'enterprise',
                'max_users'       => 999,
                'max_departments' => 99,
                'status'          => 'active',
            ]
        );

        // Tüm modülleri şirkete bağla
        $moduleIds = Module::pluck('id');
        foreach ($moduleIds as $moduleId) {
            \DB::table('company_modules')->updateOrInsert(
                ['company_id' => $company->id, 'module_id' => $moduleId],
                ['is_active' => true, 'activated_at' => now()]
            );
        }

        // Şirket rolleri
        $ownerRole = $this->createRole($company->id, 'company-owner', 'Şirket Sahibi', 2, 'purple',
            ['company.settings', 'company.users.view', 'company.users.create', 'company.users.edit',
             'company.departments.view', 'company.departments.create', 'company.departments.edit',
             'company.roles.view', 'company.roles.create', 'company.roles.edit', 'company.modules.manage',
             'company.reports.view', 'company.reports.export']
        );

        $managerRole = $this->createRole($company->id, 'dept-manager', 'Departman Müdürü', 3, 'blue',
            array_merge(
                $this->modulePermissions(['accounting', 'warehouse', 'shipping']),
                ['company.departments.view', 'company.reports.view']
            )
        );

        $staffRole = $this->createRole($company->id, 'staff', 'Personel', 4, 'green',
            $this->modulePermissions(['accounting', 'warehouse', 'packaging'])
        );

        $viewerRole = $this->createRole($company->id, 'viewer', 'İzleyici', 5, 'gray',
            $this->moduleViewPermissions()
        );

        // Company Owner kullanıcısı
        $owner = $this->createUser($company, 'Ahmet Yılmaz', 'owner@demo.com', 'Demo@2024!', null, $ownerRole);
        $company->update(['owner_id' => $owner->id]);

        // Departmanlar oluştur
        $deptData = [
            ['name' => 'Muhasebe',         'type' => 'accounting'],
            ['name' => 'Marketing',         'type' => 'marketing'],
            ['name' => 'Depo Yönetimi',     'type' => 'warehouse'],
            ['name' => 'Paketleme',         'type' => 'packaging'],
            ['name' => 'İade & Gümrük',     'type' => 'returns'],
            ['name' => 'Nakliye',           'type' => 'shipping'],
        ];

        foreach ($deptData as $d) {
            Department::updateOrCreate(
                ['company_id' => $company->id, 'slug' => Str::slug($d['name'])],
                ['name' => $d['name'], 'slug' => Str::slug($d['name']), 'type' => $d['type'], 'status' => 'active', 'color' => 'blue']
            );
        }

        $depts = Department::where('company_id', $company->id)->get()->keyBy('type');

        // Demo kullanıcılar
        $this->createUser($company, 'Mehmet Demir',  'manager@demo.com',    'Demo@2024!', $depts['accounting']?->id, $managerRole);
        $this->createUser($company, 'Ayşe Kaya',     'staff@demo.com',      'Demo@2024!', $depts['warehouse']?->id,  $staffRole);
        $this->createUser($company, 'Fatma Öz',      'viewer@demo.com',     'Demo@2024!', $depts['shipping']?->id,   $viewerRole);

        $this->command->info("Demo company seeded. Owner: owner@demo.com / Demo@2024!");
    }

    private function createRole(string $companyId, string $slug, string $displayName, int $level, string $color, array $permNames): Role
    {
        $role = Role::updateOrCreate(
            ['slug' => $slug, 'company_id' => $companyId],
            [
                'name'         => $slug,
                'display_name' => $displayName,
                'level'        => $level,
                'color'        => $color,
                'is_system'    => false,
            ]
        );

        $permIds = Permission::whereIn('name', $permNames)->pluck('id');
        $role->permissions()->sync($permIds);

        return $role;
    }

    private function createUser(Company $company, string $name, string $email, string $password, ?string $deptId, Role $role): User
    {
        $user = User::updateOrCreate(
            ['email' => $email],
            [
                'company_id'        => $company->id,
                'department_id'     => $deptId,
                'name'              => $name,
                'password'          => Hash::make($password),
                'status'            => 'active',
                'email_verified_at' => now(),
            ]
        );

        $user->roles()->syncWithoutDetaching([$role->id => [
            'company_id'  => $company->id,
            'assigned_at' => now(),
        ]]);

        return $user;
    }

    private function modulePermissions(array $modules): array
    {
        $perms = [];
        foreach ($modules as $module) {
            $perms = array_merge($perms, [
                "{$module}.records.view",
                "{$module}.records.create",
                "{$module}.records.edit",
                "{$module}.records.delete",
            ]);
        }
        return $perms;
    }

    private function moduleViewPermissions(): array
    {
        $modules = array_keys(config('modules.list'));
        return array_map(fn($m) => "{$m}.records.view", $modules);
    }
}
