<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentSeriesResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'               => $this->id,
            'doc_type'         => $this->doc_type->value,
            'type_label'       => $this->doc_type->label(),
            'code'             => $this->code,
            'name'             => $this->name,
            'prefix'           => $this->numberPrefix(),
            'padding'          => $this->padding,
            'reset_yearly'     => $this->reset_yearly,
            'is_default'       => $this->is_default,
            'is_active'        => $this->is_active,
            'allowed_user_ids' => $this->allowed_user_ids,
            'branch'           => $this->branch,
            'documents_count'  => $this->whenCounted('documents'),
        ];
    }
}
