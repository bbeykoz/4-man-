<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Department;
use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Repositories\CompanyRepository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class CompanyService
{
    public function __construct(
        private readonly CompanyRepository $companyRepository,
        private readonly ActivityLogService $activityLogService,
    ) {}

    public function create(array $data): Company
    {
        return DB::transaction(function () use ($data) {
            $company = $this->companyRepository->create([
                'name'            => $data['name'],
                'slug'            => $data['slug'] ?? Str::slug($data['name']),
                'email'           => $data['email'] ?? null,
                'phone'           => $data['phone'] ?? null,
                'address'         => $data['address'] ?? null,
                'tax_number'      => $data['tax_number'] ?? null,
                'plan_type'       => $data['plan_type'] ?? 'pro',
                'max_users'       => $data['max_users'] ?? 50,
                'max_departments' => $data['max_departments'] ?? 10,
                'status'          => 'active',
            ]);

            // Tüm aktif modülleri şirkete bağla
            $moduleIds = Module::active()->pluck('id');
            $company->modules()->attach($moduleIds, [
                'is_active'    => true,
                'activated_at' => now(),
            ]);

            // Şirket için varsayılan roller oluştur
            $this->createDefaultRoles($company);

            // Şirket için varsayılan departmanları oluştur
            $this->createDefaultDepartments($company);

            // Şirket sahibi kullanıcısı oluştur
            if (!empty($data['owner_name']) && !empty($data['owner_email']) && !empty($data['owner_password'])) {
                $ownerRole = Role::where('company_id', $company->id)
                    ->where('slug', 'company-owner')
                    ->first();

                $owner = User::create([
                    'company_id' => $company->id,
                    'name'       => $data['owner_name'],
                    'email'      => $data['owner_email'],
                    'password'   => Hash::make($data['owner_password']),
                    'status'     => 'active',
                    'timezone'   => 'Europe/Istanbul',
                    'locale'     => 'tr',
                ]);

                if ($ownerRole) {
                    $owner->roles()->attach($ownerRole->id, [
                        'company_id'  => $company->id,
                        'assigned_at' => now(),
                    ]);
                }

                $company->update(['owner_id' => $owner->id]);
            }

            $this->activityLogService->log(
                action: 'company.created',
                model: $company,
                newValues: ['name' => $company->name, 'plan' => $company->plan_type],
            );

            return $company;
        });
    }

    public function update(Company $company, array $data): Company
    {
        $oldValues = ['name' => $company->name, 'status' => $company->status];

        $updated = $this->companyRepository->update($company, array_filter([
            'name'            => $data['name'] ?? null,
            'email'           => $data['email'] ?? null,
            'phone'           => $data['phone'] ?? null,
            'address'         => $data['address'] ?? null,
            'tax_number'      => $data['tax_number'] ?? null,
            'plan_type'       => $data['plan_type'] ?? null,
            'max_users'       => $data['max_users'] ?? null,
            'status'          => $data['status'] ?? null,
        ], fn($v) => $v !== null));

        $this->activityLogService->log(
            action: 'company.updated',
            model: $updated,
            oldValues: $oldValues,
            newValues: $data,
        );

        return $updated;
    }

    public function suspend(Company $company): void
    {
        $company->update(['status' => 'suspended']);
        $company->users()->update(['status' => 'suspended']);

        $this->activityLogService->log('company.suspended', $company);
    }

    public function activate(Company $company): void
    {
        $company->update(['status' => 'active']);
        $company->users()->where('status', 'suspended')->update(['status' => 'active']);

        $this->activityLogService->log('company.activated', $company);
    }

    public function toggleModule(Company $company, string $moduleId, bool $isActive): void
    {
        $company->modules()->updateExistingPivot($moduleId, ['is_active' => $isActive]);

        // Cache temizle
        $module = Module::find($moduleId);
        if ($module) {
            cache()->forget("company_module_{$company->id}_{$module->slug}");
        }
    }

    public static function defaultDepartments(): array
    {
        return [
            ['name' => 'Muhasebe',     'type' => 'accounting', 'color' => 'blue'],
            ['name' => 'Marketing',    'type' => 'marketing',  'color' => 'green'],
            ['name' => 'Depo',         'type' => 'warehouse',  'color' => 'orange'],
            ['name' => 'Paketleme',    'type' => 'packaging',  'color' => 'purple'],
            ['name' => 'İade',         'type' => 'returns',    'color' => 'red'],
            ['name' => 'Gümrükleme',   'type' => 'customs',    'color' => 'yellow'],
            ['name' => 'Nakliye',      'type' => 'shipping',   'color' => 'gray'],
        ];
    }

    private function createDefaultDepartments(Company $company): void
    {
        foreach (self::defaultDepartments() as $dept) {
            Department::firstOrCreate(
                ['company_id' => $company->id, 'slug' => Str::slug($dept['name'])],
                [
                    'name'   => $dept['name'],
                    'type'   => $dept['type'],
                    'color'  => $dept['color'],
                    'status' => 'active',
                ]
            );
        }
    }

    public static function ownerPermissions(): array
    {
        return [
            'company.settings',
            'company.users.view', 'company.users.create', 'company.users.edit', 'company.users.delete',
            'company.departments.view', 'company.departments.create', 'company.departments.edit', 'company.departments.delete',
            'company.roles.view', 'company.roles.create', 'company.roles.edit', 'company.roles.delete',
            'company.modules.manage',
            'company.reports.view', 'company.reports.export',
        ];
    }

    private function createDefaultRoles(Company $company): void
    {
        $roles = [
            ['slug' => 'company-owner',     'display_name' => 'Şirket Sahibi',    'level' => 2, 'color' => 'purple', 'is_system' => true],
            ['slug' => 'department-manager','display_name' => 'Departman Müdürü', 'level' => 3, 'color' => 'blue',   'is_system' => true],
            ['slug' => 'staff',             'display_name' => 'Personel',          'level' => 4, 'color' => 'green',  'is_system' => true],
            ['slug' => 'viewer',            'display_name' => 'İzleyici',          'level' => 5, 'color' => 'gray',   'is_system' => true],
        ];

        foreach ($roles as $roleData) {
            $role = Role::create(array_merge($roleData, [
                'company_id' => $company->id,
                'name'       => $roleData['slug'],
            ]));

            if ($roleData['slug'] === 'company-owner') {
                $permIds = Permission::whereIn('name', self::ownerPermissions())->pluck('id');
                $role->permissions()->sync($permIds);
            }
        }
    }
}
