<?php

namespace App\Support;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;  // Laravel'in Carbon'u: servisler bu tipi bekliyor

/**
 * Saat dilimi yardımcıları.
 *
 * Veriler veritabanında UTC saklanır (tüm kurulumlarda tutarlı olsun diye).
 * Ancak "bugün", "bu ay", gece görevleri ve ekrandaki saatler Türkiye saatine göre
 * olmalıdır. Bu sınıf iki dünyayı birbirine çevirir.
 */
class AppTime
{
    /** Kullanıcıların gördüğü saat dilimi. */
    public static function tz(): string
    {
        return config('app.display_timezone', 'Europe/Istanbul');
    }

    /** Türkiye saatine göre şimdi. */
    public static function now(): Carbon
    {
        return Carbon::now(self::tz());
    }

    /** Türkiye saatine göre bugünün tarihi (saat 00:00). */
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
     * PostgreSQL'de bir timestamp sütununu Türkiye saatine çevirir.
     * Örnek: AppTime::sqlLocal('created_at') => "(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')"
     */
    public static function sqlLocal(string $column): string
    {
        $tz = self::tz();

        return "({$column} AT TIME ZONE 'UTC' AT TIME ZONE '{$tz}')";
    }
}
