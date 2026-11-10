<?php

namespace App\Enums\Accounting;

/**
 * İşlemin vergi niteliği.
 *
 * Oran tek başına yetmiyor: %0 oran, istisna ve kapsam dışı üçü de sıfır vergi
 * üretir ama beyanda farklı kutulara gider ve indirim hakkı farklıdır. Bu yüzden
 * nitelik ayrı bir alan.
 */
enum TaxTreatment: string
{
    case Standard       = 'standard';
    case Reduced        = 'reduced';
    case ReducedLow     = 'reduced_low';
    case Zero           = 'zero';
    case Exempt         = 'exempt';
    case ReverseCharge  = 'reverse_charge';
    case EuSupply       = 'eu_supply';
    case EuAcquisition  = 'eu_acquisition';
    case Import         = 'import';
    case Export         = 'export';
    case Triangulation  = 'triangulation';
    case OutOfScope     = 'out_of_scope';

    public function label(): string
    {
        return match ($this) {
            self::Standard      => 'Standart oran',
            self::Reduced       => 'İndirimli oran',
            self::ReducedLow    => 'En düşük indirimli oran',
            self::Zero          => 'Sıfır oran',
            self::Exempt        => 'İstisna',
            self::ReverseCharge => 'Tevkifat / reverse charge',
            self::EuSupply      => 'AB içi teslim',
            self::EuAcquisition => 'AB içi alım',
            self::Import        => 'İthalat',
            self::Export        => 'İhracat',
            self::Triangulation => 'Üçgen işlem',
            self::OutOfScope    => 'Kapsam dışı',
        };
    }

    /**
     * Vergiyi satıcı mı hesaplar?
     *
     * Reverse charge ve AB içi alımda vergiyi alıcı kendi beyanında hem borç
     * hem alacak yazar; satış belgesinde vergi tutarı çıkmaz.
     */
    public function sellerCharges(): bool
    {
        return ! in_array($this, [
            self::ReverseCharge, self::EuSupply, self::Export,
            self::Triangulation, self::OutOfScope, self::Exempt, self::Zero,
        ], true);
    }

    /**
     * Alıcı tarafında hem hesaplanan hem indirilecek KDV doğar mı?
     * AB içi alım ve tevkifatta işlem nötr ama iki tarafa da yazılır.
     */
    public function isSelfAssessed(): bool
    {
        return in_array($this, [self::ReverseCharge, self::EuAcquisition, self::Import], true);
    }

    /** VIES / AB içi bildirime girer mi. */
    public function isEuReportable(): bool
    {
        return in_array($this, [self::EuSupply, self::EuAcquisition, self::Triangulation], true);
    }

    /**
     * Girdi KDV'si indirilebilir mi?
     * İstisna kapsamındaki faaliyetin girdi KDV'si kural olarak indirilemez;
     * kesin kapsam ülke paketinde ve danışman onayında belirlenir.
     */
    public function allowsInputDeduction(): bool
    {
        return ! in_array($this, [self::Exempt, self::OutOfScope], true);
    }

    /** Beyan matrahına girer mi; kapsam dışı işlem beyanda yer almaz. */
    public function entersVatReturn(): bool
    {
        return $this !== self::OutOfScope;
    }
}
