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

        // Pasif departmanlar da listelenir; şirket onları açamaz
        $modules = Module::orderBy('name')->get();
        $pivots  = $company->modules()->get()->keyBy('id');

        return response()->json([
            'success' => true,
            'data'    => $modules->map(function ($module) use ($company, $pivots) {
                $pivot = $pivots->get($module->id)?->pivot;
                return [
                    'id'            => $module->id,
                    'name'          => $module->name,
                    'slug'          => $module->slug,
                    'description'   => $module->description,
                    'icon'          => $module->icon,
                    'color'         => $module->color,
                    'is_active'     => $module->is_active && (bool) ($pivot?->is_active ?? false),
                    'system_active' => $module->is_active,
                    'records_count' => $this->getCompanyModuleCount($module->slug, $company->id),
                    'activated_at'  => $pivot?->activated_at,
                ];
            }),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $company = Auth::user()->company;
        $module  = Module::findOrFail($id);

        $validated = $request->validate(['is_active' => 'required|boolean']);

        if ($validated['is_active'] && !$module->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'Bu departman sistem yöneticisi tarafından pasife alınmıştır.',
                'code'    => 'MODULE_PASSIVE',
            ], 422);
        }

        $company->modules()->syncWithoutDetaching([$module->id => [
            'is_active' => $validated['is_active'],
        ]]);

        Cache::forget("company_module_{$company->id}_{$module->slug}");

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
