<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BankTransactionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                => $this->id,
            'bank_account_id'   => $this->bank_account_id,
            'statement_id'      => $this->statement_id,
            'external_id'       => $this->external_id,
            'booking_date'      => $this->booking_date->toDateString(),
            'value_date'        => $this->value_date?->toDateString(),
            'amount'            => (string) $this->amount,
            'direction'         => $this->isIncoming() ? 'in' : 'out',
            'currency'          => $this->currency,
            'remittance'        => $this->remittance,
            'counterparty_name' => $this->counterparty_name,
            'counterparty_iban' => $this->counterparty_iban,
            'running_balance'   => $this->running_balance === null ? null : (string) $this->running_balance,
            'match_status'      => $this->match_status,
            'match_confidence'  => $this->match_confidence === null ? null : (float) $this->match_confidence,
            'match_reasons'     => $this->match_reasons,
            'payment_id'        => $this->payment_id,
            'payment_number'    => $this->whenLoaded('payment', fn () => $this->payment?->number),
            'journal_entry_id'  => $this->journal_entry_id,
            'ignore_reason'     => $this->ignore_reason,
            'matched_at'        => $this->matched_at?->toISOString(),
        ];
    }
}
