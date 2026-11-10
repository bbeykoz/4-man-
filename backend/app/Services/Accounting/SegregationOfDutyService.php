<?php

namespace App\Services\Accounting;

use App\Models\Company;
use App\Models\Role;
use App\Models\User;
use App\Support\AppTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Görev ayrılığı (segregation of duty).
 *
 * İki ayrı kontrol yapıyor:
 *  1. Yapısal: bir kullanıcının izinleri çakışan iki yetkiyi birden taşıyor mu.
 *     Rol atamasında ve denetim raporunda görünür.
 *  2. İşlemsel: aynı kişi aynı kaydın iki ayrı adımını yapıyor mu
 *     (hazırlayan = onaylayan). İşlem anında engellenir.
 *
 * Yapısal çakışma gerekçeli istisnayla açılabiliyor; küçük şirkette aynı kişi
 * iki rolü taşımak zorunda kalabiliyor. İstisna kayıtlı ve süreli olduğu için
 * denetimde görünür kalıyor — sessizce yok saymaktan iyi.
 */
class SegregationOfDutyService
{
    public function __construct(private readonly AuditService $audit) {}

    private function conflicts(): array
    {
        return config('accounting.duty_conflicts', [])
            ?: require config_path('accounting/permissions.php')['duty_conflicts'] ?? [];
    }

    private function conflictCatalog(): array
    {
        $cfg = require config_path('accounting/permissions.php');

        return $cfg['duty_conflicts'] ?? [];
    }

    /**
     * Kullanıcının yapısal çakışmaları.
     *
     * @return array<int, array{code: string, label: string, severity: string, permissions: array, excepted: bool}>
     */
    public function conflictsFor(User $kullanici): array
    {
        // Şirket sahibi ve süper admin her izni taşır; onları çakışma olarak
        // raporlamak gürültü üretir, ama tamamen gizlemek de yanlış olur.
        $izinler = $kullanici->getPermissions();
        $istisna = $this->activeExceptions($kullanici);

        $sonuc = [];

        foreach ($this->conflictCatalog() as $kod => $kural) {
            $tumu = collect($kural['permissions'])->every(
                fn (string $izin) => $kullanici->hasPermission($izin),
            );

            if (! $tumu) {
                continue;
            }

            $sonuc[] = [
                'code'        => $kod,
                'label'       => $kural['label'],
                'severity'    => $kural['severity'],
                'explanation' => $kural['explanation'],
                'permissions' => $kural['permissions'],
                'excepted'    => isset($istisna[$kod]),
                'exception'   => $istisna[$kod] ?? null,
                'inherited'   => $kullanici->isCompanyOwner() || $kullanici->isSuperAdmin(),
            ];
        }

        unset($izinler);

        return $sonuc;
    }

    /**
     * İşlem anı kontrolü: bu kullanıcı bu kaydın bu adımını yapabilir mi.
     *
     * @param  string  $kod        Çakışma kodu.
     * @param  string|null  $onceki Önceki adımı yapan kullanıcının kimliği.
     */
    public function assertCanAct(User $kullanici, string $kod, ?string $onceki, string $mesaj): void
    {
        if ($onceki === null || $onceki !== $kullanici->id) {
            return;
        }

        $kural = $this->conflictCatalog()[$kod] ?? null;

        if (! $kural) {
            return;
        }

        // İstisnası olan kullanıcı geçebilir ama olay denetime yazılır.
        if (isset($this->activeExceptions($kullanici)[$kod])) {
            $this->audit->log(
                companyId: $kullanici->company_id,
                action:    'sod.exception_used',
                entityType:'User',
                entityId:  $kullanici->id,
                payload:   ['conflict' => $kod, 'label' => $kural['label']],
            );

            return;
        }

        if ($kural['severity'] === 'blocking') {
            $this->audit->log(
                companyId: $kullanici->company_id,
                action:    'sod.blocked',
                entityType:'User',
                entityId:  $kullanici->id,
                payload:   ['conflict' => $kod, 'label' => $kural['label']],
            );

            throw ValidationException::withMessages(['segregation' => $mesaj]);
        }

        // Uyarı seviyesi: engellemiyor ama iz bırakıyor.
        $this->audit->log(
            companyId: $kullanici->company_id,
            action:    'sod.warning',
            entityType:'User',
            entityId:  $kullanici->id,
            payload:   ['conflict' => $kod, 'label' => $kural['label']],
        );
    }

    /** Şirket genelinde çakışma raporu. */
    public function companyReport(Company $company): array
    {
        $kullanicilar = User::where('company_id', $company->id)
            ->where('status', 'active')
            ->with('roles')
            ->get();

        $satirlar = [];
        $ozet     = ['blocking' => 0, 'warning' => 0, 'excepted' => 0];

        foreach ($kullanicilar as $k) {
            $cakismalar = $this->conflictsFor($k);

            if ($cakismalar === []) {
                continue;
            }

            foreach ($cakismalar as $c) {
                if ($c['excepted']) {
                    $ozet['excepted']++;
                } else {
                    $ozet[$c['severity']] = ($ozet[$c['severity']] ?? 0) + 1;
                }
            }

            $satirlar[] = [
                'user_id'    => $k->id,
                'user_name'  => $k->name,
                'email'      => $k->email,
                'roles'      => $k->roles->pluck('display_name')->all(),
                'is_owner'   => $k->isCompanyOwner(),
                'conflicts'  => $cakismalar,
            ];
        }

        return [
            'users'        => $satirlar,
            'summary'      => $ozet + ['users_with_conflicts' => count($satirlar), 'users_checked' => $kullanicilar->count()],
            'catalog'      => array_map(fn (array $k, string $kod) => [
                'code'        => $kod,
                'label'       => $k['label'],
                'severity'    => $k['severity'],
                'explanation' => $k['explanation'],
            ], $this->conflictCatalog(), array_keys($this->conflictCatalog())),
            'generated_at' => AppTime::now()->toIso8601String(),
        ];
    }

    /**
     * Rol ataması öncesi kontrol: bu rol verilirse çakışma doğar mı.
     * Engellemiyor, uyarıyor — kararı insan veriyor.
     */
    public function previewRoleAssignment(User $kullanici, Role $rol): array
    {
        $mevcut = collect($this->conflictsFor($kullanici))->pluck('code')->all();

        $rolIzinleri = $rol->permissions()->pluck('name')->all();
        $tumIzinler  = array_unique(array_merge($kullanici->getPermissions()->all(), $rolIzinleri));

        $yeni = [];

        foreach ($this->conflictCatalog() as $kod => $kural) {
            if (in_array($kod, $mevcut, true)) {
                continue;
            }

            if (collect($kural['permissions'])->every(fn ($i) => in_array($i, $tumIzinler, true))) {
                $yeni[] = ['code' => $kod, 'label' => $kural['label'],
                           'severity' => $kural['severity'], 'explanation' => $kural['explanation']];
            }
        }

        return [
            'role'              => ['id' => $rol->id, 'name' => $rol->display_name],
            'existing_conflicts'=> $mevcut,
            'new_conflicts'     => $yeni,
            'safe'              => $yeni === [],
        ];
    }

    /** Gerekçeli istisna tanımlar. */
    public function grantException(User $kullanici, string $kod, string $gerekce, ?string $bitis = null): array
    {
        if (! isset($this->conflictCatalog()[$kod])) {
            throw ValidationException::withMessages(['conflict_code' => "Tanımsız çakışma kodu: $kod"]);
        }

        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'İstisna gerekçesi zorunludur.']);
        }

        $id = (string) \Illuminate\Support\Str::uuid();

        DB::table('accounting_duty_exceptions')->insert([
            'id'            => $id,
            'company_id'    => $kullanici->company_id,
            'user_id'       => $kullanici->id,
            'conflict_code' => $kod,
            'reason'        => $gerekce,
            'valid_from'    => AppTime::today()->toDateString(),
            'valid_to'      => $bitis,
            'granted_by'    => auth()->id(),
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);

        $this->audit->log(
            companyId: $kullanici->company_id,
            action:    'sod.exception_granted',
            entityType:'User',
            entityId:  $kullanici->id,
            payload:   ['conflict' => $kod, 'valid_to' => $bitis],
            reason:    $gerekce,
        );

        return ['id' => $id, 'conflict_code' => $kod, 'valid_to' => $bitis];
    }

    public function revokeException(string $exceptionId, string $companyId): void
    {
        $kayit = DB::table('accounting_duty_exceptions')
            ->where('id', $exceptionId)->where('company_id', $companyId)->first();

        if (! $kayit) {
            throw ValidationException::withMessages(['exception' => 'İstisna bulunamadı.']);
        }

        DB::table('accounting_duty_exceptions')->where('id', $exceptionId)->delete();

        $this->audit->log(
            companyId: $companyId, action: 'sod.exception_revoked',
            entityType: 'User', entityId: $kayit->user_id,
            payload: ['conflict' => $kayit->conflict_code],
        );
    }

    /** @return array<string, array> çakışma kodu => istisna kaydı */
    private function activeExceptions(User $kullanici): array
    {
        $bugun = AppTime::today()->toDateString();

        return DB::table('accounting_duty_exceptions')
            ->where('user_id', $kullanici->id)
            ->whereDate('valid_from', '<=', $bugun)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhereDate('valid_to', '>=', $bugun))
            ->get()
            ->mapWithKeys(fn ($s) => [$s->conflict_code => [
                'id'         => $s->id,
                'reason'     => $s->reason,
                'valid_from' => $s->valid_from,
                'valid_to'   => $s->valid_to,
            ]])
            ->all();
    }
}
