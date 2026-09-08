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

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.departments.create'), 403);

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

    public function destroy(Request $request, string $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('company.departments.delete'), 403);

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
}
