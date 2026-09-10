<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Models\Modules\PackagingRecord;

class PackagingController extends BaseModuleController
{
    protected string $module            = 'packaging';
    protected string $viewPermission    = 'packaging.records.view';
    protected string $createPermission  = 'packaging.records.create';
    protected string $editPermission    = 'packaging.records.edit';
    protected string $deletePermission  = 'packaging.records.delete';
    protected string $approvePermission = 'packaging.records.approve';

    protected function getModelClass(): string
    {
        return PackagingRecord::class;
    }
}
