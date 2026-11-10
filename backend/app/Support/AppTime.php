<?php

namespace App\Support;

use App\Models\Company;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;  // Laravel'in Carbon'u: servisler bu tipi bekliyor

/**
 * Saat dilimi yardımcıları.
 *
 * Veriler veritabanında UTC saklanır (tüm kurulumlarda tutarlı olsun diye).
 * Ancak "bugün", "bu ay", gece görevleri ve ekrandaki saatler yerel saate göre
 * olmalıdır. Bu sınıf iki dünyayı birbirine çevirir.
 *
 * Saat dilimi şirkete bağlıdır: Bulgaristan Europe/Sofia, Türkiye
 * Europe/Istanbul kullanır. Sıra şu: açıkça verilen şirket → oturumdaki
 * kullanıcının şirketi → config varsayılanı. Platform kullanıcısının şirketi
 * olmadığı için onlarda varsayılan geçerli.
 */
class AppTime
{
    /** Açıkça seçilen saat dilimi; kuyruk işleri ve raporlar şirketi kendi verir. */
    private static ?string $secilenTz = null;

    /** Oturumdan çözülen saat dilimi; istek başına bir kez hesaplanır. */
    private static ?string $cozulenTz = null;

    /**
     * Belirli bir şirketin saat dilimine geç.
     *
     * Kuyruk işleri ve zamanlanmış görevlerde oturum yoktur; işlenen şirket
     * buradan verilir. null geçmek seçimi temizler.
     */
    public static function useCompany(Company|string|null $company): void
    {
        if ($company === null) {
            self::$secilenTz = null;
            return;
        }

        self::$secilenTz = $company instanceof Company
            ? ($company->timezone ?: self::varsayilanTz())
            : (Company::whereKey($company)->value('timezone') ?: self::varsayilanTz());
    }

    /** Bir şirketin saat diliminde kod çalıştırır, sonra önceki seçime döner. */
    public static function withCompany(Company|string|null $company, callable $is): mixed
    {
        $onceki = self::$secilenTz;
        self::useCompany($company);

        try {
            return $is();
        } finally {
            self::$secilenTz = $onceki;
        }
    }

    /** İstek sonunda ya da testler arasında çözülmüş değeri unutur. */
    public static function forget(): void
    {
        self::$secilenTz = null;
        self::$cozulenTz = null;
    }

    private static function varsayilanTz(): string
    {
        return config('app.display_timezone', 'Europe/Istanbul');
    }

    /** Kullanıcıların gördüğü saat dilimi. */
    public static function tz(): string
    {
        if (self::$secilenTz !== null) {
            return self::$secilenTz;
        }

        if (self::$cozulenTz !== null) {
            return self::$cozulenTz;
        }

        // auth() konsol ve kuyrukta da çağrılabilir; orada kullanıcı yok.
        $kullanici = auth()->user();
        $tz = $kullanici?->company?->timezone;

        return self::$cozulenTz = ($tz ?: self::varsayilanTz());
    }

    /** Yerel saate göre şimdi. */
    public static function now(): Carbon
    {
        return Carbon::now(self::tz());
    }

    /** Yerel saate göre bugünün tarihi (saat 00:00). */
    public static function today(): Carbon
    {
        return Carbon::now(self::tz())->startOfDay();
    }

    /** Verilen günün UTC karşılığı [başlangıç, bitiş]; timestamp sütunlarını sorgularken kullanılır. */
    public static function dayRangeUtc(?CarbonInterface $day = null): array
    {
        $local = $day ? Carbon::parse($day)->setTimezone(self::tz()) : self::now();

        return [
            $local->copy()->startOfDay()->utc(),
            $local->copy()->endOfDay()->utc(),
        ];
    }

    /**
     * Bir zaman damgasının Türkiye saatine göre gün başlangıcı.
     * Gün farkı hesaplarken saat kısmı kalırsa fark aşağı yuvarlanır
     * (30 Eylül 14:00 → 4 Ekim 00:00 arası 3 gün görünür, doğrusu 4).
     */
    public static function startOfLocalDay(CarbonInterface|string|null $when): ?Carbon
    {
        if ($when === null || $when === '') {
            return null;
        }

        return Carbon::parse($when)->setTimezone(self::tz())->startOfDay();
    }

    /** İki zaman damgası arasındaki tam gün farkı (saat kısmı dikkate alınmaz). */
    public static function daysBetween(CarbonInterface|string|null $from, CarbonInterface|string|null $to = null): ?int
    {
        $start = self::startOfLocalDay($from);
        if ($start === null) {
            return null;
        }

        $end = self::startOfLocalDay($to) ?? self::today();

        return (int) round($start->diffInDays($end, false));
    }

    /**
     * PostgreSQL'de bir timestamp sütununu yerel saate çevirir.
     * Örnek: AppTime::sqlLocal('created_at') => "(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Sofia')"
     *
     * Saat dilimi artık veritabanındaki şirket kaydından geliyor ve bu metin
     * doğrudan SQL'e giriyor. Bu yüzden PHP'nin tanıdığı saat dilimi listesiyle
     * doğrulanır; tanınmayan değerde varsayılana düşer.
     */
    public static function sqlLocal(string $column): string
    {
        $tz = self::guvenliTz(self::tz());

        return "({$column} AT TIME ZONE 'UTC' AT TIME ZONE '{$tz}')";
    }

    /** SQL'e gömülecek saat dilimini doğrular. */
    private static function guvenliTz(string $tz): string
    {
        static $bilinen = null;
        $bilinen ??= array_flip(\DateTimeZone::listIdentifiers());

        return isset($bilinen[$tz]) ? $tz : self::varsayilanTz();
    }
}
