<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentLineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'              => $this->id,
            'line_no'         => $this->line_no,
            'product_id'      => $this->product_id,
            'item_code'       => $this->item_code,
            'description'     => $this->description,
            'quantity'        => (string) $this->quantity,
            'unit'            => $this->unit,
            'unit_price'      => (string) $this->unit_price,
            'discount_rate'   => (float) $this->discount_rate,
            'discount_amount' => (string) $this->discount_amount,
            'net_amount'      => (string) $this->net_amount,
            'tax_code_id'     => $this->tax_code_id,
            'tax_code'        => $this->whenLoaded('taxCode', fn () => $this->taxCode?->code),
            'tax_rate'        => (float) $this->tax_rate,
            'tax_amount'      => (string) $this->tax_amount,
            'non_deductible_amount' => (string) $this->non_deductible_amount,
            'gross_amount'    => (string) $this->gross_amount,
            'account_id'      => $this->account_id,
            'account_code'    => $this->whenLoaded('account', fn () => $this->account?->code),
            'dimensions'      => $this->dimensions,
        ];
    }
}
