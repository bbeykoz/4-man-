<?php

namespace App\Enums;

enum Priority: string
{
    case Low      = 'low';
    case Medium   = 'medium';
    case High     = 'high';
    case Critical = 'critical';

    public function label(): string
    {
        return match($this) {
            self::Low      => 'Düşük',
            self::Medium   => 'Orta',
            self::High     => 'Yüksek',
            self::Critical => 'Kritik',
        };
    }

    public function color(): string
    {
        return match($this) {
            self::Low      => 'gray',
            self::Medium   => 'blue',
            self::High     => 'orange',
            self::Critical => 'red',
        };
    }
}
