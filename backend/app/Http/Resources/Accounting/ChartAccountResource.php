<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ChartAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                  => $this->id,
            'code'                => $this->code,
            'name'                => $this->name,
            'name_local'          => $this->name_local,
            'display_name'        => $this->displayName(),
            'account_type'        => $this->account_type->value,
            'account_type_label'  => $this->account_type->label(),
            'normal_balance'      => $this->normal_balance->value,
            'normal_balance_label'=> $this->normal_balance->label(),
            'parent_id'           => $this->parent_id,
            'is_control'          => $this->is_control,
            'requires_partner'    => $this->requires_partner,
            'required_dimensions' => $this->required_dimensions,
            'active_from'         => $this->active_from?->toDateString(),
            'active_to'           => $this->active_to?->toDateString(),
            'is_active'           => $this->is_active,
            'is_balance_sheet'    => $this->account_type->isBalanceSheet(),
            'description'         => $this->description,
            'template_key'        => $this->template_key,
            'created_at'          => $this->created_at?->toISOString(),
        ];
    }
}
