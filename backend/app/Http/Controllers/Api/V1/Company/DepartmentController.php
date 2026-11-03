<?php

namespace App\Http\Controllers\Api\V1\Company;

use App\Http\Controllers\Controller;
use App\Http\Resources\DepartmentResource;
use App\Models\Department;
use App\Services\ActivityLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DepartmentController extends Controller
{
    public function __construct(private readonly ActivityLogService $activityLogService) {}

    public function list(Request $request): JsonResponse
    {
        $departments = Department::where('company_id', $request->user()->company_id)
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['success' => true, 'data' => $departments]);
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.departments.view'), 403);

        $departments = Department::where('company_id', $request->user()->company_id)
            ->with(['manager'])
            ->withCount('users')
            ->ordered()
            ->get();

        return response()->json(['success' => true, 'data' => DepartmentResource::collection($departments)]);
    }

    /**
     * Yeni departman yalnızca platform tarafından açılır.
     * Departmanlar hizmetin modülleridir; şirket sahibi kendi başına yeni modül ekleyemez,
     * mevcut departmanları düzenleyebilir ve kullanıcılarını yönetebilir.
     */
    public function store(Request $request): JsonResponse
    {
        if ($denied = $this->denyNonPlatform($request, 'açma', 'DEPARTMENT_CREATE_RESTRICTED')) {
            return $denied;
        }

        $request->validate([
            'name'        => ['required', 'string', 'max:100'],
            'type'        => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string', 'max:500'],
            'color'       => ['nullable', 'string'],
            'manager_id'  => ['nullable', 'uuid', 'exists:users,id'],
        ]);

        $dept = Department::create([
            'company_id'  => $request->user()->company_id,
            'name'        => $request->name,
            'slug'        => Str::slug($request->name),
            'type'        => $request->type,
            'description' => $request->description,
            'color'       => $request->color ?? 'blue',
            'manager_id'  => $request->manager_id,
            'status'      => 'active',
        ]);

        $this->activityLogService->log('department.created', $dept, $request->user());

        return response()->json([
            'success' => true,
            'data'    => new DepartmentResource($dept->load('manager')),
            'message' => 'Departman oluşturuldu.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $dept = Department::where('company_id', $request->user()->company_id)
            ->with(['manager', 'users.roles'])
            ->withCount('users')
            ->findOrFail($id);

        return response()->json(['success' => true, 'data' => new DepartmentResource($dept)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.departments.edit'), 403);

        $dept = Department::where('company_id', $request->user()->company_id)->findOrFail($id);

        $request->validate([
            'name'        => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:500'],
            'color'       => ['nullable', 'string'],
            'manager_id'  => ['nullable', 'uuid', 'exists:users,id'],
            'status'      => ['nullable', 'in:active,inactive'],
        ]);

        $dept->update($request->only(['name', 'description', 'color', 'manager_id', 'status']));
        $this->activityLogService->log('department.updated', $dept, $request->user());

        return response()->json([
            'success' => true,
            'data'    => new DepartmentResource($dept->fresh('manager')),
            'message' => 'Departman güncellendi.',
        ]);
    }

    /**
     * Departman silme de platforma aittir: açma yetkisi platformdaysa kapatma da orada olmalı.
     * Şirket tarafı departmanı "Pasif" duruma alarak kullanım dışı bırakabilir (update).
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($denied = $this->denyNonPlatform($request, 'silme', 'DEPARTMENT_DELETE_RESTRICTED')) {
            return $denied;
        }

        $dept = Department::where('company_id', $request->user()->company_id)->findOrFail($id);

        if ($dept->users()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Bu departmana bağlı kullanıcılar var. Önce kullanıcıları taşıyın.',
            ], 422);
        }

        $dept->delete();
        $this->activityLogService->log('department.deleted', $dept, $request->user());

        return response()->json(['success' => true, 'message' => 'Departman silindi.']);
    }

    /**
     * Departman açma/silme platform ekibine aittir. Uygunsa null döner, değilse hazır 403 yanıtı.
     *
     * Platform ekibi bu işlemleri şirket paneline bağlanarak yapar; o oturumda jeton şirket
     * sahibine aittir, bu yüzden isPlatformUser() değil actsAsPlatform() kontrol edilir.
     * Şirket kaydı olmayan bir istek departmanı sahipsiz oluşturacağından ayrıca engellenir.
     */
    private function denyNonPlatform(Request $request, string $action, string $code): ?JsonResponse
    {
        $user = $request->user();

        if (!$user->actsAsPlatform()) {
            $hint = $action === 'silme'
                ? 'Departmanı pasife alabilir veya destek üzerinden talep açabilirsiniz.'
                : 'Talebinizi destek üzerinden iletin.';

            return response()->json([
                'success' => false,
                'message' => "Departman {$action} yetkisi platform ekibindedir. {$hint}",
                'code'    => $code,
            ], 403);
        }

        if (!$user->isImpersonatedByPlatform()
            && !($user->isSuperAdmin() || $user->hasPermission('platform.modules.manage'))) {
            abort(403);
        }

        if ($user->company_id === null) {
            return response()->json([
                'success' => false,
                'message' => 'Bu işlem için şirket panelinde olmanız gerekir. Şirketler sayfasından ilgili şirkete bağlanın.',
                'code'    => 'DEPARTMENT_COMPANY_CONTEXT_REQUIRED',
            ], 422);
        }

        return null;
    }
}
