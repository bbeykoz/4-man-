<?php

namespace App\Enums;

enum UserStatus: string
{
    case Active    = 'active';
    case Inactive  = 'inactive';
    case Suspended = 'suspended';

    public function label(): string
    {
        return match($this) {
            self::Active    => 'Aktif',
            self::Inactive  => 'Pasif',
            self::Suspended => 'Askıya Alındı',
        };
    }

    public function color(): string
    {
        return match($this) {
            self::Active    => 'green',
            self::Inactive  => 'gray',
            self::Suspended => 'red',
        };
    }
}
