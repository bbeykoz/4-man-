<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'record_number' => $this->record_number,
            'title'         => $this->title,
            'description'   => $this->description,
            'type'          => $this->type ?? null,
            'status'        => $this->status instanceof \BackedEnum ? $this->status->value : $this->status,
            'status_label'  => $this->status instanceof \App\Enums\RecordStatus ? $this->status->label() : null,
            'status_color'  => $this->status instanceof \App\Enums\RecordStatus ? $this->status->color() : null,
            'priority'      => $this->priority instanceof \BackedEnum ? $this->priority->value : $this->priority,
            'priority_label'=> $this->priority instanceof \App\Enums\Priority ? $this->priority->label() : null,
            'priority_color'=> $this->priority instanceof \App\Enums\Priority ? $this->priority->color() : null,
            'company_id'    => $this->company_id,
            'department_id' => $this->department_id,
            'due_date'      => $this->due_date?->toDateString(),
            'completed_at'  => $this->completed_at?->toISOString(),
            'created_at'    => $this->created_at->toISOString(),
            'updated_at'    => $this->updated_at->toISOString(),
            'meta'          => $this->meta ?? [],

            // Module-specific fields (merges all present)
            ...$this->getModuleFields(),
            ...$this->getQualityCheckFields(),
            ...$this->getStockLedgerFields(),

            // Relations
            'created_by'    => $this->whenLoaded('createdBy', fn() => new UserResource($this->createdBy)),
            'updated_by'    => $this->whenLoaded('updatedBy', fn() => new UserResource($this->updatedBy)),
            'operator'      => $this->whenLoaded('operator', fn() => new UserResource($this->operator)),
            'assigned_to'   => $this->whenLoaded('assignedTo', fn() => $this->assignedTo ? new UserResource($this->assignedTo) : null),
            'packed_by'     => $this->whenLoaded('packedBy', fn() => $this->packedBy ? new UserResource($this->packedBy) : null),
            'reviewed_by'   => $this->whenLoaded('reviewedBy', fn() => $this->reviewedBy ? new UserResource($this->reviewedBy) : null),
            'product'       => $this->whenLoaded('product', fn() => $this->product ? [
                'id'            => $this->product->id,
                'name'          => $this->product->name,
                'sku'           => $this->product->sku,
                'barcode'       => $this->product->barcode,
                'unit'          => $this->product->unit,
                'unit_price'    => $this->product->unit_price,
                'current_stock' => $this->product->current_stock,
            ] : null),
            'department'    => $this->whenLoaded('department', fn() => new DepartmentResource($this->department)),
            'comments_count'    => $this->whenCounted('comments'),
            'attachments_count' => $this->whenCounted('attachments'),
        ];
    }

    /** Depo kayıtlarının kalite kontrol bilgisi (dosya yolu dışarı verilmez). */
    private function getQualityCheckFields(): array
    {
        if (!array_key_exists('qc_status', $this->resource->getAttributes())) {
            return [];
        }

        return [
            'qc_status'          => $this->qc_status,
            'qc_has_photo'       => !empty($this->qc_photo_path),
            'qc_checked_at'      => $this->qc_checked_at?->toISOString(),
            'qc_checked_by_name' => $this->relationLoaded('qcCheckedBy') ? $this->qcCheckedBy?->name : null,
            // Teslim imzası (görselin kendisi ayrı uçtan çekilir)
            'has_signature'      => !empty($this->signature_path),
            'signed_by_name'     => $this->signed_by_name,
            'signed_at'          => $this->signed_at?->toISOString(),
            'signed_by_user'     => $this->relationLoaded('signedBy') ? $this->signedBy?->name : null,
        ];
    }

    /** Depo kayıtlarının stok defteri bilgisi (depo, yön, işlenme durumu). */
    private function getStockLedgerFields(): array
    {
        if (!array_key_exists('posted_at', $this->resource->getAttributes())) {
            return [];
        }

        return [
            'warehouse_id'      => $this->warehouse_id,
            'warehouse_name'    => $this->relationLoaded('warehouse') ? $this->warehouse?->name : null,
            'to_warehouse_id'   => $this->to_warehouse_id,
            'to_warehouse_name' => $this->relationLoaded('toWarehouse') ? $this->toWarehouse?->name : null,
            'direction'         => $this->direction,
            'system_quantity'   => $this->system_quantity,
            'posted_at'         => $this->posted_at?->toISOString(),
            'reversed_at'       => $this->reversed_at?->toISOString(),
            'product_id'        => $this->product_id,
        ];
    }

    private function getModuleFields(): array
    {
        $fields = [];

        $optionalFields = [
            'amount', 'currency', 'vendor', 'reference_number', 'category',
            'transaction_date', 'paid_at', 'vat_rate', 'vat_included', 'vat_amount',
            'payment_method', 'exchange_rate',
            'is_recurring', 'recurring_frequency', 'recurring_end_date',
            'tracking_number', 'carrier', 'origin_address', 'destination_address',
            'vehicle_plate', 'driver_name', 'estimated_delivery',
            'transport_mode', 'recipient_name', 'recipient_phone',
            'departure_date', 'actual_delivery', 'pallet_count',
            'fuel_cost', 'driver_cost', 'extra_cost',
            'product_name', 'sku', 'quantity', 'unit', 'location', 'from_location', 'to_location', 'batch_number', 'expiry_date', 'transaction_date',
            'order_number', 'customer_name', 'budget', 'spent_amount', 'channel',
            'goal_type', 'goal_value', 'ad_url', 'impressions', 'clicks', 'conversions',
            'target_audience',
            'declaration_number', 'hs_code', 'country_of_origin', 'port_of_entry',
            'declared_value', 'customs_duty', 'start_date', 'end_date',
            'company_name', 'tax_number', 'customs_agent', 'incoterms',
            'transport_type', 'carrier_name', 'container_number', 'bl_number',
            'other_taxes', 'net_weight', 'gross_weight', 'origin_country', 'destination_country',
            'item_count', 'package_type', 'weight', 'dimensions',
            'shipping_company', 'shipping_tracking', 'shipping_date',
            'address', 'city', 'country', 'items', 'desi', 'package_barcode',
            'width', 'height', 'depth',
            'reason', 'refund_amount', 'condition',
            'return_outcome', 'rma_number',
        ];

        foreach ($optionalFields as $field) {
            if (isset($this->resource->$field)) {
                $fields[$field] = $this->resource->$field;
            }
        }

        return $fields;
    }
}
