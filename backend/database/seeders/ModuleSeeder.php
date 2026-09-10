<?php

namespace Database\Seeders;

use App\Models\Module;
use Illuminate\Database\Seeder;

class ModuleSeeder extends Seeder
{
    public function run(): void
    {
        $modules = config('modules.list');
        $order   = 1;

        foreach ($modules as $slug => $config) {
            Module::updateOrCreate(
                ['slug' => $slug],
                [
                    'name'        => $config['name'],
                    'slug'        => $slug,
                    'description' => $config['description'],
                    'icon'        => $config['icon'],
                    'color'       => $config['color'],
                    'is_active'   => true,
                    'order_index' => $order++,
                ]
            );
        }

        $this->command->info('Modules seeded: ' . count($modules));
    }
}
