<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'name'         => $this->name,
            'slug'         => $this->slug,
            'display_name' => $this->display_name,
            'description'  => $this->description,
            'level'        => $this->level,
            'level_label'  => $this->getLevelLabel(),
            'color'        => $this->color,
            'is_system'    => $this->is_system,
            'is_super'     => (bool) $this->is_super,
            'is_platform'  => $this->level === 1 && $this->company_id === null,
            'company_id'   => $this->company_id,
            'created_at'   => $this->created_at?->toISOString(),

            'department_id' => $this->department_id,
            'department'    => $this->whenLoaded('department', fn() => $this->department
                ? ['id' => $this->department->id, 'name' => $this->department->name]
                : null
            ),

            'permissions'   => $this->whenLoaded('permissions', fn() => $this->permissions->pluck('name')),
            'users_count'   => $this->whenCounted('users'),
        ];
    }
}
