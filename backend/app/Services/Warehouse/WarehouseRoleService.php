<?php

namespace App\Services\Warehouse;

use App\Models\Company;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * Depo rol şablonlarını şirkete kurar.
 *
 * Var olan rolü ezmez: şirket rolü düzenlemişse dokunulmaz.
 */
class WarehouseRoleService
{
    private function templates(): array
    {
        return require config_path('warehouse/roles.php');
    }

    /** @return array{created: int, skipped: int, roles: array} */
    public function installRoleTemplates(Company $company): array
    {
        $olusan  = [];
        $atlanan = 0;

        DB::transaction(function () use ($company, &$olusan, &$atlanan) {
            foreach ($this->templates()['role_templates'] as $slug => $sablon) {
                if (Role::where('company_id', $company->id)->where('name', $slug)->exists()) {
                    $atlanan++;
                    continue;
                }

                $rol = Role::create([
                    'company_id'   => $company->id,
                    'name'         => $slug,
                    'slug'         => $slug . '-' . $company->id,
                    'display_name' => $sablon['display_name'],
                    'description'  => $sablon['description'],
                    'level'        => $sablon['level'],
                    'color'        => $sablon['color'],
                    // Sabit sablon ama kilitli degil: sirket izinleri degistirebilir.
                    'is_system'    => false,
                ]);

                $ids = Permission::whereIn('name', $sablon['permissions'])->pluck('id');
                $rol->permissions()->sync($ids);

                $olusan[] = [
                    'name'         => $slug,
                    'display_name' => $sablon['display_name'],
                    'permissions'  => $ids->count(),
                ];
            }
        });

        return ['created' => count($olusan), 'skipped' => $atlanan, 'roles' => $olusan];
    }
}
