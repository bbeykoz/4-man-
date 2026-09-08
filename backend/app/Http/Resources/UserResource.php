<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'name'          => $this->name,
            'email'         => $this->email,
            'phone'         => $this->phone,
            'title'         => $this->title,
            'avatar_url'    => $this->avatar_url,
            'status'        => $this->status->value,
            'status_label'  => $this->status->label(),
            'status_color'  => $this->status->color(),
            'company_id'    => $this->company_id,
            'department_id' => $this->department_id,
            'timezone'      => $this->timezone,
            'locale'        => $this->locale,
            'two_factor_enabled'    => $this->two_factor_enabled,
            'two_factor_secret_set' => !empty($this->two_factor_secret),
            'email_verified_at'  => $this->email_verified_at?->toISOString(),
            'last_login_at'      => $this->last_login_at?->toISOString(),
            'last_login_ip'      => $this->last_login_ip,
            'created_at'         => $this->created_at->toISOString(),

            // Conditional relations
            'company'    => $this->whenLoaded('company', fn() => new CompanyResource($this->company)),
            'department' => $this->whenLoaded('department', fn() => new DepartmentResource($this->department)),
            'roles'      => $this->whenLoaded('roles', fn() => RoleResource::collection($this->roles)),
        ];
    }
}
