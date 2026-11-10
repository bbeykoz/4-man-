<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BankAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'code'          => $this->code,
            'name'          => $this->name,
            'display_name'  => $this->displayName(),
            'type'          => $this->type,
            'bank_name'     => $this->bank_name,
            'iban'          => $this->iban,
            'bic'           => $this->bic,
            'account_number'=> $this->account_number,
            'currency'      => $this->currency,
            'account_id'    => $this->account_id,
            'account_code'  => $this->whenLoaded('account', fn () => $this->account?->code),
            'cash_limit'    => $this->cash_limit === null ? null : (float) $this->cash_limit,
            'approval_threshold' => $this->approval_threshold === null ? null : (float) $this->approval_threshold,
            'is_active'     => $this->is_active,
            'is_default'    => $this->is_default,
            'notes'         => $this->notes,
            // Bakiye isteyen uçta hesaplanır; listede N+1 olmasın diye koşullu.
            'ledger_balance'=> $this->when(isset($this->additional_balance), fn () => $this->additional_balance),
        ];
    }
}
