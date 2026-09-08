<?php

namespace Database\Factories;

use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class DepartmentFactory extends Factory
{
    public function definition(): array
    {
        $name = $this->faker->randomElement([
            'Muhasebe', 'İnsan Kaynakları', 'Pazarlama', 'Satış',
            'Depo', 'Lojistik', 'Üretim', 'Kalite', 'IT', 'Hukuk',
        ]);

        return [
            'id'          => Str::uuid(),
            'company_id'  => Company::factory(),
            'name'        => $name,
            'slug'        => Str::slug($name) . '-' . Str::random(4),
            'description' => $this->faker->sentence(),
            'settings'    => [],
        ];
    }
}
