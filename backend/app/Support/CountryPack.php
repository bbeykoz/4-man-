<?php

namespace App\Support;

use App\Models\Company;
use InvalidArgumentException;

/**
 * Ülke paketi çözücü.
 *
 * Muhasebe çekirdeği hiçbir yerde "Bulgaristan" ya da "Türkiye" bilmez; ülkeye
 * özgü bir değere ihtiyaç duyduğunda buradan ister. Böylece üçüncü bir ülke
 * eklemek config/country_packs.php'ye bir dizi eklemekten ibaret kalıyor.
 */
class CountryPack
{
    /** Paketi ülke koduyla getirir. Tanımsız ülkede varsayılana düşmez, hata verir. */
    public static function get(string $countryCode): array
    {
        $kod  = strtoupper($countryCode);
        $pack = config("country_packs.packs.$kod");

        if ($pack === null) {
            throw new InvalidArgumentException("Tanımlı ülke paketi yok: $kod");
        }

        return $pack + ['country_code' => $kod];
    }

    /** Şirketin ülke paketi. */
    public static function forCompany(Company $company): array
    {
        return self::get($company->country_code ?? config('country_packs.default'));
    }

    /** Tek bir ayar; paket içinde yoksa $varsayilan döner. */
    public static function setting(string $countryCode, string $anahtar, mixed $varsayilan = null): mixed
    {
        return data_get(self::get($countryCode), $anahtar, $varsayilan);
    }

    /** Tanımlı tüm ülke kodları. */
    public static function codes(): array
    {
        return array_keys(config('country_packs.packs', []));
    }

    /** Arayüzde ülke seçimi için kod => ad listesi. */
    public static function options(): array
    {
        return array_map(fn (array $p) => $p['name'], config('country_packs.packs', []));
    }

    /**
     * Ülkeye göre tüzel kişi kimliği doğrulaması (Bulgaristan EIK, Türkiye vergi no).
     * Biçim kontrolüdür; resmi sicil doğrulaması değildir.
     */
    public static function validRegistrationNumber(string $countryCode, ?string $numara): bool
    {
        if ($numara === null || $numara === '') {
            return true;   // zorunluluk ayrı kuralda
        }

        $desen = self::setting($countryCode, 'registration_regex');

        return $desen === null || preg_match($desen, $numara) === 1;
    }

    /** Ülkeye göre KDV numarası biçim kontrolü. */
    public static function validVatNumber(string $countryCode, ?string $numara): bool
    {
        if ($numara === null || $numara === '') {
            return true;
        }

        $desen = self::setting($countryCode, 'vat_number_regex');

        return $desen === null || preg_match($desen, $numara) === 1;
    }
}
