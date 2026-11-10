<?php

namespace App\Enums\Accounting;

/**
 * Belge durumu.
 *
 * taslak → kesildi → deftere işlendi → (kısmen) kapandı.
 * İptal yalnız deftere işlenmemiş belgede mümkün; sonrası iade belgesi ister.
 */
enum DocumentStatus: string
{
    case Draft            = 'draft';
    case Issued           = 'issued';
    case Posted           = 'posted';
    case PartiallySettled = 'partially_settled';
    case Settled          = 'settled';
    case Cancelled        = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Draft            => 'Taslak',
            self::Issued           => 'Kesildi',
            self::Posted           => 'Deftere işlendi',
            self::PartiallySettled => 'Kısmen kapandı',
            self::Settled          => 'Kapandı',
            self::Cancelled        => 'İptal',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Draft            => 'gray',
            self::Issued           => 'blue',
            self::Posted           => 'indigo',
            self::PartiallySettled => 'amber',
            self::Settled          => 'emerald',
            self::Cancelled        => 'rose',
        };
    }

    /** Deftere etki etmiş mi; bu belgeler silinemez. */
    public function affectsLedger(): bool
    {
        return in_array($this, [self::Posted, self::PartiallySettled, self::Settled], true);
    }

    /** Satırları hâlâ düzenlenebilir mi. */
    public function isEditable(): bool
    {
        return $this === self::Draft;
    }

    public function allowedNext(): array
    {
        return match ($this) {
            self::Draft            => [self::Issued, self::Cancelled],
            self::Issued           => [self::Posted, self::Draft, self::Cancelled],
            self::Posted           => [self::PartiallySettled, self::Settled],
            self::PartiallySettled => [self::Settled, self::Posted],
            self::Settled          => [self::PartiallySettled],
            self::Cancelled        => [],
        };
    }

    public function canTransitionTo(self $hedef): bool
    {
        return in_array($hedef, $this->allowedNext(), true);
    }
}
