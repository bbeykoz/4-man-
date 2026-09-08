<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Models\Modules\MarketingRecord;

class MarketingController extends BaseModuleController
{
    protected string $module            = 'marketing';
    protected string $viewPermission    = 'marketing.records.view';
    protected string $createPermission  = 'marketing.records.create';
    protected string $editPermission    = 'marketing.records.edit';
    protected string $deletePermission  = 'marketing.records.delete';
    protected string $approvePermission = 'marketing.records.approve';

    protected function getModelClass(): string
    {
        return MarketingRecord::class;
    }
}
