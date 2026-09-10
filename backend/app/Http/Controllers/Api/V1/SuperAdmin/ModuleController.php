<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Services\ActivityLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ModuleController extends Controller
{
    public function __construct(private readonly ActivityLogService $activityLogService) {}

    public function index(): JsonResponse
    {
        $modules = Module::withCount(['companies as companies_count' => function ($q) {
            $q->where('company_modules.is_active', true);
        }])->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data'    => $modules->map(fn($m) => [
                'id'              => $m->id,
                'name'            => $m->name,
                'slug'            => $m->slug,
                'description'     => $m->description,
                'icon'            => $m->icon,
                'color'           => $m->color,
                'is_active'       => $m->is_active,
                'companies_count' => $m->companies_count,
                'total_records'   => $this->getModuleRecordCount($m->slug),
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'        => 'required|string|max:100',
            'description' => 'nullable|string',
            'color'       => 'nullable|string|max:20',
        ]);

        $slug = Str::slug($validated['name'], '_');

        // Slug çakışması varsa suffix ekle
        $baseSlug = $slug;
        $i = 1;
        while (Module::where('slug', $slug)->exists()) {
            $slug = "{$baseSlug}_{$i}";
            $i++;
        }

        $module = Module::create([
            'name'        => $validated['name'],
            'slug'        => $slug,
            'description' => $validated['description'] ?? null,
            'color'       => $validated['color'] ?? '#6366f1',
            'is_active'   => true,
            'order_index' => Module::max('order_index') + 1,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Departman oluşturuldu.',
            'data'    => $module,
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $module = Module::findOrFail($id);

        $validated = $request->validate([
            'is_active'   => 'sometimes|boolean',
            'name'        => 'sometimes|string|max:100',
            'description' => 'sometimes|string',
        ]);

        $wasActive = $module->is_active;

        $module->update($validated);

        Module::forgetActiveCache($module->slug);

        if (array_key_exists('is_active', $validated) && $wasActive !== $module->is_active) {
            $this->activityLogService->log(
                $module->is_active ? 'module.activated' : 'module.deactivated',
                $module,
                $request->user(),
                ['is_active' => $wasActive],
                ['is_active' => $module->is_active],
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'Modül güncellendi.',
            'data'    => $module->only(['id', 'name', 'slug', 'description', 'is_active']),
        ]);
    }

    private function getModuleRecordCount(string $slug): int
    {
        $modelMap = [
            'accounting'          => \App\Models\Modules\AccountingRecord::class,
            'marketing'           => \App\Models\Modules\MarketingRecord::class,
            'warehouse_manager'   => \App\Models\Modules\WarehouseRecord::class,
            'warehouse_controller'=> \App\Models\Modules\WarehouseRecord::class,
            'packaging'           => \App\Models\Modules\PackagingRecord::class,
            'returns'             => \App\Models\Modules\ReturnRecord::class,
            'customs'             => \App\Models\Modules\CustomsRecord::class,
            'shipping'            => \App\Models\Modules\ShippingRecord::class,
        ];

        $class = $modelMap[$slug] ?? null;
        if (!$class) return 0;

        return Cache::remember("module_count_{$slug}", 300, fn() => $class::withTrashed()->count());
    }
}
