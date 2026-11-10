<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'number'        => $this->number,
            'label'         => $this->label(),
            'direction'     => $this->direction,
            'direction_label' => $this->isIncoming() ? 'Tahsilat' : 'Ödeme',
            'bank_account_id'   => $this->bank_account_id,
            'bank_account_name' => $this->whenLoaded('bankAccount', fn () => $this->bankAccount?->name),
            'partner_id'    => $this->partner_id,
            'partner_name'  => $this->whenLoaded('partner', fn () => $this->partner?->displayName()),
            'payment_date'  => $this->payment_date->toDateString(),
            'amount'        => (string) $this->amount,
            'currency'      => $this->currency,
            'exchange_rate' => (float) $this->exchange_rate,
            'amount_fc'     => (string) $this->amount_fc,
            'allocated_amount' => (string) $this->allocated_amount,
            'unallocated'   => $this->unallocated(),
            'bank_charge'   => (string) $this->bank_charge,
            'method'        => $this->method,
            'reference'     => $this->reference,
            'description'   => $this->description,
            'status'        => $this->status,
            'is_editable'   => $this->isEditable(),
            'journal_entry_id' => $this->journal_entry_id,
            'journal_no'    => $this->whenLoaded('journalEntry', fn () => $this->journalEntry?->journal_no),
            'approved_at'   => $this->approved_at?->toISOString(),
            'posted_at'     => $this->posted_at?->toISOString(),
            'created_at'    => $this->created_at?->toISOString(),

            'allocations' => $this->whenLoaded('allocations', fn () => $this->allocations->map(fn ($d) => [
                'document_id'      => $d->document_id,
                'document_number'  => $d->document?->number,
                'doc_type'         => $d->document?->doc_type?->value,
                'allocated_amount' => (string) $d->allocated_amount,
                'fx_difference'    => (string) $d->fx_difference,
            ])),
        ];
    }
}
