<?php

namespace App\Enums;

enum RecordStatus: string
{
    case Draft      = 'draft';
    case Pending    = 'pending';
    case InProgress = 'in_progress';
    case Completed  = 'completed';
    case Cancelled  = 'cancelled';
    case Approved   = 'approved';
    case Rejected   = 'rejected';

    public function label(): string
    {
        return match($this) {
            self::Draft      => 'Taslak',
            self::Pending    => 'Bekliyor',
            self::InProgress => 'İşlemde',
            self::Completed  => 'Tamamlandı',
            self::Cancelled  => 'İptal',
            self::Approved   => 'Onaylandı',
            self::Rejected   => 'Reddedildi',
        };
    }

    public function color(): string
    {
        return match($this) {
            self::Draft      => 'gray',
            self::Pending    => 'yellow',
            self::InProgress => 'blue',
            self::Completed  => 'green',
            self::Cancelled  => 'red',
            self::Approved   => 'emerald',
            self::Rejected   => 'rose',
        };
    }
}
