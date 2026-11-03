<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\DailyCheckTask;
use App\Models\DailyTaskCheck;
use App\Models\ProductDailyCheck;
use App\Models\WarehouseProduct;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Günlük kontrol listesi: depo/üretim alanındaki ürünlerin ve şirketin tanımladığı genel
 * görevlerin her gün kontrol edilip edilmediğini kaydeder. Geçmiş günler görüntülenebilir/
 * düzenlenebilir; varsayılan gün bugündür.
 */
class DailyCheckController extends Controller
{
    private const VIEW_PERM = 'warehouse.records.view';
    private const EDIT_PERM = 'warehouse.records.edit';

    /** Seçilen güne ait ürün + görev listesini, kontrol durumlarıyla birlikte döner. */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePerm($request, self::VIEW_PERM);

        $companyId = $request->user()->company_id;
        $date      = $this->resolveDate($request->input('date'));

        $products = WarehouseProduct::forCompany($companyId)->active()->orderBy('name')->get(['id', 'name', 'sku', 'unit', 'category']);
        $productChecks = ProductDailyCheck::where('company_id', $companyId)
            ->where('check_date', $date)
            ->with('checkedBy:id,name')
            ->get()
            ->keyBy('product_id');

        $tasks = DailyCheckTask::forCompany($companyId)->active()->orderBy('sort_order')->orderBy('created_at')->get();
        $taskChecks = DailyTaskCheck::where('company_id', $companyId)
            ->where('check_date', $date)
            ->with('checkedBy:id,name')
            ->get()
            ->keyBy('task_id');

        $productItems = $products->map(function (WarehouseProduct $p) use ($productChecks) {
            $check = $productChecks->get($p->id);
            return $this->presentCheckable($p->id, $p->name, $p->sku, $check);
        })->values();

        $taskItems = $tasks->map(function (DailyCheckTask $t) use ($taskChecks) {
            $check = $taskChecks->get($t->id);
            return [...$this->presentCheckable($t->id, $t->title, null, $check), 'description' => $t->description];
        })->values();

        return response()->json([
            'success' => true,
            'data' => [
                'date'     => $date,
                'products' => $productItems,
                'tasks'    => $taskItems,
                'summary'  => [
                    'products_total'   => $productItems->count(),
                    'products_checked' => $productItems->where('is_checked', true)->count(),
                    'tasks_total'      => $taskItems->count(),
                    'tasks_checked'    => $taskItems->where('is_checked', true)->count(),
                ],
            ],
        ]);
    }

    /** Bir ürünün seçilen gündeki kontrol durumunu kaydeder (işaretle / kaldır). */
    public function checkProduct(Request $request, string $productId): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $companyId = $request->user()->company_id;

        $product = WarehouseProduct::forCompany($companyId)->findOrFail($productId);
        $data    = $this->validateCheck($request);

        $check = $this->upsertCheck(ProductDailyCheck::class, [
            'company_id' => $companyId,
            'product_id' => $product->id,
            'check_date' => $data['date'],
        ], $data, $request->user()->id);

        return response()->json([
            'success' => true,
            'data'    => $this->presentCheckable($product->id, $product->name, $product->sku, $check),
            'message' => $data['checked'] ? 'Ürün kontrol edildi olarak işaretlendi.' : 'Ürünün kontrol işareti kaldırıldı.',
        ]);
    }

    /** Bir görevin seçilen gündeki kontrol durumunu kaydeder. */
    public function checkTask(Request $request, string $taskId): JsonResponse
    {
        $this->authorizePerm($request, self::EDIT_PERM);
        $companyId = $request->user()->company_id;

        $task = DailyCheckTask::forCompany($companyId)->findOrFail($taskId);
        $data = $this->validateCheck($request);

        $check = $this->upsertCheck(DailyTaskCheck::class, [
            'company_id' => $companyId,
            'task_id'    => $task->id,
            'check_date' => $data['date'],
        ], $data, $request->user()->id);

        return response()->json([
            'success' => true,
            'data'    => [...$this->presentCheckable($task->id, $task->title, null, $check), 'description' => $task->description],
            'message' => $data['checked'] ? 'Görev tamamlandı olarak işaretlendi.' : 'Görevin tamamlanma işareti kaldırıldı.',
        ]);
    }

    /** Yeni genel görev tanımı ekler. */
    public function storeTask(Request $request): JsonResponse
    {
        $this->authorizeOwner($request);
        $companyId = $request->user()->company_id;

        $data = $request->validate([
            'title'       => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
        ], [
            'title.required' => 'Görev başlığı zorunludur.',
        ]);

        $maxOrder = DailyCheckTask::forCompany($companyId)->max('sort_order') ?? 0;

        $task = DailyCheckTask::create([
            'company_id'  => $companyId,
            'title'       => $data['title'],
            'description' => $data['description'] ?? null,
            'sort_order'  => $maxOrder + 1,
            'is_active'   => true,
            'created_by'  => $request->user()->id,
        ]);

        return response()->json([
            'success' => true,
            'data'    => [...$this->presentCheckable($task->id, $task->title, null, null), 'description' => $task->description],
            'message' => 'Görev eklendi.',
        ], 201);
    }

    /** Görev başlığını/açıklamasını günceller ya da pasife alır. */
    public function updateTask(Request $request, string $id): JsonResponse
    {
        $this->authorizeOwner($request);
        $companyId = $request->user()->company_id;

        $task = DailyCheckTask::forCompany($companyId)->findOrFail($id);

        $data = $request->validate([
            'title'       => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active'   => ['sometimes', 'boolean'],
        ]);

        $task->update($data);

        return response()->json(['success' => true, 'message' => 'Görev güncellendi.']);
    }

    /** Görevi kalıcı olarak kaldırır (geçmiş kontrol kayıtlarıyla birlikte). */
    public function destroyTask(Request $request, string $id): JsonResponse
    {
        $this->authorizeOwner($request);
        $companyId = $request->user()->company_id;

        $task = DailyCheckTask::forCompany($companyId)->findOrFail($id);
        $task->delete();

        return response()->json(['success' => true, 'message' => 'Görev kaldırıldı.']);
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    private function validateCheck(Request $request): array
    {
        $data = $request->validate([
            'date'    => ['required', 'date'],
            'checked' => ['required', 'boolean'],
            'note'    => ['nullable', 'string', 'max:500'],
        ]);

        return [
            'date'    => $this->resolveDate($data['date']),
            'checked' => (bool) $data['checked'],
            'note'    => $data['note'] ?? null,
        ];
    }

    /** @param class-string<ProductDailyCheck|DailyTaskCheck> $modelClass */
    private function upsertCheck(string $modelClass, array $keys, array $data, string $userId): ProductDailyCheck|DailyTaskCheck
    {
        return $modelClass::updateOrCreate($keys, [
            'is_checked' => $data['checked'],
            'note'       => $data['note'],
            'checked_by' => $data['checked'] ? $userId : null,
            'checked_at' => $data['checked'] ? now() : null,
        ])->load('checkedBy:id,name');
    }

    private function presentCheckable(string $id, string $title, ?string $sku, ProductDailyCheck|DailyTaskCheck|null $check): array
    {
        return [
            'id'              => $id,
            'title'           => $title,
            'sku'             => $sku,
            'is_checked'      => (bool) ($check?->is_checked),
            'note'            => $check?->note,
            'checked_by_name' => $check?->checkedBy?->name,
            'checked_at'      => $check?->checked_at?->toISOString(),
        ];
    }

    /** "YYYY-MM-DD" doğrular; boş/geçersizse bugünü döner. Gelecek tarihe izin vermez. */
    private function resolveDate(?string $raw): string
    {
        try {
            $date = $raw ? Carbon::parse($raw) : Carbon::today();
        } catch (\Throwable) {
            $date = Carbon::today();
        }

        return $date->min(Carbon::today())->format('Y-m-d');
    }

    private function authorizePerm(Request $request, string $permission): void
    {
        abort_unless($request->user()->hasPermission($permission), 403);
        abort_unless($request->user()->company_id, 422, 'Bu hesap bir şirkete bağlı değil. Günlük kontrol için şirket kullanıcısıyla giriş yapın.');
    }

    /** Genel görevleri tanımlamak (ekleme/düzenleme/silme) sadece şirket sahibine/süper adminine açıktır. */
    private function authorizeOwner(Request $request): void
    {
        $user = $request->user();
        abort_unless($user->isSuperAdmin() || $user->isCompanyOwner(), 403, 'Bu işlem için yetkiniz yok. Genel görevleri yalnızca şirket sahibi düzenleyebilir.');
        abort_unless($user->company_id, 422, 'Bu hesap bir şirkete bağlı değil. Günlük kontrol için şirket kullanıcısıyla giriş yapın.');
    }
}
