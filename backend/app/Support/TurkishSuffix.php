<?php

namespace App\Support;

/**
 * Özel isimlere Türkçe ek (kesme işaretiyle): ses uyumu ve ünsüz sertleşmesi.
 * locative: İstanbul'da, İzmir'de, Konak'ta, Depo 3'te
 * dative:   Ankara'ya, İzmir'e, Tedarikçi A'ya, Firma B'ye, Konak'a
 */
final class TurkishSuffix
{
    private const BACK_VOWELS  = ['a', 'ı', 'o', 'u'];
    private const HARD         = ['f', 's', 't', 'k', 'ç', 'ş', 'h', 'p'];

    /** Tek harfle / rakamla biten isimlerin okunuşu (A → "a", B → "be", 3 → "üç") */
    private const LETTER_SOUNDS = [
        'a' => 'a', 'b' => 'be', 'c' => 'ce', 'ç' => 'çe', 'd' => 'de', 'e' => 'e', 'f' => 'fe', 'g' => 'ge',
        'ğ' => 'yumuşak ge', 'h' => 'he', 'ı' => 'ı', 'i' => 'i', 'j' => 'je', 'k' => 'ka', 'l' => 'le', 'm' => 'me',
        'n' => 'ne', 'o' => 'o', 'ö' => 'ö', 'p' => 'pe', 'r' => 're', 's' => 'se', 'ş' => 'şe', 't' => 'te',
        'u' => 'u', 'ü' => 'ü', 'v' => 've', 'y' => 'ye', 'z' => 'ze',
        '0' => 'sıfır', '1' => 'bir', '2' => 'iki', '3' => 'üç', '4' => 'dört', '5' => 'beş',
        '6' => 'altı', '7' => 'yedi', '8' => 'sekiz', '9' => 'dokuz',
    ];

    public static function locative(string $name): string
    {
        $sound = self::sound($name);
        $back  = self::isBack($sound);
        $hard  = in_array(mb_substr($sound, -1), self::HARD, true);

        return $name . "'" . ($hard ? 't' : 'd') . ($back ? 'a' : 'e');
    }

    public static function dative(string $name): string
    {
        $sound  = self::sound($name);
        $vowel  = self::isBack($sound) ? 'a' : 'e';
        $buffer = self::endsWithVowel($sound) ? 'y' : '';

        return "{$name}'{$buffer}{$vowel}";
    }

    /** Okunuş: tek harf / rakamla bitiyorsa harfin adı, değilse kelimenin kendisi. */
    private static function sound(string $name): string
    {
        $lower = mb_strtolower(trim($name), 'UTF-8');
        $last  = mb_substr($lower, -1);
        $prev  = mb_substr($lower, -2, 1);

        $isolated = mb_strlen($lower) === 1 || $prev === ' ' || $prev === '-' || ctype_digit($last);
        if ($isolated && isset(self::LETTER_SOUNDS[$last])) {
            return self::LETTER_SOUNDS[$last];
        }

        return $lower;
    }

    private static function isBack(string $sound): bool
    {
        preg_match_all('/[aıoueiöü]/u', $sound, $m);

        return in_array(end($m[0]) ?: 'e', self::BACK_VOWELS, true);
    }

    private static function endsWithVowel(string $sound): bool
    {
        return (bool) preg_match('/[aıoueiöü]$/u', $sound);
    }
}
