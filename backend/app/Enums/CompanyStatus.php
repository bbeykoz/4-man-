<?php

namespace App\Enums;

enum CompanyStatus: string
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
}
