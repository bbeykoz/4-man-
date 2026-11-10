<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PartnerAddressResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->id,
            'type'           => $this->type,
            'label'          => $this->label,
            'line1'          => $this->line1,
            'line2'          => $this->line2,
            'city'           => $this->city,
            'postal_code'    => $this->postal_code,
            'region'         => $this->region,
            'country_code'   => $this->country_code,
            'contact_person' => $this->contact_person,
            'phone'          => $this->phone,
            'is_default'     => $this->is_default,
            'one_line'       => $this->oneLine(),
        ];
    }
}
