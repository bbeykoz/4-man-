<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\AccountType;
use App\Enums\Accounting\NormalBalance;
use App\Models\Accounting\ChartAccount;
use App\Models\Company;
use App\Support\CountryPack;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Hesap planı kurulum ve bakım işlemleri.
 *
 * Ülke paketi bir şablon adı verir (bg_national, tr_tdhp); şablon
 * config/accounting/ altında durur. Şablon dayatma değil başlangıç noktasıdır:
 * şirket kurduktan sonra planı serbestçe düzenler.
 */
class ChartOfAccountsService
{
    public function __construct(private readonly AuditService $audit) {}

    /**
     * Şirkete ülke paketinin hesap planı şablonunu kurar.
     *
     * Var olan kodlara dokunmaz; şablon sonradan genişlerse eksikler eklenir.
     *
     * @return int Eklenen hesap sayısı.
     */
    public function installTemplate(Company $company, ?string $sablon = null): int
    {
        $sablon ??= CountryPack::forCompany($company)['chart_template'];
        $satirlar = $this->loadTemplate($sablon);

        $mevcut = ChartAccount::withTrashed()
            ->where('company_id', $company->id)
            ->pluck('code')
            ->flip();

        $eklenen = 0;

        DB::transaction(function () use ($company, $satirlar, $sablon, $mevcut, &$eklenen) {
            foreach ($satirlar as $satir) {
                if ($mevcut->has($satir['code'])) {
                    continue;
                }

                $tur = AccountType::from($satir['type']);

                ChartAccount::create([
                    'company_id'          => $company->id,
                    'code'                => $satir['code'],
                    'name'                => $satir['name'],
                    'name_local'          => $satir['name_local'] ?? null,
                    'account_type'        => $tur->value,
                    // Şablon açıkça belirtmediyse tür kendi olağan yönünü verir.
                    // Birikmiş amortisman gibi kontra hesaplar açıkça ters yazılır.
                    'normal_balance'      => $satir['normal_balance'] ?? $tur->normalBalance()->value,
                    'is_control'          => $satir['control'] ?? false,
                    'requires_partner'    => $satir['partner'] ?? false,
                    'required_dimensions' => $satir['dimensions'] ?? [],
                    'is_active'           => true,
                    'template_key'        => $sablon,
                ]);

                $eklenen++;
            }
        });

        if ($eklenen > 0) {
            $this->audit->log(
                companyId: $company->id, action: 'chart.template_installed',
                entityType: 'ChartAccount',
                payload: ['template' => $sablon, 'created' => $eklenen],
            );
        }

        return $eklenen;
    }

    /** Hesap oluşturur; kod çakışmasını ve tür/yön tutarlılığını kontrol eder. */
    public function create(Company $company, array $data): ChartAccount
    {
        $this->assertCodeFree($company->id, $data['code']);

        $tur = AccountType::from($data['account_type']);

        $hesap = ChartAccount::create([
            'company_id'          => $company->id,
            'code'                => $data['code'],
            'name'                => $data['name'],
            'name_local'          => $data['name_local'] ?? null,
            'account_type'        => $tur->value,
            'normal_balance'      => $data['normal_balance'] ?? $tur->normalBalance()->value,
            'parent_id'           => $data['parent_id'] ?? null,
            'is_control'          => $data['is_control'] ?? false,
            'requires_partner'    => $data['requires_partner'] ?? false,
            'required_dimensions' => $data['required_dimensions'] ?? [],
            'active_from'         => $data['active_from'] ?? null,
            'active_to'           => $data['active_to'] ?? null,
            'is_active'           => $data['is_active'] ?? true,
            'description'         => $data['description'] ?? null,
        ]);

        $this->audit->logModel($hesap, 'chart.account_created', ['code' => $hesap->code]);

        return $hesap;
    }

    /**
     * Hesabı günceller.
     *
     * Kullanımdaki hesabın türü ve yönü değiştirilemez: geçmiş fişlerin anlamı
     * değişir, mizan geriye dönük bozulur.
     */
    public function update(ChartAccount $hesap, array $data): ChartAccount
    {
        $kullanimda = $hesap->isUsed();

        if ($kullanimda) {
            foreach (['account_type', 'normal_balance', 'code'] as $alan) {
                if (isset($data[$alan]) && $data[$alan] !== ($hesap->{$alan} instanceof \BackedEnum ? $hesap->{$alan}->value : $hesap->{$alan})) {
                    throw ValidationException::withMessages([
                        $alan => "{$hesap->displayName()} hesabı fişlerde kullanılmış; kod, tür ve bakiye yönü değiştirilemez. Hesabı kapatıp yenisini açın.",
                    ]);
                }
            }
        }

        if (isset($data['code']) && $data['code'] !== $hesap->code) {
            $this->assertCodeFree($hesap->company_id, $data['code'], $hesap->id);
        }

        $oncekiler = $hesap->only(['code', 'name', 'is_active', 'is_control']);

        $hesap->update(array_intersect_key($data, array_flip([
            'code', 'name', 'name_local', 'account_type', 'normal_balance', 'parent_id',
            'is_control', 'requires_partner', 'required_dimensions',
            'active_from', 'active_to', 'is_active', 'description',
        ])));

        $this->audit->logModel($hesap, 'chart.account_updated', ['before' => $oncekiler, 'after' => $hesap->only(array_keys($oncekiler))]);

        return $hesap->fresh();
    }

    /**
     * Hesabı siler.
     *
     * Fişte kullanılmışsa silinmez — kapatılır (is_active=false, active_to).
     * Geçmiş kayıtların hesabı kaybolursa defter okunamaz hale gelir.
     */
    public function delete(ChartAccount $hesap): void
    {
        if ($hesap->isUsed()) {
            throw ValidationException::withMessages([
                'account' => "{$hesap->displayName()} hesabı fişlerde kullanılmış; silinemez. Kapatmak için pasife alın.",
            ]);
        }

        if ($hesap->children()->exists()) {
            throw ValidationException::withMessages([
                'account' => "{$hesap->displayName()} hesabının alt hesapları var; önce onları taşıyın.",
            ]);
        }

        $this->audit->logModel($hesap, 'chart.account_deleted', ['code' => $hesap->code]);
        $hesap->delete();
    }

    /** Hesabı belirtilen tarihten sonra kullanıma kapatır. */
    public function deactivate(ChartAccount $hesap, ?string $tarih = null): ChartAccount
    {
        $hesap->update([
            'is_active'   => false,
            'active_to'   => $tarih ?? now()->toDateString(),
        ]);

        $this->audit->logModel($hesap, 'chart.account_deactivated', ['code' => $hesap->code, 'active_to' => $hesap->active_to?->toDateString()]);

        return $hesap->fresh();
    }

    /** Hesap planını ağaç olarak döndürür. */
    public function tree(string $companyId): array
    {
        $hesaplar = ChartAccount::where('company_id', $companyId)
            ->orderBy('code')
            ->get();

        $cocuklar = $hesaplar->groupBy('parent_id');

        $dal = function (?string $ustId) use (&$dal, $cocuklar): array {
            return $cocuklar->get($ustId, collect())->map(fn (ChartAccount $h) => [
                'id'             => $h->id,
                'code'           => $h->code,
                'name'           => $h->name,
                'name_local'     => $h->name_local,
                'account_type'   => $h->account_type->value,
                'type_label'     => $h->account_type->label(),
                'normal_balance' => $h->normal_balance->value,
                'is_control'     => $h->is_control,
                'is_active'      => $h->is_active,
                'children'       => $dal($h->id),
            ])->values()->all();
        };

        return $dal(null);
    }

    private function loadTemplate(string $sablon): array
    {
        $yol = config_path("accounting/chart_{$sablon}.php");

        if (! is_file($yol)) {
            throw ValidationException::withMessages([
                'template' => "Hesap planı şablonu bulunamadı: $sablon",
            ]);
        }

        return require $yol;
    }

    private function assertCodeFree(string $companyId, string $kod, ?string $haricId = null): void
    {
        $var = ChartAccount::withTrashed()
            ->where('company_id', $companyId)
            ->where('code', $kod)
            ->when($haricId, fn ($q) => $q->whereKeyNot($haricId))
            ->exists();

        if ($var) {
            throw ValidationException::withMessages([
                'code' => "$kod kodu bu şirkette zaten kullanılıyor.",
            ]);
        }
    }
}
