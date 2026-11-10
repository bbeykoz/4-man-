<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class JournalLineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->id,
            'line_no'        => $this->line_no,
            'account_id'     => $this->account_id,
            'account_code'   => $this->whenLoaded('account', fn () => $this->account?->code),
            'account_name'   => $this->whenLoaded('account', fn () => $this->account?->name),
            'description'    => $this->description,
            'debit'          => (string) $this->debit,
            'credit'         => (string) $this->credit,
            'txn_currency'   => $this->txn_currency,
            'txn_debit'      => $this->txn_debit  === null ? null : (string) $this->txn_debit,
            'txn_credit'     => $this->txn_credit === null ? null : (string) $this->txn_credit,
            'fx_rate'        => $this->fx_rate === null ? null : (string) $this->fx_rate,
            'fx_rate_date'   => $this->fx_rate_date?->toDateString(),
            'fx_rate_source' => $this->fx_rate_source,
            'partner_id'     => $this->partner_id,
            'tax_code_id'    => $this->tax_code_id,
            'tax_code'       => $this->whenLoaded('taxCode', fn () => $this->taxCode?->code),
            'tax_base'       => $this->tax_base   === null ? null : (string) $this->tax_base,
            'tax_amount'     => $this->tax_amount === null ? null : (string) $this->tax_amount,
            'tax_rate'       => $this->tax_rate   === null ? null : (float) $this->tax_rate,
            'non_deductible_amount' => $this->non_deductible_amount === null ? null : (string) $this->non_deductible_amount,
            'dimensions'     => $this->dimensions,
        ];
    }
}
