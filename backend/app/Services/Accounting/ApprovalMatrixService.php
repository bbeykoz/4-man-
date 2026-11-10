<?php

namespace App\Services\Accounting;

use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Onay matrisi: tutara göre kaç kişinin onaylaması gerektiği.
 *
 * Doküman §10'daki "ödeme onay matrisi: tutar eşiği, hazırlayan/onaylayan
 * ayrımı, çift imza" kuralı. Eşikler şirket bazında yapılandırılıyor;
 * kurulumda ülke bağımsız varsayılanlar geliyor.
 *
 * Onaylar ayrı tabloda tutuluyor çünkü "iki farklı kişi onayladı mı" sorusu
 * sorgulanabilir olmalı; denetim kaydında aramak yeterli değil.
 */
class ApprovalMatrixService
{
    public function __construct(
        private readonly SegregationOfDutyService $sod,
        private readonly AuditService $audit,
    ) {}

    /** Varsayılan onay kurallarını kurar. */
    public function installDefaults(Company $company): int
    {
        $cfg = require config_path('accounting/permissions.php');
        $eklenen = 0;

        foreach ($cfg['approval_rules'] ?? [] as $kural) {
            $varMi = DB::table('accounting_approval_rules')
                ->where('company_id', $company->id)
                ->where('action', $kural['action'])
                ->where('min_amount', $kural['min_amount'])
                ->exists();

            if ($varMi) {
                continue;
            }

            DB::table('accounting_approval_rules')->insert([
                'id'                  => (string) Str::uuid(),
                'company_id'          => $company->id,
                'action'              => $kural['action'],
                'min_amount'          => $kural['min_amount'],
                'max_amount'          => $kural['max_amount'],
                'required_approvals'  => $kural['required_approvals'],
                'approver_role_ids'   => json_encode($kural['approver_role_ids'] ?? []),
                'required_permission' => $kural['required_permission'] ?? null,
                'is_active'           => true,
                'note'                => $kural['note'] ?? null,
                'created_at'          => now(),
                'updated_at'          => now(),
            ]);

            $eklenen++;
        }

        if ($eklenen > 0) {
            $this->audit->log(
                companyId: $company->id, action: 'approval_rules.installed',
                entityType: 'ApprovalRule', payload: ['created' => $eklenen],
            );
        }

        return $eklenen;
    }

    /**
     * Eylem ve tutar için geçerli kural.
     *
     * Aralıklar örtüşmeyecek şekilde tanımlanmalı; birden fazla eşleşirse
     * en dar aralık kazanır.
     */
    public function ruleFor(Company $company, string $eylem, float $tutar): ?object
    {
        return DB::table('accounting_approval_rules')
            ->where('company_id', $company->id)
            ->where('action', $eylem)
            ->where('is_active', true)
            ->where('min_amount', '<=', $tutar)
            ->where(fn ($q) => $q->whereNull('max_amount')->orWhere('max_amount', '>', $tutar))
            ->orderByDesc('min_amount')
            ->first();
    }

    /**
     * Kayıt bu eylem için yeterli onay topladı mı.
     *
     * @return array{required: int, collected: int, satisfied: bool, approvers: array, rule: ?object}
     */
    public function status(Company $company, string $eylem, Model $kayit, float $tutar): array
    {
        $kural = $this->ruleFor($company, $eylem, $tutar);
        $gereken = (int) ($kural->required_approvals ?? 0);

        $onaylar = DB::table('accounting_approvals as a')
            ->join('users as u', 'u.id', '=', 'a.user_id')
            ->where('a.entity_type', class_basename($kayit))
            ->where('a.entity_id', $kayit->getKey())
            ->where('a.action', $eylem)
            ->get(['a.user_id', 'u.name', 'a.approved_at', 'a.note']);

        return [
            'action'    => $eylem,
            'amount'    => round($tutar, 2),
            'required'  => $gereken,
            'collected' => $onaylar->count(),
            'satisfied' => $onaylar->count() >= $gereken,
            'approvers' => $onaylar->map(fn ($o) => [
                'user_id'     => $o->user_id,
                'name'        => $o->name,
                'approved_at' => $o->approved_at,
                'note'        => $o->note,
            ])->all(),
            'rule'      => $kural ? [
                'min_amount'          => round((float) $kural->min_amount, 2),
                'max_amount'          => $kural->max_amount === null ? null : round((float) $kural->max_amount, 2),
                'required_approvals'  => $gereken,
                'required_permission' => $kural->required_permission,
                'note'                => $kural->note,
            ] : null,
        ];
    }

    /**
     * Onay kaydeder.
     *
     * Aynı kişi ikinci kez onaylayamaz (benzersiz kısıt) ve hazırlayan
     * kendi kaydını onaylayamaz.
     */
    public function approve(Company $company, string $eylem, Model $kayit, float $tutar, User $kullanici, ?string $hazirlayan = null, ?string $not = null): array
    {
        $kural = $this->ruleFor($company, $eylem, $tutar);

        if ($kural?->required_permission && ! $kullanici->hasPermission($kural->required_permission)) {
            throw ValidationException::withMessages([
                'approve' => "Bu onay için '{$kural->required_permission}' izni gerekiyor.",
            ]);
        }

        // Hazırlayan onaylayamaz; çakışma koduna göre istisna uygulanabilir.
        if ($hazirlayan !== null) {
            $kod = str_starts_with($eylem, 'payment') ? 'PREPARE_APPROVE_PAYMENT' : 'PREPARE_APPROVE_JOURNAL';

            $this->sod->assertCanAct($kullanici, $kod, $hazirlayan,
                'Kendi hazırladığınız kaydı onaylayamazsınız. Görev ayrılığı gereği başka bir yetkili onaylamalı.');
        }

        $zaten = DB::table('accounting_approvals')
            ->where('entity_type', class_basename($kayit))
            ->where('entity_id', $kayit->getKey())
            ->where('action', $eylem)
            ->where('user_id', $kullanici->id)
            ->exists();

        if ($zaten) {
            throw ValidationException::withMessages([
                'approve' => 'Bu kaydı zaten onayladınız. Çift imza farklı kişi gerektirir.',
            ]);
        }

        DB::table('accounting_approvals')->insert([
            'id'          => (string) Str::uuid(),
            'company_id'  => $company->id,
            'entity_type' => class_basename($kayit),
            'entity_id'   => $kayit->getKey(),
            'action'      => $eylem,
            'user_id'     => $kullanici->id,
            'amount'      => $tutar,
            'note'        => $not,
            'approved_at' => now(),
        ]);

        $durum = $this->status($company, $eylem, $kayit, $tutar);

        $this->audit->log(
            companyId: $company->id,
            action:    'approval.recorded',
            entityType: class_basename($kayit),
            entityId:  $kayit->getKey(),
            payload:   ['action' => $eylem, 'amount' => $tutar,
                        'collected' => $durum['collected'], 'required' => $durum['required']],
            reason:    $not,
        );

        return $durum;
    }

    /**
     * Eylem yapılabilir mi; yetersizse anlaşılır hata.
     */
    public function assertSatisfied(Company $company, string $eylem, Model $kayit, float $tutar): void
    {
        $durum = $this->status($company, $eylem, $kayit, $tutar);

        if ($durum['satisfied']) {
            return;
        }

        throw ValidationException::withMessages([
            'approval' => sprintf(
                '%s tutarındaki işlem %d onay gerektiriyor, %d toplandı.%s',
                number_format($tutar, 2, ',', '.'),
                $durum['required'], $durum['collected'],
                $durum['rule']['note'] ?? '' ? ' ' . $durum['rule']['note'] : '',
            ),
        ]);
    }

    /** Şirketin onay matrisi. */
    public function matrix(Company $company): array
    {
        return DB::table('accounting_approval_rules')
            ->where('company_id', $company->id)
            ->orderBy('action')->orderBy('min_amount')
            ->get()
            ->map(fn ($k) => [
                'id'                  => $k->id,
                'action'              => $k->action,
                'min_amount'          => round((float) $k->min_amount, 2),
                'max_amount'          => $k->max_amount === null ? null : round((float) $k->max_amount, 2),
                'required_approvals'  => (int) $k->required_approvals,
                'required_permission' => $k->required_permission,
                'is_active'           => (bool) $k->is_active,
                'note'                => $k->note,
            ])->all();
    }

    public function upsertRule(Company $company, array $data, ?string $id = null): array
    {
        $alanlar = [
            'company_id'          => $company->id,
            'action'              => $data['action'],
            'min_amount'          => $data['min_amount'] ?? 0,
            'max_amount'          => $data['max_amount'] ?? null,
            'required_approvals'  => $data['required_approvals'] ?? 1,
            'approver_role_ids'   => json_encode($data['approver_role_ids'] ?? []),
            'required_permission' => $data['required_permission'] ?? null,
            'is_active'           => $data['is_active'] ?? true,
            'note'                => $data['note'] ?? null,
            'updated_at'          => now(),
        ];

        if ($id) {
            DB::table('accounting_approval_rules')->where('id', $id)->where('company_id', $company->id)->update($alanlar);
        } else {
            $id = (string) Str::uuid();
            DB::table('accounting_approval_rules')->insert($alanlar + ['id' => $id, 'created_at' => now()]);
        }

        $this->audit->log(
            companyId: $company->id, action: 'approval_rules.changed',
            entityType: 'ApprovalRule', entityId: $id, payload: $data,
        );

        return ['id' => $id] + $data;
    }

    public function deleteRule(Company $company, string $id): void
    {
        DB::table('accounting_approval_rules')->where('id', $id)->where('company_id', $company->id)->delete();

        $this->audit->log(
            companyId: $company->id, action: 'approval_rules.deleted',
            entityType: 'ApprovalRule', entityId: $id,
        );
    }
}
