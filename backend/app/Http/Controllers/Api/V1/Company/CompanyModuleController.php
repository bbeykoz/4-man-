<?php

namespace App\Http\Controllers\Api\V1\Company;

use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class CompanyModuleController extends Controller
{
    public function index(): JsonResponse
    {
        $company = Auth::user()->company;

        $modules = Module::where('is_active', true)
            ->with(['companyModule' => fn($q) => $q->where('company_id', $company->id)])
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $modules->map(function ($module) use ($company) {
                $pivot = $module->companyModule;
                return [
                    'id'           => $module->id,
                    'name'         => $module->name,
                    'slug'         => $module->slug,
                    'description'  => $module->description,
                    'icon'         => $module->icon,
                    'color'        => $module->color,
                    'is_active'    => $pivot?->is_active ?? false,
                    'records_count'=> $this->getCompanyModuleCount($module->slug, $company->id),
                    'activated_at' => $pivot?->created_at,
                ];
            }),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $company = Auth::user()->company;
        $module  = Module::findOrFail($id);

        $validated = $request->validate(['is_active' => 'required|boolean']);

        $company->modules()->syncWithoutDetaching([$module->id => [
            'is_active' => $validated['is_active'],
        ]]);

        Cache::forget("company_{$company->id}_module_{$module->slug}");

        $status = $validated['is_active'] ? 'aktifleştirildi' : 'devre dışı bırakıldı';

        return response()->json(['success' => true, 'message' => "Modül {$status}."]);
    }

    private function getCompanyModuleCount(string $slug, string $companyId): int
    {
        $modelMap = [
            'accounting'           => \App\Models\Modules\AccountingRecord::class,
            'marketing'            => \App\Models\Modules\MarketingRecord::class,
            'warehouse_manager'    => \App\Models\Modules\WarehouseRecord::class,
            'warehouse_controller' => \App\Models\Modules\WarehouseRecord::class,
            'packaging'            => \App\Models\Modules\PackagingRecord::class,
            'returns'              => \App\Models\Modules\ReturnRecord::class,
            'customs'              => \App\Models\Modules\CustomsRecord::class,
            'shipping'             => \App\Models\Modules\ShippingRecord::class,
        ];

        $class = $modelMap[$slug] ?? null;
        if (!$class) return 0;

        return Cache::remember("company_{$companyId}_records_{$slug}", 300, fn() => $class::where('company_id', $companyId)->count());
    }
}
