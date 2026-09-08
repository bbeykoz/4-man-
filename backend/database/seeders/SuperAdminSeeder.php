<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        // Super Admin rolü
        $role = Role::updateOrCreate(
            ['slug' => 'super-admin', 'company_id' => null],
            [
                'name'         => 'super-admin',
                'display_name' => 'Süper Admin',
                'description'  => 'Sisteme tam erişim',
                'level'        => 1,
                'is_system'    => true,
                'color'        => 'red',
            ]
        );

        // Tüm izinleri super admin rolüne ver
        $allPermissions = Permission::pluck('id');
        $role->permissions()->sync($allPermissions);

        // Super Admin kullanıcısı
        $user = User::updateOrCreate(
            ['email' => 'superadmin@bytepanel.com'],
            [
                'name'              => 'Super Admin',
                'email'             => 'superadmin@bytepanel.com',
                'password'          => Hash::make('BytePanel2024'),
                'status'            => 'active',
                'email_verified_at' => now(),
                'company_id'        => null,
            ]
        );

        // Rol ata
        $user->roles()->syncWithoutDetaching([$role->id => [
            'assigned_at' => now(),
            'assigned_by' => $user->id,
        ]]);

        $this->command->info("Super Admin created: superadmin@bytepanel.com / BytePanel@2024!");
    }
}
