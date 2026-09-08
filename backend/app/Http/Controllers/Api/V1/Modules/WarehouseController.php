<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Exports\WarehouseTemplateExport;
use App\Imports\WarehouseImport;
use App\Models\Modules\WarehouseRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class WarehouseController extends BaseModuleController
{
    protected string $module            = 'warehouse';
    protected string $viewPermission    = 'warehouse.records.view';
    protected string $createPermission  = 'warehouse.records.create';
    protected string $editPermission    = 'warehouse.records.edit';
    protected string $deletePermission  = 'warehouse.records.delete';
    protected string $approvePermission = 'warehouse.records.approve';

    protected function getModelClass(): string
    {
        return WarehouseRecord::class;
    }

    public function import(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission($this->createPermission), 403);

        $request->validate([
            'file'        => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:10240'],
            'period_type' => ['required', 'in:daily,weekly,monthly'],
        ]);

        $import = new WarehouseImport(
            companyId:  $request->user()->company_id,
            createdBy:  $request->user()->id,
            periodType: $request->input('period_type'),
        );

        Excel::import($import, $request->file('file'));

        $this->activityLogService->log('warehouse.records.imported', null, $request->user(), newValues: [
            'count'       => $import->getImportedCount(),
            'period_type' => $request->input('period_type'),
        ]);

        return response()->json([
            'success'  => true,
            'message'  => "{$import->getImportedCount()} kayıt başarıyla içe aktarıldı.",
            'imported' => $import->getImportedCount(),
            'errors'   => $import->getErrors(),
        ]);
    }

    public function downloadTemplate(): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        return Excel::download(new WarehouseTemplateExport(), 'depo-sablonu.xlsx');
    }
}
