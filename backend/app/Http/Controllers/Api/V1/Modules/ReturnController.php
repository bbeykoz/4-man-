<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Models\Modules\ReturnRecord;

class ReturnController extends BaseModuleController
{
    protected string $module            = 'return';
    protected string $viewPermission    = 'return.records.view';
    protected string $createPermission  = 'return.records.create';
    protected string $editPermission    = 'return.records.edit';
    protected string $deletePermission  = 'return.records.delete';
    protected string $approvePermission = 'return.records.approve';

    protected function getModelClass(): string
    {
        return ReturnRecord::class;
    }
}
