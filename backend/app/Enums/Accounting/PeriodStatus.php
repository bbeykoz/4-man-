<?php

namespace App\Enums\Accounting;

/**
 * Dönem durumu.
 *
 * open: her fiş yazılabilir.
 * closing: yalnız kapanış türü fişler (kur farkı, amortisman, maliyet, vergi).
 * closed: kayıt yok; yetkili gerekçeyle yeniden açabilir.
 * locked: denetlenmiş/beyan edilmiş dönem; ayrı bir izinle açılır.
 */
enum PeriodStatus: string
{
    case Open    = 'open';
    case Closing = 'closing';
    case Closed  = 'closed';
    case Locked  = 'locked';

    public function label(): string
    {
        return match ($this) {
            self::Open    => 'Açık',
            self::Closing => 'Kapanıyor',
            self::Closed  => 'Kapalı',
            self::Locked  => 'Kilitli',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Open    => 'emerald',
            self::Closing => 'amber',
            self::Closed  => 'gray',
            self::Locked  => 'rose',
        };
    }

    public function acceptsPosting(): bool
    {
        return $this === self::Open;
    }
}
