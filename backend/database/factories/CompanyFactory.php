<?php

namespace Database\Factories;

use App\Enums\CompanyStatus;
use App\Enums\PlanType;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class CompanyFactory extends Factory
{
    public function definition(): array
    {
        $name = $this->faker->company();

        return [
            'id'         => Str::uuid(),
            'name'       => $name,
            'slug'       => Str::slug($name) . '-' . Str::random(4),
            'email'      => $this->faker->companyEmail(),
            'phone'      => $this->faker->phoneNumber(),
            'website'    => $this->faker->url(),
            'address'    => $this->faker->address(),
            'tax_number' => $this->faker->numerify('##########'),
            'status'     => CompanyStatus::Active,
            'plan_type'  => $this->faker->randomElement(PlanType::cases()),
            'settings'   => [],
        ];
    }

    public function inactive(): static
    {
        return $this->state(['status' => CompanyStatus::Inactive]);
    }

    public function suspended(): static
    {
        return $this->state(['status' => CompanyStatus::Suspended]);
    }

    public function pro(): static
    {
        return $this->state(['plan_type' => PlanType::Pro]);
    }

    public function enterprise(): static
    {
        return $this->state(['plan_type' => PlanType::Enterprise]);
    }
}
