<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\TaxTreatment;
use App\Models\Accounting\TaxCode;
use App\Models\Company;
use Illuminate\Validation\ValidationException;

/**
 * Vergi hesaplama motoru.
 *
 * İki işi var: işleme uyan vergi kodunu bulmak ve matrah/vergi/toplam
 * üçlüsünü hesaplamak. Oranı kendisi bilmez; her zaman tarihli bir vergi
 * kodundan okur.
 *
 * Yuvarlama: hesap tam hassasiyetle yapılır, sonuç bir kez yuvarlanır.
 * Önce yuvarlayıp sonra çarpmak kuruş farkı biriktirir — depo tarafında aynı
 * hatayı (1000/14 × 14 = 451 yerine 450) daha önce düzeltmiştik.
 */
class TaxEngine
{
    /** Para tutarlarının hane sayısı. Defter 6 hane tutar, para 2 hanede yuvarlanır. */
    private const KURUS = 2;

    /**
     * İşleme uyan vergi kodunu bulur.
     *
     * @param  string       $tarih      Vergi tarihi (belge tarihi değil).
     * @param  string|null  $kod        Açıkça istenen kod.
     * @param  string|null  $treatment  Kod verilmediyse niteliğe göre varsayılan.
     * @param  string       $yon        sale | purchase
     */
    public function resolve(
        Company $company,
        string $tarih,
        ?string $kod = null,
        ?string $treatment = null,
        string $yon = 'sale',
        bool $onayliOlsun = true,
    ): TaxCode {
        $sorgu = TaxCode::where('company_id', $company->id)
            ->effectiveOn($tarih)
            ->forDirection($yon)
            ->when($onayliOlsun, fn ($q) => $q->approved());

        if ($kod !== null) {
            $bulunan = (clone $sorgu)->where('code', $kod)->first();

            if (! $bulunan) {
                // Kod var ama o tarihte geçerli değilse sebebini söyle;
                // "bulunamadı" demek kullanıcıyı yanlış yere bakmaya iter.
                $herhangi = TaxCode::where('company_id', $company->id)->where('code', $kod)->first();

                throw ValidationException::withMessages(['tax_code' => $herhangi
                    ? "$kod vergi kodu $tarih tarihinde geçerli değil ya da onaylanmamış."
                    : "$kod diye bir vergi kodu tanımlı değil."]);
            }

            return $bulunan;
        }

        if ($treatment !== null) {
            $bulunan = (clone $sorgu)->where('treatment', $treatment)
                ->orderByDesc('is_default')
                ->first();

            if (! $bulunan) {
                throw ValidationException::withMessages([
                    'tax_code' => TaxTreatment::from($treatment)->label() . " için $tarih tarihinde geçerli vergi kodu yok.",
                ]);
            }

            return $bulunan;
        }

        $varsayilan = (clone $sorgu)->where('is_default', true)->first();

        if (! $varsayilan) {
            throw ValidationException::withMessages([
                'tax_code' => "$tarih tarihi için varsayılan vergi kodu tanımlı değil.",
            ]);
        }

        return $varsayilan;
    }

    /**
     * Matrah, vergi ve toplamı hesaplar.
     *
     * @param  float  $tutar        KDV hariç ya da dahil tutar.
     * @param  bool   $vergiDahil   Tutar KDV içeriyor mu.
     * @return array{base: float, tax: float, gross: float, deductible: float, non_deductible: float, rate: float, treatment: string, seller_charges: bool, self_assessed: bool}
     */
    public function calculate(TaxCode $kod, float $tutar, bool $vergiDahil = false): array
    {
        $oran = (float) $kod->rate;

        if ($vergiDahil) {
            // Brütten matrahı ayır. Bölme tam hassasiyetle, yuvarlama sonda.
            $matrah = $oran == 0.0 ? $tutar : $tutar / (1 + $oran / 100);
            $matrah = round($matrah, self::KURUS);
            $vergi  = round($tutar - $matrah, self::KURUS);
            $brut   = round($tutar, self::KURUS);
        } else {
            $matrah = round($tutar, self::KURUS);
            $vergi  = round($tutar * $oran / 100, self::KURUS);
            $brut   = round($matrah + $vergi, self::KURUS);
        }

        // Tevkifat, AB içi teslim, ihracat: satıcı vergi hesaplamaz. Matrah
        // beyana girer ama belgede vergi tutarı sıfırdır.
        if (! $kod->treatment->sellerCharges()) {
            $vergi = 0.0;
            $brut  = $matrah;
        }

        // Kısmi indirim: indirilebilen kısım yuvarlanır, kalanı farktan
        // türetilir. İkisini ayrı yuvarlarsak toplam vergiyi tutturamayız.
        $indirilebilir = round($vergi * (float) $kod->deductible_rate / 100, self::KURUS);
        $indirilemez   = round($vergi - $indirilebilir, self::KURUS);

        return [
            'tax_code_id'    => $kod->id,
            'code'           => $kod->code,
            'rate'           => $oran,
            'treatment'      => $kod->treatment->value,
            'base'           => $matrah,
            'tax'            => $vergi,
            'gross'          => $brut,
            'deductible'     => $indirilebilir,
            'non_deductible' => $indirilemez,
            'seller_charges' => $kod->treatment->sellerCharges(),
            'self_assessed'  => $kod->treatment->isSelfAssessed(),
            'eu_reportable'  => $kod->eu_reportable || $kod->treatment->isEuReportable(),
            'report_box'     => $kod->report_box,
        ];
    }

    /**
     * Belge satırlarının vergisini topluca hesaplar.
     *
     * Vergi satır bazında yuvarlanır, sonra toplanır. Belge toplamından tek
     * seferde hesaplamak farklı sonuç verir ve satır toplamıyla tutmaz.
     */
    public function calculateLines(Company $company, string $tarih, array $satirlar, string $yon = 'sale'): array
    {
        $sonuc  = [];
        $toplam = ['base' => 0.0, 'tax' => 0.0, 'gross' => 0.0, 'deductible' => 0.0, 'non_deductible' => 0.0];
        $kutular = [];

        foreach ($satirlar as $i => $satir) {
            $kod = $this->resolve(
                company:   $company,
                tarih:     $tarih,
                kod:       $satir['tax_code'] ?? null,
                treatment: $satir['treatment'] ?? null,
                yon:       $yon,
            );

            $hesap = $this->calculate($kod, (float) $satir['amount'], (bool) ($satir['tax_included'] ?? false));
            $hesap['line_no'] = $satir['line_no'] ?? $i + 1;

            foreach (array_keys($toplam) as $k) {
                $toplam[$k] += $hesap[$k];
            }

            if ($kod->affects_vat_return && $kod->report_box) {
                $kutular[$kod->report_box]['base'] = ($kutular[$kod->report_box]['base'] ?? 0) + $hesap['base'];
                $kutular[$kod->report_box]['tax']  = ($kutular[$kod->report_box]['tax']  ?? 0) + $hesap['tax'];
            }

            $sonuc[] = $hesap;
        }

        return [
            'lines'       => $sonuc,
            'totals'      => array_map(fn ($v) => round($v, self::KURUS), $toplam),
            'report_boxes'=> array_map(fn ($k) => array_map(fn ($v) => round($v, self::KURUS), $k), $kutular),
        ];
    }

    /**
     * Tevkifat / AB içi alım için çift taraflı fiş satırları.
     *
     * Vergi hem hesaplanan hem indirilecek olarak yazılır; net etki sıfırdır
     * ama beyanın iki kutusunda da görünmesi gerekir.
     *
     * @return array<int, array{account_id: string, debit: float, credit: float, description: string}>
     */
    public function selfAssessmentLines(TaxCode $kod, float $vergi, string $aciklama): array
    {
        if ($vergi <= 0 || ! $kod->treatment->isSelfAssessed()) {
            return [];
        }

        if (! $kod->output_account_id || ! $kod->input_account_id) {
            throw ValidationException::withMessages([
                'tax_code' => "{$kod->code} kodu tevkifat kaydı üretiyor ama hesaplanan/indirilecek KDV hesapları eşlenmemiş.",
            ]);
        }

        $indirilebilir = round($vergi * (float) $kod->deductible_rate / 100, self::KURUS);

        $satirlar = [
            ['account_id' => $kod->output_account_id, 'debit' => 0.0, 'credit' => $vergi,
             'description' => "$aciklama — hesaplanan KDV ({$kod->code})"],
        ];

        if ($indirilebilir > 0) {
            $satirlar[] = ['account_id' => $kod->input_account_id, 'debit' => $indirilebilir, 'credit' => 0.0,
                           'description' => "$aciklama — indirilecek KDV ({$kod->code})"];
        }

        $indirilemez = round($vergi - $indirilebilir, self::KURUS);
        if ($indirilemez > 0) {
            if (! $kod->expense_account_id) {
                throw ValidationException::withMessages([
                    'tax_code' => "{$kod->code} kodunda indirilemeyen KDV var ama gider hesabı eşlenmemiş.",
                ]);
            }
            $satirlar[] = ['account_id' => $kod->expense_account_id, 'debit' => $indirilemez, 'credit' => 0.0,
                           'description' => "$aciklama — indirilemeyen KDV ({$kod->code})"];
        }

        return $satirlar;
    }
}
