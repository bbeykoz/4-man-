<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'doc_type'      => $this->doc_type->value,
            'type_label'    => $this->doc_type->label(),
            'direction'     => $this->doc_type->direction(),
            'number'        => $this->number,
            'full_number'   => $this->fullNumber(),
            'series_id'     => $this->series_id,
            'series_code'   => $this->whenLoaded('series', fn () => $this->series?->code),

            'issue_date'    => $this->issue_date->toDateString(),
            'tax_date'      => $this->tax_date?->toDateString(),
            'supply_date'   => $this->supply_date?->toDateString(),
            'due_date'      => $this->due_date?->toDateString(),

            'partner_id'    => $this->partner_id,
            'partner_name'  => $this->partner_name,
            'partner_vat_number' => $this->partner_vat_number,
            'partner_registration_number' => $this->partner_registration_number,
            'partner_address' => $this->partner_address,

            'currency'      => $this->currency,
            'exchange_rate' => (float) $this->exchange_rate,
            'net_amount'    => (string) $this->net_amount,
            'tax_amount'    => (string) $this->tax_amount,
            'gross_amount'  => (string) $this->gross_amount,
            'discount_amount' => (string) $this->discount_amount,
            'net_amount_fc'   => (string) $this->net_amount_fc,
            'gross_amount_fc' => (string) $this->gross_amount_fc,
            'settled_amount'  => (string) $this->settled_amount,
            'outstanding'     => $this->outstanding(),

            'status'        => $this->status->value,
            'status_label'  => $this->status->label(),
            'status_color'  => $this->status->color(),
            'is_editable'   => $this->isEditable(),
            'is_overdue'    => $this->isOverdue(),

            'corrects_document_id' => $this->corrects_document_id,
            'corrects_number'      => $this->whenLoaded('corrects', fn () => $this->corrects?->number),
            'correction_reason'    => $this->correction_reason,
            'corrections'          => DocumentResource::collection($this->whenLoaded('corrections')),

            'journal_entry_id' => $this->journal_entry_id,
            'journal_no'       => $this->whenLoaded('journalEntry', fn () => $this->journalEntry?->journal_no),

            'source_type'   => $this->source_type,
            'source_id'     => $this->source_id,
            'reference'     => $this->reference,
            'notes'         => $this->notes,
            'payment_terms' => $this->payment_terms,
            'posted_at'     => $this->posted_at?->toISOString(),
            'created_at'    => $this->created_at?->toISOString(),

            'lines' => DocumentLineResource::collection($this->whenLoaded('lines')),
        ];
    }
}
