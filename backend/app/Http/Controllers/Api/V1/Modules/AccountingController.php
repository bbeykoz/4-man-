<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Exports\AccountingTemplateExport;
use App\Imports\AccountingImport;
use App\Models\Modules\AccountingRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class AccountingController extends BaseModuleController
{
    protected string $module            = 'accounting';
    protected string $viewPermission    = 'accounting.records.view';
    protected string $createPermission  = 'accounting.records.create';
    protected string $editPermission    = 'accounting.records.edit';
    protected string $deletePermission  = 'accounting.records.delete';
    protected string $approvePermission = 'accounting.records.approve';

    protected function getModelClass(): string
    {
        return AccountingRecord::class;
    }

    public function import(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission($this->createPermission), 403);

        $request->validate([
            'file'        => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:10240'],
            'period_type' => ['required', 'in:daily,weekly,monthly'],
        ]);

        $import = new AccountingImport(
            companyId:  $request->user()->company_id,
            createdBy:  $request->user()->id,
            periodType: $request->input('period_type'),
        );

        Excel::import($import, $request->file('file'));

        $this->activityLogService->log('accounting.records.imported', null, $request->user(), newValues: [
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
        return Excel::download(new AccountingTemplateExport(), 'muhasebe-sablonu.xlsx');
    }
}
