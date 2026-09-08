<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Models\Modules\CustomsRecord;

class CustomsController extends BaseModuleController
{
    protected string $module            = 'customs';
    protected string $viewPermission    = 'customs.records.view';
    protected string $createPermission  = 'customs.records.create';
    protected string $editPermission    = 'customs.records.edit';
    protected string $deletePermission  = 'customs.records.delete';
    protected string $approvePermission = 'customs.records.approve';

    protected function getModelClass(): string
    {
        return CustomsRecord::class;
    }
}
