<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\DocumentType;
use App\Models\Accounting\Document;
use App\Models\Accounting\DocumentLine;
use App\Models\Company;
use App\Support\AccountRole;
use Illuminate\Validation\ValidationException;

/**
 * Belgeyi muhasebe fişine çevirir.
 *
 * Kural tek cümleyle: karşı taraf hesabı brüt tutarla, gelir/gider hesapları
 * net tutarla, KDV hesapları vergi tutarıyla çalışır. İade belgelerinde her
 * şey ters yöne yazılır — ayrı hesap eşlemesi tutmak yerine işaret çevriliyor.
 *
 * Hesap numaraları burada geçmez; her hesap rolünden çözülür
 * (AccountRoleService), böylece şirket kendi planını kullanabiliyor.
 */
class DocumentPostingService
{
    public function __construct(
        private readonly AccountRoleService $roles,
    ) {}

    /**
     * Belgeden fiş satırlarını üretir.
     *
     * @return array<int, array<string, mixed>> JournalService'in beklediği satır dizisi.
     */
    public function buildLines(Document $belge): array
    {
        $company = $belge->company;
        $yon     = $belge->doc_type->direction();
        $isaret  = $belge->doc_type->sign();

        $satirlar = $yon === 'sale'
            ? $this->salesLines($company, $belge, $isaret)
            : $this->purchaseLines($company, $belge, $isaret);

        // Kuruş farkı: satır toplamları ile belge brütü arasında yuvarlamadan
        // doğan sapma olursa fişi dengelemek için yuvarlama hesabına atılır.
        $satirlar = $this->balanceRounding($company, $satirlar, $belge);

        return array_values(array_filter($satirlar, fn ($s) => (float) $s['debit'] > 0 || (float) $s['credit'] > 0));
    }

    /**
     * Satış: müşteri borçlanır, gelir ve hesaplanan KDV alacaklanır.
     * Avans faturasında gelir yerine "alınan avanslar" kullanılır.
     */
    private function salesLines(Company $company, Document $belge, int $isaret): array
    {
        $satirlar = [];

        $karsiTarafRolu = $belge->doc_type->isAdvance()
            ? AccountRole::CUSTOMER_ADVANCE
            : AccountRole::AR_CONTROL;

        // Avans faturasında müşteri yine borçlanır; alacak tarafı avans hesabı.
        $musteriHesap = $this->roles->accountId($company, AccountRole::AR_CONTROL);
        $gelirVarsayilan = $belge->doc_type->isAdvance()
            ? $this->roles->accountId($company, AccountRole::CUSTOMER_ADVANCE)
            : $this->roles->accountId($company, AccountRole::DEFAULT_REVENUE);

        $brut = $this->fc($belge, (float) $belge->gross_amount) * $isaret;

        $satirlar[] = $this->line(
            $musteriHesap,
            borc: $brut,
            aciklama: $this->karsiTarafMetni($belge),
            belge: $belge,
            partnerId: $belge->partner_id,
            txnTutar: (float) $belge->gross_amount * $isaret,
        );

        $vergiToplam = 0.0;

        foreach ($belge->lines as $satir) {
            $hesap = $satir->account_id ?: $gelirVarsayilan;
            $net   = $this->fc($belge, (float) $satir->net_amount) * $isaret;

            $satirlar[] = $this->line(
                $hesap,
                alacak: $net,
                aciklama: $satir->description,
                belge: $belge,
                partnerId: $belge->partner_id,
                txnTutar: (float) $satir->net_amount * $isaret,
                vergiKodu: $satir->tax_code_id,
                vergiMatrahi: (float) $satir->net_amount * $isaret,
                vergiTutari: (float) $satir->tax_amount * $isaret,
                vergiOrani: (float) $satir->tax_rate,
                boyutlar: $satir->dimensions,
            );

            $vergiToplam += (float) $satir->tax_amount;
        }

        if ($vergiToplam > 0) {
            $satirlar[] = $this->line(
                $this->roles->accountId($company, AccountRole::OUTPUT_VAT),
                alacak: $this->fc($belge, $vergiToplam) * $isaret,
                aciklama: 'Hesaplanan KDV',
                belge: $belge,
                txnTutar: $vergiToplam * $isaret,
            );
        }

        unset($karsiTarafRolu);

        return $satirlar;
    }

    /**
     * Alış: gider/stok ve indirilecek KDV borçlanır, tedarikçi alacaklanır.
     * İndirilemeyen KDV gider tarafına yazılır.
     */
    private function purchaseLines(Company $company, Document $belge, int $isaret): array
    {
        $satirlar = [];

        $tedarikciHesap = $belge->doc_type->isAdvance()
            ? $this->roles->accountId($company, AccountRole::SUPPLIER_ADVANCE)
            : $this->roles->accountId($company, AccountRole::AP_CONTROL);

        $giderVarsayilan = $this->roles->accountId($company, AccountRole::DEFAULT_EXPENSE);

        $indirilebilir = 0.0;
        $indirilemez   = 0.0;
        $tevkifat      = 0.0;

        foreach ($belge->lines as $satir) {
            $hesap = $satir->account_id ?: $giderVarsayilan;
            $net   = $this->fc($belge, (float) $satir->net_amount) * $isaret;

            // İndirilemeyen KDV maliyete değil ayrı gider hesabına gidiyor;
            // stok maliyetine eklemek stok değerini bozardı.
            $satirlar[] = $this->line(
                $hesap,
                borc: $net,
                aciklama: $satir->description,
                belge: $belge,
                partnerId: $belge->partner_id,
                txnTutar: (float) $satir->net_amount * $isaret,
                vergiKodu: $satir->tax_code_id,
                vergiMatrahi: (float) $satir->net_amount * $isaret,
                vergiTutari: (float) $satir->tax_amount * $isaret,
                vergiOrani: (float) $satir->tax_rate,
                boyutlar: $satir->dimensions,
            );

            $satirIndirilemez = (float) $satir->non_deductible_amount;
            $indirilemez += $satirIndirilemez;
            $indirilebilir += (float) $satir->tax_amount - $satirIndirilemez;

            // Tevkifat / AB içi alım: vergi hem hesaplanan hem indirilecek yazılır.
            if ($satir->taxCode?->treatment->isSelfAssessed()) {
                $tevkifat += (float) $satir->tax_amount;
            }
        }

        if ($indirilebilir > 0) {
            $satirlar[] = $this->line(
                $this->roles->accountId($company, AccountRole::INPUT_VAT),
                borc: $this->fc($belge, $indirilebilir) * $isaret,
                aciklama: 'İndirilecek KDV',
                belge: $belge,
                txnTutar: $indirilebilir * $isaret,
            );
        }

        if ($indirilemez > 0) {
            $satirlar[] = $this->line(
                $this->roles->accountId($company, AccountRole::NON_DEDUCTIBLE_VAT),
                borc: $this->fc($belge, $indirilemez) * $isaret,
                aciklama: 'İndirilemeyen KDV',
                belge: $belge,
                txnTutar: $indirilemez * $isaret,
            );
        }

        // Tevkifatta satıcıya ödenen tutar vergisizdir; karşı taraf net ile
        // alacaklanır ve hesaplanan KDV ayrıca yazılır.
        $karsiTarafTutar = $tevkifat > 0
            ? (float) $belge->net_amount
            : (float) $belge->gross_amount;

        $satirlar[] = $this->line(
            $tedarikciHesap,
            alacak: $this->fc($belge, $karsiTarafTutar) * $isaret,
            aciklama: $this->karsiTarafMetni($belge),
            belge: $belge,
            partnerId: $belge->partner_id,
            txnTutar: $karsiTarafTutar * $isaret,
        );

        if ($tevkifat > 0) {
            $satirlar[] = $this->line(
                $this->roles->accountId($company, AccountRole::OUTPUT_VAT),
                alacak: $this->fc($belge, $tevkifat) * $isaret,
                aciklama: 'Tevkifat / AB içi alım — hesaplanan KDV',
                belge: $belge,
                txnTutar: $tevkifat * $isaret,
            );
        }

        return $satirlar;
    }

    /**
     * Fişi dengeler.
     *
     * Satır bazında yuvarlama yaptığımız için borç ve alacak bir kuruş
     * ayrışabilir. Fark yuvarlama hesabına yazılır; eşik aşılırsa hata verilir
     * çünkü o artık yuvarlama değil hesap hatasıdır.
     */
    private function balanceRounding(Company $company, array $satirlar, Document $belge): array
    {
        $borc   = round(array_sum(array_column($satirlar, 'debit')), 2);
        $alacak = round(array_sum(array_column($satirlar, 'credit')), 2);
        $fark   = round($borc - $alacak, 2);

        if ($fark === 0.0) {
            return $satirlar;
        }

        // Satır sayısı kadar kuruş sapma makul; fazlası gerçek hatadır.
        $esik = max(0.05, count($satirlar) * 0.01);

        if (abs($fark) > $esik) {
            throw ValidationException::withMessages([
                'document' => sprintf(
                    'Belge fişi dengelenemedi. Borç %s, alacak %s, fark %s %s. Satır tutarlarını kontrol edin.',
                    number_format($borc, 2, ',', '.'), number_format($alacak, 2, ',', '.'),
                    number_format($fark, 2, ',', '.'), $company->functionalCurrency(),
                ),
            ]);
        }

        $hesap = $this->roles->accountIdOrNull($company, AccountRole::ROUNDING);

        if (! $hesap) {
            throw ValidationException::withMessages([
                'account_role' => 'Yuvarlama farkı hesabı eşlenmemiş; kuruş farkı yazılamıyor.',
            ]);
        }

        $satirlar[] = $this->line(
            $hesap,
            borc:   $fark < 0 ? abs($fark) : 0.0,
            alacak: $fark > 0 ? $fark : 0.0,
            aciklama: 'Yuvarlama farkı',
            belge: $belge,
        );

        return $satirlar;
    }

    /** Tek fiş satırı kurar; negatif tutar ters yöne çevrilir. */
    private function line(
        string $hesapId,
        float $borc = 0.0,
        float $alacak = 0.0,
        string $aciklama = '',
        ?Document $belge = null,
        ?string $partnerId = null,
        float $txnTutar = 0.0,
        ?string $vergiKodu = null,
        ?float $vergiMatrahi = null,
        ?float $vergiTutari = null,
        ?float $vergiOrani = null,
        array $boyutlar = [],
    ): array {
        // İade belgelerinde işaret çevrildiği için tutar negatife düşebilir;
        // muhasebede negatif borç yerine alacak yazılır.
        if ($borc < 0) {
            $alacak = abs($borc);
            $borc   = 0.0;
        }
        if ($alacak < 0) {
            $borc   = abs($alacak);
            $alacak = 0.0;
        }

        $yabanciPara = $belge && $belge->currency !== $belge->company->functionalCurrency();

        return [
            'account_id'     => $hesapId,
            'description'    => mb_substr($aciklama, 0, 255),
            'debit'          => round($borc, 2),
            'credit'         => round($alacak, 2),
            'partner_id'     => $partnerId,
            'tax_code_id'    => $vergiKodu,
            'tax_base'       => $vergiMatrahi,
            'tax_amount'     => $vergiTutari,
            'tax_rate'       => $vergiOrani,
            'dimensions'     => $boyutlar ?: [],
            'txn_currency'   => $yabanciPara ? $belge->currency : null,
            'txn_debit'      => $yabanciPara && $borc   > 0 ? round(abs($txnTutar), 2) : null,
            'txn_credit'     => $yabanciPara && $alacak > 0 ? round(abs($txnTutar), 2) : null,
            'fx_rate'        => $yabanciPara ? $belge->exchange_rate : null,
            'fx_rate_date'   => $yabanciPara ? $belge->exchange_rate_date?->toDateString() : null,
            'fx_rate_source' => $yabanciPara ? $belge->exchange_rate_source : null,
        ];
    }

    /** İşlem para birimindeki tutarı defter para birimine çevirir. */
    private function fc(Document $belge, float $tutar): float
    {
        return round($tutar * (float) $belge->exchange_rate, 2);
    }

    private function karsiTarafMetni(Document $belge): string
    {
        $ad = $belge->partner_name ?: 'Cari';

        return "{$belge->doc_type->label()} {$belge->fullNumber()} — $ad";
    }
}
