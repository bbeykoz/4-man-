<?php

namespace App\Http\Requests\Modules;

use Illuminate\Foundation\Http\FormRequest;

class CreateRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Permission kontrolü controller'da yapılır
    }

    public function rules(): array
    {
        return [
            'title'         => ['required', 'string', 'max:255'],
            'description'   => ['nullable', 'string', 'max:5000'],
            'type'          => ['nullable', 'string', 'max:50'],
            'status'        => ['nullable', 'string'],
            'priority'      => ['nullable', 'in:low,medium,high,critical'],
            'department_id' => ['nullable', 'uuid', 'exists:departments,id'],
            'due_date'      => ['nullable', 'date'],
            'meta'          => ['nullable', 'array'],

            // Muhasebe specific
            'category'            => ['nullable', 'string', 'max:100'],
            'paid_at'             => ['nullable', 'date'],
            'amount'              => ['nullable', 'numeric', 'min:0'],
            'currency'            => ['nullable', 'string', 'size:3'],
            'vendor'              => ['nullable', 'string', 'max:255'],
            'reference_number'    => ['nullable', 'string', 'max:100'],
            'transaction_date'    => ['nullable', 'date'],
            'vat_rate'            => ['nullable', 'numeric', 'min:0', 'max:100'],
            'vat_included'        => ['nullable', 'boolean'],
            'vat_amount'          => ['nullable', 'numeric', 'min:0'],
            'payment_method'      => ['nullable', 'string', 'in:cash,card,bank_transfer,check,other'],
            'exchange_rate'       => ['nullable', 'numeric', 'min:0'],
            'is_recurring'        => ['nullable', 'boolean'],
            'recurring_frequency' => ['nullable', 'string', 'in:weekly,monthly,yearly'],
            'recurring_end_date'  => ['nullable', 'date'],

            // Nakliye specific
            'tracking_number'      => ['nullable', 'string', 'max:100'],
            'carrier'              => ['nullable', 'string', 'max:100'],
            'origin_address'       => ['nullable', 'string', 'max:500'],
            'destination_address'  => ['nullable', 'string', 'max:500'],
            'vehicle_plate'        => ['nullable', 'string', 'max:20'],
            'driver_name'          => ['nullable', 'string', 'max:100'],
            'estimated_delivery'   => ['nullable', 'date'],

            // Marketing specific
            'channel'         => ['nullable', 'string', 'max:50'],
            'budget'          => ['nullable', 'numeric', 'min:0'],
            'spent_amount'    => ['nullable', 'numeric', 'min:0'],
            'start_date'      => ['nullable', 'date'],
            'end_date'        => ['nullable', 'date'],
            'target_audience' => ['nullable', 'string', 'max:255'],
            'goal_type'       => ['nullable', 'string', 'max:50'],
            'goal_value'      => ['nullable', 'integer', 'min:0'],
            'ad_url'          => ['nullable', 'string', 'max:500'],
            'impressions'     => ['nullable', 'integer', 'min:0'],
            'clicks'          => ['nullable', 'integer', 'min:0'],
            'conversions'     => ['nullable', 'integer', 'min:0'],
            'assigned_to'     => ['nullable', 'uuid', 'exists:users,id'],

            // Depo specific
            'product_name'   => ['nullable', 'string', 'max:255'],
            'sku'            => ['nullable', 'string', 'max:100'],
            'quantity'       => ['nullable', 'numeric', 'min:0'],
            'unit'           => ['nullable', 'string', 'max:20'],
            'location'       => ['nullable', 'string', 'max:100'],
            'batch_number'   => ['nullable', 'string', 'max:100'],
            'expiry_date'    => ['nullable', 'date'],
            'from_location'  => ['nullable', 'string', 'max:100'],
            'to_location'    => ['nullable', 'string', 'max:100'],
            'product_id'     => ['nullable', 'uuid'],
            'transaction_date' => ['nullable', 'date'],

            // Paketleme specific
            'order_number'      => ['nullable', 'string', 'max:100'],
            'customer_name'     => ['nullable', 'string', 'max:255'],
            'item_count'        => ['nullable', 'integer', 'min:0'],
            'package_type'      => ['nullable', 'string', 'max:50'],
            'weight'            => ['nullable', 'numeric', 'min:0'],
            'dimensions'        => ['nullable', 'string', 'max:100'],
            'shipping_company'  => ['nullable', 'string', 'max:100'],
            'shipping_tracking' => ['nullable', 'string', 'max:100'],
            'shipping_date'     => ['nullable', 'date'],
            'address'           => ['nullable', 'string', 'max:500'],
            'city'              => ['nullable', 'string', 'max:100'],
            'country'           => ['nullable', 'string', 'max:5'],
            'packed_by'         => ['nullable', 'uuid', 'exists:users,id'],
            'items'             => ['nullable', 'array'],
            'items.*.product_name' => ['required_with:items', 'string', 'max:255'],
            'items.*.quantity'  => ['nullable', 'numeric', 'min:0'],
            'items.*.unit'      => ['nullable', 'string', 'max:20'],
            'desi'              => ['nullable', 'numeric', 'min:0'],
            'package_barcode'   => ['nullable', 'string', 'max:100'],
            'width'             => ['nullable', 'numeric', 'min:0'],
            'height'            => ['nullable', 'numeric', 'min:0'],
            'depth'             => ['nullable', 'numeric', 'min:0'],

            // İade specific
            'return_outcome' => ['nullable', 'string', 'in:refund,exchange,repair,cancel'],
            'rma_number'     => ['nullable', 'string', 'max:100'],
            'reviewed_by'    => ['nullable', 'uuid', 'exists:users,id'],

            // Nakliye specific
            'transport_mode'  => ['nullable', 'string', 'in:road,air,sea,rail'],
            'recipient_name'  => ['nullable', 'string', 'max:255'],
            'recipient_phone' => ['nullable', 'string', 'max:50'],
            'departure_date'  => ['nullable', 'date'],
            'actual_delivery' => ['nullable', 'date'],
            'pallet_count'    => ['nullable', 'integer', 'min:0'],
            'fuel_cost'       => ['nullable', 'numeric', 'min:0'],
            'driver_cost'     => ['nullable', 'numeric', 'min:0'],
            'extra_cost'      => ['nullable', 'numeric', 'min:0'],

            // Gümrük specific
            'company_name'       => ['nullable', 'string', 'max:255'],
            'tax_number'         => ['nullable', 'string', 'max:50'],
            'customs_agent'      => ['nullable', 'string', 'max:255'],
            'incoterms'          => ['nullable', 'string', 'max:10'],
            'transport_type'     => ['nullable', 'string', 'in:sea,air,road,rail'],
            'carrier_name'       => ['nullable', 'string', 'max:255'],
            'container_number'   => ['nullable', 'string', 'max:100'],
            'bl_number'          => ['nullable', 'string', 'max:100'],
            'other_taxes'        => ['nullable', 'numeric', 'min:0'],
            'net_weight'         => ['nullable', 'numeric', 'min:0'],
            'gross_weight'       => ['nullable', 'numeric', 'min:0'],
            'origin_country'     => ['nullable', 'string', 'max:100'],
            'destination_country'=> ['nullable', 'string', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Başlık zorunludur.',
        ];
    }
}
