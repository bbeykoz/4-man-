<?php

namespace App\Support;

/**
 * Muhasebe hesap rolleri.
 *
 * Kod hiçbir yerde "411" yazmaz; "alacak kontrol hesabı" der ve rolü sorar.
 * Şirket kendi hesap planını kullandığı için eşleme veritabanında tutuluyor
 * (accounting_account_roles), varsayılanları ülke paketinden geliyor.
 */
final class AccountRole
{
    public const AR_CONTROL          = 'ar_control';            // müşteriler
    public const AP_CONTROL          = 'ap_control';            // tedarikçiler
    public const CUSTOMER_ADVANCE    = 'customer_advance';      // alınan avanslar
    public const SUPPLIER_ADVANCE    = 'supplier_advance';      // verilen avanslar
    public const OUTPUT_VAT          = 'output_vat';            // hesaplanan KDV
    public const INPUT_VAT           = 'input_vat';             // indirilecek KDV
    public const NON_DEDUCTIBLE_VAT  = 'non_deductible_vat';    // indirilemeyen KDV gideri
    public const VAT_SETTLEMENT      = 'vat_settlement';        // ödenecek / devreden KDV
    public const DEFAULT_REVENUE     = 'default_revenue';
    public const DEFAULT_EXPENSE     = 'default_expense';
    public const INVENTORY           = 'inventory';             // ticari mal
    public const GRNI                = 'grni';                  // faturası gelmemiş mal kabulü
    public const COGS                = 'cogs';                  // satılan malın maliyeti
    public const INVENTORY_VARIANCE  = 'inventory_variance';    // sayım farkı / fire
    public const INVENTORY_TRANSIT   = 'inventory_transit';     // depolar arası transit
    public const CASH                = 'cash';
    public const BANK                = 'bank';
    public const FX_GAIN             = 'fx_gain';
    public const FX_LOSS             = 'fx_loss';
    public const ROUNDING            = 'rounding';
    public const RETAINED_EARNINGS   = 'retained_earnings';

    /** Rolün insan okuyacağı adı. */
    public static function label(string $rol): string
    {
        return match ($rol) {
            self::AR_CONTROL         => 'Müşteriler (alacak kontrol)',
            self::AP_CONTROL         => 'Tedarikçiler (borç kontrol)',
            self::CUSTOMER_ADVANCE   => 'Alınan avanslar',
            self::SUPPLIER_ADVANCE   => 'Verilen avanslar',
            self::OUTPUT_VAT         => 'Hesaplanan KDV',
            self::INPUT_VAT          => 'İndirilecek KDV',
            self::NON_DEDUCTIBLE_VAT => 'İndirilemeyen KDV gideri',
            self::VAT_SETTLEMENT     => 'Ödenecek / devreden KDV',
            self::DEFAULT_REVENUE    => 'Varsayılan gelir hesabı',
            self::DEFAULT_EXPENSE    => 'Varsayılan gider hesabı',
            self::INVENTORY          => 'Ticari mal stoğu',
            self::GRNI               => 'Faturası gelmemiş mal kabulü',
            self::COGS               => 'Satılan malın maliyeti',
            self::INVENTORY_VARIANCE => 'Sayım farkı / fire',
            self::INVENTORY_TRANSIT  => 'Depolar arası transit',
            self::CASH               => 'Kasa',
            self::BANK               => 'Banka',
            self::FX_GAIN            => 'Kur farkı geliri',
            self::FX_LOSS            => 'Kur farkı gideri',
            self::ROUNDING           => 'Yuvarlama farkı',
            self::RETAINED_EARNINGS  => 'Geçmiş yıl kârı',
            default                  => $rol,
        };
    }

    /** @return string[] */
    public static function all(): array
    {
        return [
            self::AR_CONTROL, self::AP_CONTROL, self::CUSTOMER_ADVANCE, self::SUPPLIER_ADVANCE,
            self::OUTPUT_VAT, self::INPUT_VAT, self::NON_DEDUCTIBLE_VAT, self::VAT_SETTLEMENT,
            self::DEFAULT_REVENUE, self::DEFAULT_EXPENSE,
            self::INVENTORY, self::GRNI, self::COGS, self::INVENTORY_VARIANCE, self::INVENTORY_TRANSIT,
            self::CASH, self::BANK, self::FX_GAIN, self::FX_LOSS, self::ROUNDING, self::RETAINED_EARNINGS,
        ];
    }

    /** Belge kesilebilmesi için en az bunlar eşlenmiş olmalı. */
    public static function requiredForDocuments(): array
    {
        return [self::AR_CONTROL, self::AP_CONTROL, self::OUTPUT_VAT, self::INPUT_VAT,
                self::DEFAULT_REVENUE, self::DEFAULT_EXPENSE];
    }
}
