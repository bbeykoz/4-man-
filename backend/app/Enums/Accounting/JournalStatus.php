<?php

namespace App\Enums\Accounting;

/**
 * Fiş durum makinesi.
 *
 * Taslak → doğrulandı → onay bekliyor → onaylandı → deftere işlendi.
 * Deftere işlenen fiş yalnızca ters kayıtla "reversed" olur; başka geçiş yok.
 */
enum JournalStatus: string
{
    case Draft           = 'draft';
    case Validated       = 'validated';
    case PendingApproval = 'pending_approval';
    case Approved        = 'approved';
    case Posted          = 'posted';
    case Reversed        = 'reversed';
    case Cancelled       = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Draft           => 'Taslak',
            self::Validated       => 'Doğrulandı',
            self::PendingApproval => 'Onay bekliyor',
            self::Approved        => 'Onaylandı',
            self::Posted          => 'Deftere işlendi',
            self::Reversed        => 'Ters kayıtla kapatıldı',
            self::Cancelled       => 'İptal',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Draft           => 'gray',
            self::Validated       => 'blue',
            self::PendingApproval => 'amber',
            self::Approved        => 'indigo',
            self::Posted          => 'emerald',
            self::Reversed        => 'rose',
            self::Cancelled       => 'red',
        };
    }

    /** Bu durumdan geçilebilecek durumlar. */
    public function allowedNext(): array
    {
        return match ($this) {
            // Taslaktan doğrudan onaya gidilebilir: submitForApproval zaten
            // doğrulamayı çalıştırıyor, ayrıca bir "doğrula" adımı zorlamak
            // kullanıcıyı iki tıkla aynı yere götürür.
            self::Draft           => [self::Validated, self::PendingApproval, self::Cancelled],
            self::Validated       => [self::Draft, self::PendingApproval, self::Cancelled],
            self::PendingApproval => [self::Approved, self::Draft, self::Cancelled],
            self::Approved        => [self::Posted, self::Draft],
            self::Posted          => [self::Reversed],
            self::Reversed        => [],
            self::Cancelled       => [],
        };
    }

    public function canTransitionTo(self $hedef): bool
    {
        return in_array($hedef, $this->allowedNext(), true);
    }

    /** Deftere etki etmiş mi; bu fişler değiştirilemez ve silinemez. */
    public function isFinal(): bool
    {
        return in_array($this, [self::Posted, self::Reversed], true);
    }

    /** Satırları hâlâ düzenlenebilir mi. */
    public function isEditable(): bool
    {
        return in_array($this, [self::Draft, self::Validated], true);
    }
}
