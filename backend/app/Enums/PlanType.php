<?php

namespace App\Enums;

enum PlanType: string
{
    case Basic      = 'basic';
    case Pro        = 'pro';
    case Enterprise = 'enterprise';

    public function label(): string
    {
        return match($this) {
            self::Basic      => 'Temel',
            self::Pro        => 'Profesyonel',
            self::Enterprise => 'Kurumsal',
        };
    }

    public function maxUsers(): int
    {
        return match($this) {
            self::Basic      => 10,
            self::Pro        => 50,
            self::Enterprise => PHP_INT_MAX,
        };
    }
}
