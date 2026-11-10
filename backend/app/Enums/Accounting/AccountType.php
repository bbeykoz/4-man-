<?php

namespace App\Enums\Accounting;

/** Hesap türü ve olağan bakiye yönü. */
enum AccountType: string
{
    case Asset      = 'asset';
    case Liability  = 'liability';
    case Equity     = 'equity';
    case Revenue    = 'revenue';
    case Expense    = 'expense';
    case OffBalance = 'off_balance';

    public function label(): string
    {
        return match ($this) {
            self::Asset      => 'Varlık',
            self::Liability  => 'Yükümlülük',
            self::Equity     => 'Özkaynak',
            self::Revenue    => 'Gelir',
            self::Expense    => 'Gider',
            self::OffBalance => 'Nazım hesap',
        };
    }

    /** Türün olağan bakiye yönü; hesap açılırken varsayılan olarak gelir. */
    public function normalBalance(): NormalBalance
    {
        return match ($this) {
            self::Asset, self::Expense       => NormalBalance::Debit,
            self::Liability, self::Equity,
            self::Revenue                    => NormalBalance::Credit,
            self::OffBalance                 => NormalBalance::Debit,
        };
    }

    /** Bilanço hesabı mı; dönem sonunda kapanmaz, devreder. */
    public function isBalanceSheet(): bool
    {
        return in_array($this, [self::Asset, self::Liability, self::Equity], true);
    }
}
