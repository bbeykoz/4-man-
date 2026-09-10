<?php

namespace App\Enums;

enum RoleLevel: int
{
    case SuperAdmin        = 1;
    case CompanyOwner      = 2;
    case DepartmentManager = 3;
    case Staff             = 4;
    case Viewer            = 5;

    public function label(): string
    {
        return match($this) {
            self::SuperAdmin        => 'Süper Admin',
            self::CompanyOwner      => 'Şirket Sahibi',
            self::DepartmentManager => 'Departman Müdürü',
            self::Staff             => 'Personel',
            self::Viewer            => 'İzleyici',
        };
    }

    public function canManage(self $other): bool
    {
        return $this->value < $other->value;
    }
}
