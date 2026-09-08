<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'slug'        => $this->slug,
            'type'        => $this->type,
            'description' => $this->description,
            'color'       => $this->color,
            'status'      => $this->status,
            'order_index' => $this->order_index,
            'company_id'  => $this->company_id,
            'manager_id'  => $this->manager_id,
            'created_at'  => $this->created_at->toISOString(),

            'manager'     => $this->whenLoaded('manager', fn() => new UserResource($this->manager)),
            'users_count' => $this->whenCounted('users'),
        ];
    }
}
