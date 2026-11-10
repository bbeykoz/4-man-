<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'              => $this->id,
            'name'            => $this->name,
            'slug'            => $this->slug,
            'logo'            => $this->logo,
            'domain'          => $this->domain,
            'tax_number'      => $this->tax_number,
            'address'         => $this->address,
            'phone'           => $this->phone,
            'email'           => $this->email,
            'website'         => $this->website,
            'status'          => $this->status->value,
            'status_label'    => $this->status->label(),
            'plan_type'       => $this->plan_type->value,
            'plan_label'      => $this->plan_type->label(),
            'max_users'       => $this->max_users,
            'max_departments' => $this->max_departments,
            'settings'        => $this->settings,

            // Ülke paketi ve muhasebe kimliği
            'country_code'            => $this->country_code,
            'country_name'            => data_get($this->countryPack(), 'name'),
            'functional_currency'     => $this->functionalCurrency(),
            'timezone'                => $this->timezone,
            'fiscal_year_start_month' => $this->fiscal_year_start_month,
            'accounting_framework'    => $this->accounting_framework,
            'document_locale'         => $this->documentLocale(),
            'registration_number'     => $this->registration_number,
            'registration_label'      => data_get($this->countryPack(), 'registration_label'),
            'vat_number'              => $this->vat_number,
            'vat_term'                => data_get($this->countryPack(), 'vat_term'),
            'vat_registered'          => $this->vat_registered,
            'vat_registered_at'       => $this->vat_registered_at?->toDateString(),
            'reporting'               => data_get($this->countryPack(), 'reporting', []),

            'created_at'      => $this->created_at->toISOString(),
            'updated_at'      => $this->updated_at->toISOString(),

            'owner'           => $this->whenLoaded('owner', fn() => new UserResource($this->owner)),
            'users_count'     => $this->whenCounted('users'),
            'departments_count' => $this->whenCounted('departments'),
        ];
    }
}
