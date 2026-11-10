<?php

namespace App\Enums\Accounting;

enum NormalBalance: string
{
    case Debit  = 'debit';
    case Credit = 'credit';

    public function label(): string
    {
        return $this === self::Debit ? 'Borç' : 'Alacak';
    }

    /** Bakiyeyi olağan yöne göre işaretler: ters bakiye negatif çıkar. */
    public function signed(string|float $debit, string|float $credit): float
    {
        return $this === self::Debit
            ? (float) $debit - (float) $credit
            : (float) $credit - (float) $debit;
    }
}
