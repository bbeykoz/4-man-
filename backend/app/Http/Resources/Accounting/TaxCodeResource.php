<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaxCodeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'code'               => $this->code,
            'name'               => $this->name,
            'name_local'         => $this->name_local,
            'display_name'       => $this->displayName(),
            'country_code'       => $this->country_code,
            'tax_type'           => $this->tax_type,
            'treatment'          => $this->treatment->value,
            'treatment_label'    => $this->treatment->label(),
            'rate'               => (float) $this->rate,
            'direction'          => $this->direction,
            'deductible_rate'    => (float) $this->deductible_rate,
            'has_partial_deduction' => $this->hasPartialDeduction(),

            'output_account_id'  => $this->output_account_id,
            'input_account_id'   => $this->input_account_id,
            'expense_account_id' => $this->expense_account_id,
            'report_box'         => $this->report_box,
            'saft_code'          => $this->saft_code,
            'eu_reportable'      => $this->eu_reportable,
            'affects_vat_return' => $this->affects_vat_return,

            'valid_from'         => $this->valid_from->toDateString(),
            'valid_to'           => $this->valid_to?->toDateString(),
            'is_effective_today' => $this->isEffectiveOn(now()->toDateString()),
            'legal_reference'    => $this->legal_reference,
            'approval_status'    => $this->approval_status,
            'is_approved'        => $this->isApproved(),
            'approved_at'        => $this->approved_at?->toISOString(),
            'is_default'         => $this->is_default,
            'description'        => $this->description,

            // Niteliğin davranışsal sonuçları; arayüz bunları açıklama olarak gösterir.
            'seller_charges'     => $this->treatment->sellerCharges(),
            'self_assessed'      => $this->treatment->isSelfAssessed(),
            'allows_deduction'   => $this->treatment->allowsInputDeduction(),
        ];
    }
}
