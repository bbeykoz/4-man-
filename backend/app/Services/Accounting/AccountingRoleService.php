<?php

namespace App\Services\Accounting;

use App\Models\Company;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Muhasebe izinleri ve rol şablonları.
 *
 * Mevcut rol/izin altyapısına ekleme yapıyor; paralel bir yetki sistemi
 * kurmuyor. İzinler global (permissions tablosu şirketten bağımsız), roller
 * şirkete ait.
 */
class AccountingRoleService
{
    /**
     * Bir zamanlar kurulmuş, artık şablonda olmayan rol adları. Temizlik
     * yalnız bu listeyle sınırlı; şirketin kendi rolleri kapsam dışı.
     */
    private const EMEKLI_SABLONLAR = [
        'accounting-clerk', 'chief-accountant', 'cash-operator',
        'accounting-auditor', 'finance-manager',
    ];

    public function __construct(private readonly AuditService $audit) {}

    private function config(): array
    {
        return require config_path('accounting/permissions.php');
    }

    /**
     * Muhasebe izinlerini sisteme ekler.
     *
     * Global tablo; şirket başına değil bir kez çalışır. Var olanlara
     * dokunmuyor.
     */
    public function installPermissions(): int
    {
        $cfg     = $this->config();
        $eklenen = 0;

        foreach ($cfg['permissions'] as $ad => $etiket) {
            if (Permission::where('name', $ad)->exists()) {
                continue;
            }

            [$modul, $kaynak, $eylem] = array_pad(explode('.', $ad), 3, null);

            Permission::create([
                'name'         => $ad,
                'display_name' => $etiket,
                'group'        => 'Muhasebe',
                'module'       => $modul,
                'resource'     => $kaynak,
                'action'       => $eylem,
            ]);

            $eklenen++;
        }

        return $eklenen;
    }

    /**
     * Şirkete muhasebe rol şablonlarını kurar.
     *
     * Var olan rolü ezmiyor: şirket rolü düzenlemişse müdahale etmiyoruz.
     *
     * @return array{created: int, skipped: int, roles: array}
     */
    public function installRoleTemplates(Company $company): array
    {
        $cfg = $this->config();

        $muhasebeIzinleri = array_keys($cfg['permissions']);
        $olusan = [];
        $atlanan = 0;

        DB::transaction(function () use ($company, $cfg, $muhasebeIzinleri, &$olusan, &$atlanan) {
            foreach ($cfg['role_templates'] as $slug => $sablon) {
                $mevcut = Role::where('company_id', $company->id)->where('name', $slug)->first();

                if ($mevcut) {
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
                    'is_system'    => false,
                ]);

                $izinler = $sablon['permissions'] === '*'
                    ? $muhasebeIzinleri
                    : $sablon['permissions'];

                $ids = Permission::whereIn('name', $izinler)->pluck('id');
                $rol->permissions()->sync($ids);

                $olusan[] = [
                    'id'           => $rol->id,
                    'name'         => $slug,
                    'display_name' => $sablon['display_name'],
                    'permissions'  => $ids->count(),
                ];
            }
        });

        if ($olusan) {
            $this->audit->log(
                companyId: $company->id, action: 'accounting_roles.installed',
                entityType: 'Role', payload: ['created' => count($olusan), 'skipped' => $atlanan],
            );
        }

        return ['created' => count($olusan), 'skipped' => $atlanan, 'roles' => $olusan];
    }

    /**
     * Kaldırılan şablon rolleri temizler.
     *
     * Yalnız bu servisin kurduğu eski şablonlara dokunur ve yalnız kimseye
     * atanmamışsa siler. Şirketin kendi açtığı özel roller ile kullanıcısı
     * olan roller hiçbir koşulda silinmez — atanmış rolü silmek kullanıcıyı
     * sessizce yetkisiz bırakırdı.
     *
     * @return array{deleted: array<string>, kept: array<string>}
     */
    public function pruneRetiredTemplates(Company $company): array
    {
        $gecerli = array_keys($this->config()['role_templates']);
        $silinen = [];
        $korunan = [];

        $roller = Role::where('company_id', $company->id)
            ->whereIn('name', self::EMEKLI_SABLONLAR)
            ->whereNotIn('name', $gecerli)
            ->get();

        foreach ($roller as $rol) {
            if ($rol->users()->count() > 0) {
                $korunan[] = $rol->display_name;
                continue;
            }

            $rol->permissions()->detach();
            $rol->delete();
            $silinen[] = $rol->display_name;
        }

        if ($silinen) {
            $this->audit->log(
                companyId: $company->id, action: 'accounting_roles.pruned',
                entityType: 'Role', payload: ['deleted' => $silinen, 'kept' => $korunan],
            );
        }

        return ['deleted' => $silinen, 'kept' => $korunan];
    }

    /** Şirketin muhasebe rolleri ve izin sayıları. */
    public function listing(Company $company): array
    {
        $muhasebeIzinleri = array_keys($this->config()['permissions']);

        return Role::where('company_id', $company->id)
            ->with('permissions')
            ->orderBy('level')->orderBy('display_name')
            ->get()
            ->map(function (Role $r) use ($muhasebeIzinleri) {
                $izinler = $r->permissions->pluck('name');
                $muhasebe = $izinler->intersect($muhasebeIzinleri);

                return [
                    'id'                     => $r->id,
                    'name'                   => $r->name,
                    'display_name'           => $r->display_name,
                    'description'            => $r->description,
                    'level'                  => $r->level,
                    'color'                  => $r->color,
                    'users_count'            => $r->users()->count(),
                    'permissions_count'      => $izinler->count(),
                    'accounting_permissions' => $muhasebe->values()->all(),
                    'is_accounting_role'     => $muhasebe->isNotEmpty(),
                ];
            })
            ->all();
    }

    /** Tanımlı muhasebe izinleri; arayüzde gruplu gösterim için. */
    public function permissionCatalog(): array
    {
        $cfg = $this->config();
        $gruplar = [];

        foreach ($cfg['permissions'] as $ad => $etiket) {
            $parcalar = explode('.', $ad);
            $kaynak   = $parcalar[1] ?? 'genel';

            $gruplar[$kaynak][] = ['name' => $ad, 'label' => $etiket];
        }

        return $gruplar;
    }
}
