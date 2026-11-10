<?php

namespace App\Enums\Accounting;

/** Fiş türü. Numara serisi ve varsayılan onay kuralı buna bağlı. */
enum JournalType: string
{
    case Opening       = 'opening';
    case General       = 'general';
    case Sales         = 'sales';
    case Purchase      = 'purchase';
    case Bank          = 'bank';
    case Cash          = 'cash';
    case Inventory     = 'inventory';
    case Payroll       = 'payroll';
    case FixedAsset    = 'fixed_asset';
    case Fx            = 'fx';
    case TaxAdjustment = 'tax_adjustment';
    case Closing       = 'closing';
    case Reversal      = 'reversal';

    public function label(): string
    {
        return match ($this) {
            self::Opening       => 'Açılış',
            self::General       => 'Günlük',
            self::Sales         => 'Satış',
            self::Purchase      => 'Alış',
            self::Bank          => 'Banka',
            self::Cash          => 'Kasa',
            self::Inventory     => 'Stok / maliyet',
            self::Payroll       => 'Bordro',
            self::FixedAsset    => 'Sabit kıymet',
            self::Fx            => 'Kur farkı',
            self::TaxAdjustment => 'Vergi düzeltmesi',
            self::Closing       => 'Kapanış',
            self::Reversal      => 'Ters kayıt',
        };
    }

    /** Numara serisi ön eki. */
    public function prefix(): string
    {
        return match ($this) {
            self::Opening       => 'ACL',
            self::General       => 'YEV',
            self::Sales         => 'SAT',
            self::Purchase      => 'ALS',
            self::Bank          => 'BNK',
            self::Cash          => 'KSA',
            self::Inventory     => 'STK',
            self::Payroll       => 'BRD',
            self::FixedAsset    => 'SBK',
            self::Fx            => 'KUR',
            self::TaxAdjustment => 'VRG',
            self::Closing       => 'KPN',
            self::Reversal      => 'TRS',
        };
    }

    /** Kapanmakta olan döneme (status=closing) yazılabilen türler. */
    public function allowedWhileClosing(): bool
    {
        return in_array($this, [self::Closing, self::Fx, self::TaxAdjustment, self::FixedAsset, self::Inventory], true);
    }
}
