<?php

namespace Database\Factories;

use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class RoleFactory extends Factory
{
    public function definition(): array
    {
        $name = $this->faker->randomElement([
            'Yönetici', 'Müdür', 'Personel', 'Denetçi', 'Editör',
        ]);

        return [
            'id'         => Str::uuid(),
            'company_id' => Company::factory(),
            'name'       => $name,
            'slug'       => Str::slug($name) . '-' . Str::random(4),
            'level'      => $this->faker->numberBetween(2, 5),
            'is_system'  => false,
            'metadata'   => [],
        ];
    }

    public function system(): static
    {
        return $this->state(['is_system' => true]);
    }
}
