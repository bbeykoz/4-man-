<?php

namespace App\Services\Accounting;

use App\Models\Accounting\ChartAccount;
use App\Models\Company;
use App\Support\AccountRole;
use App\Support\CountryPack;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Hesap rolü eşlemesi.
 *
 * Belge ve entegrasyon kodu hesap numarası bilmez; rol ister. Böylece şirket
 * hesap planını değiştirdiğinde tek yerden güncelleniyor ve ülke eklemek
 * yalnız eşleme eklemek oluyor.
 */
class AccountRoleService
{
    /** İstek içinde tekrar tekrar sorulmasın diye şirket bazlı önbellek. */
    private array $onbellek = [];

    public function __construct(private readonly AuditService $audit) {}

    /**
     * Ülke paketindeki varsayılan eşlemeyi kurar.
     * Hesap planında karşılığı olmayan roller atlanır ve raporlanır.
     *
     * @return array{mapped: int, missing: array<string, string>}
     */
    public function installDefaults(Company $company): array
    {
        $esleme  = CountryPack::forCompany($company)['account_roles'] ?? [];
        $kodlar  = ChartAccount::where('company_id', $company->id)->pluck('id', 'code');

        $kurulan = 0;
        $eksik   = [];

        DB::transaction(function () use ($company, $esleme, $kodlar, &$kurulan, &$eksik) {
            foreach ($esleme as $rol => $kod) {
                $hesapId = $kodlar->get($kod);

                if (! $hesapId) {
                    $eksik[$rol] = $kod;
                    continue;
                }

                DB::table('accounting_account_roles')->updateOrInsert(
                    ['company_id' => $company->id, 'role' => $rol],
                    ['id' => (string) Str::uuid(), 'account_id' => $hesapId,
                     'note' => 'Ülke paketinden kuruldu', 'created_at' => now(), 'updated_at' => now()],
                );

                $kurulan++;
            }
        });

        $this->onbellek[$company->id] = null;

        if ($kurulan > 0) {
            $this->audit->log(
                companyId: $company->id, action: 'account_roles.installed',
                entityType: 'AccountRole', payload: ['mapped' => $kurulan, 'missing' => $eksik],
            );
        }

        return ['mapped' => $kurulan, 'missing' => $eksik];
    }

    /** Rolün hesabı; eşlenmemişse anlaşılır hata. */
    public function accountId(Company $company, string $rol): string
    {
        $id = $this->map($company)[$rol] ?? null;

        if (! $id) {
            throw ValidationException::withMessages([
                'account_role' => sprintf(
                    '"%s" rolü için hesap eşlenmemiş. Muhasebe ayarlarından bu rolü bir hesaba bağlayın.',
                    AccountRole::label($rol),
                ),
            ]);
        }

        return $id;
    }

    /** Rolün hesabı; yoksa null. Zorunlu olmayan roller için. */
    public function accountIdOrNull(Company $company, string $rol): ?string
    {
        return $this->map($company)[$rol] ?? null;
    }

    /** @return array<string, string> rol => hesap id */
    public function map(Company $company): array
    {
        return $this->onbellek[$company->id] ??= DB::table('accounting_account_roles')
            ->where('company_id', $company->id)
            ->pluck('account_id', 'role')
            ->all();
    }

    /** Tek rolü elle bağlar. */
    public function set(Company $company, string $rol, string $hesapId): void
    {
        if (! in_array($rol, AccountRole::all(), true)) {
            throw ValidationException::withMessages(['role' => "Tanımsız hesap rolü: $rol"]);
        }

        $hesap = ChartAccount::where('company_id', $company->id)->find($hesapId);

        if (! $hesap) {
            throw ValidationException::withMessages(['account_id' => 'Hesap bu şirkette bulunamadı.']);
        }

        DB::table('accounting_account_roles')->updateOrInsert(
            ['company_id' => $company->id, 'role' => $rol],
            ['id' => (string) Str::uuid(), 'account_id' => $hesapId, 'updated_at' => now(), 'created_at' => now()],
        );

        $this->onbellek[$company->id] = null;

        $this->audit->log(
            companyId: $company->id, action: 'account_roles.changed',
            entityType: 'AccountRole', payload: ['role' => $rol, 'account_code' => $hesap->code],
        );
    }

    /** Eşleme listesi; arayüz ve kurulum kontrolü için. */
    public function listing(Company $company): array
    {
        $esleme  = $this->map($company);
        $hesaplar = ChartAccount::whereIn('id', array_values($esleme))->get()->keyBy('id');

        return array_map(function (string $rol) use ($esleme, $hesaplar) {
            $hesapId = $esleme[$rol] ?? null;
            $hesap   = $hesapId ? $hesaplar->get($hesapId) : null;

            return [
                'role'         => $rol,
                'label'        => AccountRole::label($rol),
                'account_id'   => $hesapId,
                'account_code' => $hesap?->code,
                'account_name' => $hesap?->name,
                'required'     => in_array($rol, AccountRole::requiredForDocuments(), true),
                'mapped'       => $hesapId !== null,
            ];
        }, AccountRole::all());
    }

    /** Belge kesmeye hazır mı; eksik zorunlu roller döner. */
    public function missingRequired(Company $company): array
    {
        $esleme = $this->map($company);

        return array_values(array_filter(
            AccountRole::requiredForDocuments(),
            fn (string $rol) => ! isset($esleme[$rol]),
        ));
    }
}
