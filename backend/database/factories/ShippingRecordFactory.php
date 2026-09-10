<?php

namespace Database\Factories;

use App\Enums\Priority;
use App\Enums\RecordStatus;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class ShippingRecordFactory extends Factory
{
    public function definition(): array
    {
        $company = Company::factory()->create();

        return [
            'id'              => Str::uuid(),
            'company_id'      => $company->id,
            'created_by'      => User::factory()->create(['company_id' => $company->id])->id,
            'record_number'   => 'SHP-' . now()->format('Ym') . '-' . str_pad($this->faker->numberBetween(1, 9999), 5, '0', STR_PAD_LEFT),
            'title'           => $this->faker->sentence(5),
            'description'     => $this->faker->paragraph(),
            'status'          => $this->faker->randomElement(RecordStatus::cases())->value,
            'priority'        => $this->faker->randomElement(Priority::cases())->value,
            'tracking_number' => strtoupper($this->faker->bothify('??########')),
            'carrier'         => $this->faker->randomElement(['DHL', 'UPS', 'FedEx', 'PTT Kargo', 'Aras', 'Yurtiçi']),
            'origin'          => $this->faker->city() . ', ' . $this->faker->country(),
            'destination'     => $this->faker->city() . ', ' . $this->faker->country(),
            'weight_kg'       => $this->faker->optional()->randomFloat(2, 0.1, 500),
            'estimated_delivery' => $this->faker->optional()->dateTimeBetween('now', '+2 weeks')?->format('Y-m-d'),
            'actual_delivery' => null,
            'notes'           => $this->faker->optional()->sentence(),
            'metadata'        => [],
        ];
    }
}
