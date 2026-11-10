<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class JournalEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'journal_no'    => $this->journal_no,
            'label'         => $this->label(),
            'journal_type'  => $this->journal_type->value,
            'type_label'    => $this->journal_type->label(),
            'document_date' => $this->document_date->toDateString(),
            'posting_date'  => $this->posting_date->toDateString(),
            'period_id'     => $this->period_id,
            'period_name'   => $this->whenLoaded('period', fn () => $this->period?->name),
            'currency'      => $this->currency,
            'source_type'   => $this->source_type,
            'source_id'     => $this->source_id,
            'status'        => $this->status->value,
            'status_label'  => $this->status->label(),
            'status_color'  => $this->status->color(),
            'description'   => $this->description,
            'reference'     => $this->reference,
            'memo'          => $this->memo,
            'total_debit'   => (string) $this->total_debit,
            'total_credit'  => (string) $this->total_credit,
            'is_balanced'   => $this->isBalanced(),
            'is_editable'   => $this->isEditable(),

            'reversal_of_id' => $this->reversal_of_id,
            'reversed_by_id' => $this->reversed_by_id,
            'reversal_of_no' => $this->whenLoaded('reversalOf', fn () => $this->reversalOf?->journal_no),
            'reversed_by_no' => $this->whenLoaded('reversedBy', fn () => $this->reversedBy?->journal_no),

            'created_by'  => $this->whenLoaded('createdBy',  fn () => $this->createdBy?->name),
            'approved_by' => $this->whenLoaded('approvedBy', fn () => $this->approvedBy?->name),
            'posted_by'   => $this->whenLoaded('postedBy',   fn () => $this->postedBy?->name),
            'approved_at' => $this->approved_at?->toISOString(),
            'posted_at'   => $this->posted_at?->toISOString(),
            'reversed_at' => $this->reversed_at?->toISOString(),
            'created_at'  => $this->created_at?->toISOString(),

            'lines' => JournalLineResource::collection($this->whenLoaded('lines')),
        ];
    }
}
