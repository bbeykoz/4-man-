<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            ModuleSeeder::class,
            PermissionSeeder::class,
            SuperAdminSeeder::class,
            DemoCompanySeeder::class,
        ]);
    }
}
