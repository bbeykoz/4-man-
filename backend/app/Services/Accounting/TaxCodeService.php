<?php

namespace App\Services\Accounting;

use App\Models\Accounting\ChartAccount;
use App\Models\Accounting\TaxCode;
use App\Models\Company;
use App\Support\AppTime;
use App\Support\CountryPack;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Vergi kodu kurulum ve bakımı.
 *
 * Oran değişikliği "güncelleme" değildir: eski satır kapatılır, yeni satır
 * açılır. Güncelleme yapılsaydı geçmiş fişler yeni oranı gösterir ve beyanlar
 * geriye dönük bozulurdu.
 */
class TaxCodeService
{
    /** Ülke paketinin vergi kodlarını hangi hesaplara bağlayacağımız. */
    private const HESAP_ESLEMESI = [
        'BG' => ['output' => '453', 'input' => '454', 'expense' => '609'],
        'TR' => ['output' => '391', 'input' => '191', 'expense' => '689'],
    ];

    /** Beyan kutusu eşlemesi; kesin kutu numaraları danışman onayıyla düzeltilir. */
    private const BEYAN_KUTULARI = [
        'standard'       => 'BASE_STD',
        'reduced'        => 'BASE_RED',
        'reduced_low'    => 'BASE_RED_LOW',
        'zero'           => 'BASE_ZERO',
        'exempt'         => 'BASE_EXEMPT',
        'reverse_charge' => 'BASE_RC',
        'eu_supply'      => 'BASE_EU_SUPPLY',
        'eu_acquisition' => 'BASE_EU_ACQ',
        'import'         => 'BASE_IMPORT',
        'export'         => 'BASE_EXPORT',
    ];

    public function __construct(private readonly AuditService $audit) {}

    /**
     * Ülke paketinin vergi kodlarını kurar.
     *
     * Kodlar taslak gelir: canlıda kullanılmadan önce yerel danışman onayı
     * gerekir (doküman §6.3, "AI tek başına oran belirlememeli" ilkesinin
     * insan tarafı).
     *
     * @return int Eklenen kod sayısı.
     */
    public function installTemplate(Company $company, ?string $gecerlilikBaslangici = null): int
    {
        $pack  = CountryPack::forCompany($company);
        $ulke  = $pack['country_code'];
        $bas   = $gecerlilikBaslangici ?? $company->fiscalYearStart((int) AppTime::today()->format('Y'))->toDateString();

        $hesaplar = $this->resolveAccounts($company, $ulke);
        $eklenen  = 0;

        DB::transaction(function () use ($company, $pack, $ulke, $bas, $hesaplar, &$eklenen) {
            foreach ($pack['seed_tax_rates'] ?? [] as $satir) {
                $varMi = TaxCode::where('company_id', $company->id)
                    ->where('code', $satir['code'])
                    ->exists();

                if ($varMi) {
                    continue;
                }

                $treatment = $satir['treatment'];

                TaxCode::create([
                    'company_id'         => $company->id,
                    'country_code'       => $ulke,
                    'code'               => $satir['code'],
                    'name'               => $this->seedName($pack, $treatment, (float) $satir['rate']),
                    'tax_type'           => 'vat',
                    'treatment'          => $treatment,
                    'rate'               => $satir['rate'],
                    'direction'          => $this->seedDirection($treatment),
                    'deductible_rate'    => 100,
                    'output_account_id'  => $hesaplar['output'],
                    'input_account_id'   => $hesaplar['input'],
                    'expense_account_id' => $hesaplar['expense'],
                    'report_box'         => self::BEYAN_KUTULARI[$treatment] ?? null,
                    'eu_reportable'      => in_array($treatment, ['eu_supply', 'eu_acquisition', 'triangulation'], true),
                    'valid_from'         => $bas,
                    'approval_status'    => 'draft',
                    'is_default'         => $treatment === 'standard',
                    'description'        => 'Ülke paketi şablonundan kuruldu; oran ve kapsam yerel danışmanla doğrulanmalı.',
                ]);

                $eklenen++;
            }
        });

        if ($eklenen > 0) {
            $this->audit->log(
                companyId: $company->id, action: 'tax.template_installed',
                entityType: 'TaxCode', payload: ['country' => $ulke, 'created' => $eklenen, 'valid_from' => $bas],
            );
        }

        return $eklenen;
    }

    public function create(Company $company, array $data): TaxCode
    {
        $this->assertNoOverlap($company->id, $data['code'], $data['valid_from'], $data['valid_to'] ?? null);

        $kod = TaxCode::create([
            'company_id'   => $company->id,
            'country_code' => $data['country_code'] ?? $company->country_code,
            'approval_status' => 'draft',
        ] + $this->fillable($data));

        $this->audit->logModel($kod, 'tax.code_created', ['code' => $kod->code, 'rate' => (string) $kod->rate]);

        return $kod;
    }

    /**
     * Kodu günceller.
     *
     * Kullanımdaki bir kodun oranı ve niteliği değiştirilemez; bunun için
     * changeRate() kullanılır. Ad, açıklama ve hesap eşlemesi serbesttir.
     */
    public function update(TaxCode $kod, array $data): TaxCode
    {
        if ($this->isUsed($kod)) {
            foreach (['rate', 'treatment', 'code'] as $alan) {
                $yeni = $data[$alan] ?? null;
                $eski = $kod->{$alan} instanceof \BackedEnum ? $kod->{$alan}->value : $kod->{$alan};

                if ($yeni !== null && (string) $yeni !== (string) $eski) {
                    throw ValidationException::withMessages([
                        $alan => "{$kod->code} fişlerde kullanılmış; oran ve nitelik değiştirilemez. Yeni oran için 'oran değişikliği' kullanın.",
                    ]);
                }
            }
        }

        if (isset($data['valid_from']) || array_key_exists('valid_to', $data)) {
            $this->assertNoOverlap(
                $kod->company_id,
                $data['code'] ?? $kod->code,
                $data['valid_from'] ?? $kod->valid_from->toDateString(),
                array_key_exists('valid_to', $data) ? $data['valid_to'] : $kod->valid_to?->toDateString(),
                $kod->id,
            );
        }

        $kod->update($this->fillable($data));
        $this->audit->logModel($kod, 'tax.code_updated', ['code' => $kod->code]);

        return $kod->fresh();
    }

    /**
     * Oran değişikliği: eski satırı kapatır, yeni satırı açar.
     *
     * Mevzuat değişince doğru yol budur. Geçmiş fişler eski satırı,
     * yeni fişler yeni satırı görür.
     */
    public function changeRate(TaxCode $kod, float $yeniOran, string $gecerliTarih, ?string $dayanak = null): TaxCode
    {
        if ($gecerliTarih <= $kod->valid_from->toDateString()) {
            throw ValidationException::withMessages([
                'valid_from' => 'Yeni oranın geçerlilik tarihi mevcut kaydın başlangıcından sonra olmalı.',
            ]);
        }

        return DB::transaction(function () use ($kod, $yeniOran, $gecerliTarih, $dayanak) {
            $eskiOran = (float) $kod->rate;

            // Eski satır yeni oranın başladığı günden bir gün önce biter.
            $kod->update([
                'valid_to' => \Illuminate\Support\Carbon::parse($gecerliTarih)->subDay()->toDateString(),
            ]);

            $yeni = TaxCode::create([
                'company_id'         => $kod->company_id,
                'country_code'       => $kod->country_code,
                'code'               => $kod->code,
                'name'               => $kod->name,
                'name_local'         => $kod->name_local,
                'tax_type'           => $kod->tax_type,
                'treatment'          => $kod->treatment->value,
                'rate'               => $yeniOran,
                'direction'          => $kod->direction,
                'deductible_rate'    => $kod->deductible_rate,
                'output_account_id'  => $kod->output_account_id,
                'input_account_id'   => $kod->input_account_id,
                'expense_account_id' => $kod->expense_account_id,
                'report_box'         => $kod->report_box,
                'saft_code'          => $kod->saft_code,
                'eu_reportable'      => $kod->eu_reportable,
                'affects_vat_return' => $kod->affects_vat_return,
                'valid_from'         => $gecerliTarih,
                'legal_reference'    => $dayanak ?? $kod->legal_reference,
                'approval_status'    => 'draft',   // yeni oran da onay ister
                'is_default'         => $kod->is_default,
            ]);

            $this->audit->log(
                companyId: $kod->company_id, action: 'tax.rate_changed',
                entityType: 'TaxCode', entityId: $yeni->id,
                payload: ['code' => $kod->code, 'old_rate' => $eskiOran, 'new_rate' => $yeniOran,
                          'effective_from' => $gecerliTarih, 'legal_reference' => $dayanak],
            );

            return $yeni;
        });
    }

    /** Danışman onayı; onaysız kod fişte kullanılamaz. */
    public function approve(TaxCode $kod): TaxCode
    {
        $kod->update([
            'approval_status' => 'approved',
            'approved_by'     => auth()->id(),
            'approved_at'     => now(),
        ]);

        $this->audit->logModel($kod, 'tax.code_approved', ['code' => $kod->code, 'rate' => (string) $kod->rate]);

        return $kod->fresh();
    }

    public function delete(TaxCode $kod): void
    {
        if ($this->isUsed($kod)) {
            throw ValidationException::withMessages([
                'tax_code' => "{$kod->code} fişlerde kullanılmış; silinemez. Geçerlilik tarihini kapatın.",
            ]);
        }

        $this->audit->logModel($kod, 'tax.code_deleted', ['code' => $kod->code]);
        $kod->delete();
    }

    /** Fiş satırlarında kullanılmış mı. */
    public function isUsed(TaxCode $kod): bool
    {
        return DB::table('journal_lines')->where('tax_code_id', $kod->id)->exists();
    }

    /** Aynı kodun geçerlilik aralıkları çakışıyor mu. */
    private function assertNoOverlap(string $companyId, string $kod, string $bas, ?string $bit, ?string $haricId = null): void
    {
        $cakisan = TaxCode::where('company_id', $companyId)
            ->where('code', $kod)
            ->when($haricId, fn ($q) => $q->whereKeyNot($haricId))
            // Aralıklar çakışır: A.başlangıç <= B.bitiş VE B.başlangıç <= A.bitiş
            ->where('valid_from', '<=', $bit ?? '9999-12-31')
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $bas))
            ->first();

        if ($cakisan) {
            $aralik = $cakisan->valid_from->format('d.m.Y') . ' – ' . ($cakisan->valid_to?->format('d.m.Y') ?? 'açık');
            throw ValidationException::withMessages([
                'valid_from' => "$kod kodunun $aralik aralığıyla çakışıyor. Önce eski kaydı kapatın.",
            ]);
        }
    }

    /** Vergi hesaplarını şirketin planından bulur; yoksa null bırakır. */
    private function resolveAccounts(Company $company, string $ulke): array
    {
        $esleme = self::HESAP_ESLEMESI[$ulke] ?? [];

        $bul = function (?string $kod) use ($company) {
            return $kod === null ? null : ChartAccount::where('company_id', $company->id)
                ->where('code', $kod)->value('id');
        };

        return [
            'output'  => $bul($esleme['output']  ?? null),
            'input'   => $bul($esleme['input']   ?? null),
            'expense' => $bul($esleme['expense'] ?? null),
        ];
    }

    private function seedName(array $pack, string $treatment, float $oran): string
    {
        $etiket = \App\Enums\Accounting\TaxTreatment::from($treatment)->label();
        $vergi  = $pack['vat_term'] ?? 'KDV';

        return $oran > 0
            ? sprintf('%s %%%s — %s', $vergi, rtrim(rtrim(number_format($oran, 2, ',', ''), '0'), ','), $etiket)
            : "$vergi — $etiket";
    }

    /** Satış/alış yönü; AB içi alım ve ithalat yalnız alış tarafında anlamlı. */
    private function seedDirection(string $treatment): string
    {
        return match ($treatment) {
            'eu_acquisition', 'import' => 'purchase',
            'eu_supply', 'export'      => 'sale',
            default                    => 'both',
        };
    }

    private function fillable(array $data): array
    {
        return array_intersect_key($data, array_flip([
            'code', 'name', 'name_local', 'tax_type', 'treatment', 'rate', 'direction',
            'deductible_rate', 'output_account_id', 'input_account_id', 'expense_account_id',
            'report_box', 'saft_code', 'eu_reportable', 'affects_vat_return',
            'valid_from', 'valid_to', 'legal_reference', 'is_default', 'description',
        ]));
    }
}
