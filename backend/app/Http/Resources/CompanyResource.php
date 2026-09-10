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
            'created_at'      => $this->created_at->toISOString(),
            'updated_at'      => $this->updated_at->toISOString(),

            'owner'           => $this->whenLoaded('owner', fn() => new UserResource($this->owner)),
            'users_count'     => $this->whenCounted('users'),
            'departments_count' => $this->whenCounted('departments'),
        ];
    }
}
