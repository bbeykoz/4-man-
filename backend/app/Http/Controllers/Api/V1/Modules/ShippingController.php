<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Models\Modules\ShippingRecord;

class ShippingController extends BaseModuleController
{
    protected string $module            = 'shipping';
    protected string $viewPermission    = 'shipping.records.view';
    protected string $createPermission  = 'shipping.records.create';
    protected string $editPermission    = 'shipping.records.edit';
    protected string $deletePermission  = 'shipping.records.delete';
    protected string $approvePermission = 'shipping.records.approve';

    protected function getModelClass(): string
    {
        return ShippingRecord::class;
    }
}
