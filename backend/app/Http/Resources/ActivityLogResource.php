<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ActivityLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'action'      => $this->action,
            'description' => $this->description,
            'model_type'  => $this->model_type ? class_basename($this->model_type) : null,
            'model_id'    => $this->model_id,
            'old_values'  => $this->old_values,
            'new_values'  => $this->new_values,
            'ip_address'  => $this->ip_address,
            'created_at'  => $this->created_at->toISOString(),

            'user' => $this->whenLoaded('user', fn() => [
                'id'        => $this->user?->id,
                'name'      => $this->user?->name,
                'email'     => $this->user?->email,
                'avatar_url'=> $this->user?->avatar_url,
            ]),
        ];
    }
}
