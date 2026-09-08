<?php

namespace Database\Factories;

use App\Enums\Priority;
use App\Enums\RecordStatus;
use App\Models\Company;
use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class AccountingRecordFactory extends Factory
{
    public function definition(): array
    {
        $company = Company::factory()->create();

        return [
            'id'              => Str::uuid(),
            'company_id'      => $company->id,
            'department_id'   => Department::factory()->create(['company_id' => $company->id])->id,
            'created_by'      => User::factory()->create(['company_id' => $company->id])->id,
            'record_number'   => 'ACC-' . now()->format('Ym') . '-' . str_pad($this->faker->numberBetween(1, 9999), 5, '0', STR_PAD_LEFT),
            'title'           => $this->faker->sentence(5),
            'description'     => $this->faker->paragraph(),
            'status'          => $this->faker->randomElement(RecordStatus::cases())->value,
            'priority'        => $this->faker->randomElement(Priority::cases())->value,
            'invoice_number'  => 'INV-' . $this->faker->numerify('######'),
            'invoice_date'    => $this->faker->dateTimeBetween('-6 months')->format('Y-m-d'),
            'amount'          => $this->faker->randomFloat(2, 100, 100000),
            'currency'        => $this->faker->randomElement(['TRY', 'USD', 'EUR']),
            'vendor_name'     => $this->faker->company(),
            'category'        => $this->faker->randomElement(['gelir', 'gider', 'fatura', 'vergi']),
            'due_date'        => $this->faker->optional()->dateTimeBetween('now', '+3 months')?->format('Y-m-d'),
            'notes'           => $this->faker->optional()->paragraph(),
            'metadata'        => [],
        ];
    }

    public function pending(): static
    {
        return $this->state(['status' => RecordStatus::Pending->value]);
    }

    public function completed(): static
    {
        return $this->state(['status' => RecordStatus::Completed->value]);
    }
}
