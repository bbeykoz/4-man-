<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccountingPeriodResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'name'          => $this->name,
            'start_date'    => $this->start_date->toDateString(),
            'end_date'      => $this->end_date->toDateString(),
            'status'        => $this->status->value,
            'status_label'  => $this->status->label(),
            'status_color'  => $this->status->color(),
            'accepts_posting' => $this->status->acceptsPosting(),
            'closed_at'     => $this->closed_at?->toISOString(),
            'closed_by'     => $this->whenLoaded('closedBy', fn () => $this->closedBy?->name),
            'reopened_at'   => $this->reopened_at?->toISOString(),
            'reopen_reason' => $this->reopen_reason,
            'entries_count' => $this->whenCounted('entries'),
        ];
    }
}
