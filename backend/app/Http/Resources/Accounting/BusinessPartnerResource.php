<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BusinessPartnerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'code'          => $this->code,
            'legal_name'    => $this->legal_name,
            'trade_name'    => $this->trade_name,
            'display_name'  => $this->displayName(),
            'is_customer'   => $this->is_customer,
            'is_supplier'   => $this->is_supplier,

            'country_code'        => $this->country_code,
            'registration_number' => $this->registration_number,
            'vat_number'          => $this->vat_number,
            'vat_registered'      => $this->vat_registered,
            'vat_verified_at'     => $this->vat_verified_at?->toISOString(),

            'email'          => $this->email,
            'phone'          => $this->phone,
            'website'        => $this->website,
            'contact_person' => $this->contact_person,

            'currency'       => $this->currency,
            'payment_terms'  => $this->payment_terms,
            'payment_days'   => $this->payment_days,
            'credit_limit'   => $this->credit_limit === null ? null : (float) $this->credit_limit,
            'discount_rate'  => (float) $this->discount_rate,

            'receivable_account_id' => $this->receivable_account_id,
            'payable_account_id'    => $this->payable_account_id,
            'default_revenue_account_id' => $this->default_revenue_account_id,
            'default_expense_account_id' => $this->default_expense_account_id,
            'default_tax_code_id'        => $this->default_tax_code_id,

            'is_active'     => $this->is_active,
            'is_blocked'    => $this->is_blocked,
            'block_reason'  => $this->block_reason,
            'can_transact'  => $this->canTransact(),
            'notes'         => $this->notes,
            'created_at'    => $this->created_at?->toISOString(),

            'addresses'      => PartnerAddressResource::collection($this->whenLoaded('addresses')),
            'documents_count'=> $this->whenCounted('documents'),

            // Bakiye ayrı bir uçtan gelir; listede hesaplamak N+1 doğurur.
            'balance'        => $this->when(isset($this->balance_amount), fn () => round((float) $this->balance_amount, 2)),
        ];
    }
}
