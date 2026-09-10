<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Http\Resources\CompanyResource;
use App\Http\Resources\DepartmentResource;
use App\Models\Department;
use App\Models\Role;
use App\Repositories\CompanyRepository;
use App\Services\CompanyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CompanyController extends Controller
{
    public function __construct(
        private readonly CompanyService $companyService,
        private readonly CompanyRepository $companyRepository,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $companies = $this->companyRepository->paginate(
            perPage: $request->integer('per_page', 15),
            filters: $request->only(['search', 'status', 'plan_type']),
        );

        return response()->json([
            'success' => true,
            'data'    => CompanyResource::collection($companies->items()),
            'meta'    => [
                'current_page' => $companies->currentPage(),
                'per_page'     => $companies->perPage(),
                'total'        => $companies->total(),
                'last_page'    => $companies->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name'           => ['required', 'string', 'max:100'],
            'email'          => ['nullable', 'email'],
            'phone'          => ['nullable', 'string'],
            'plan_type'      => ['nullable', 'in:basic,pro,enterprise'],
            'max_users'      => ['nullable', 'integer', 'min:1', 'max:9999'],
            'owner_name'     => ['required', 'string', 'max:255'],
            'owner_email'    => ['required', 'email', Rule::unique('users', 'email')->whereNull('deleted_at')],
            'owner_password' => ['required', 'string', 'min:8'],
        ]);

        $company = $this->companyService->create($request->all());

        return response()->json([
            'success' => true,
            'data'    => new CompanyResource($company),
            'message' => 'Şirket başarıyla oluşturuldu.',
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $company = $this->companyRepository->findOrFail($id, ['owner', 'modules', 'departments']);

        return response()->json([
            'success' => true,
            'data'    => new CompanyResource($company),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $company = $this->companyRepository->findOrFail($id);
        $updated = $this->companyService->update($company, $request->all());

        return response()->json([
            'success' => true,
            'data'    => new CompanyResource($updated),
            'message' => 'Şirket güncellendi.',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $company = $this->companyRepository->findOrFail($id);
        $this->companyRepository->delete($company);

        return response()->json(['success' => true, 'message' => 'Şirket silindi.']);
    }

    public function suspend(string $id): JsonResponse
    {
        $company = $this->companyRepository->findOrFail($id);
        $this->companyService->suspend($company);

        return response()->json(['success' => true, 'message' => 'Şirket askıya alındı.']);
    }

    public function activate(string $id): JsonResponse
    {
        $company = $this->companyRepository->findOrFail($id);
        $this->companyService->activate($company);

        return response()->json(['success' => true, 'message' => 'Şirket aktifleştirildi.']);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->companyRepository->getStats(),
        ]);
    }

    public function departments(string $id): JsonResponse
    {
        $this->companyRepository->findOrFail($id);

        $departments = Department::where('company_id', $id)
            ->withCount('users')
            ->ordered()
            ->get();

        return response()->json([
            'success' => true,
            'data'    => DepartmentResource::collection($departments),
        ]);
    }

    public function roles(string $id): JsonResponse
    {
        $this->companyRepository->findOrFail($id);

        $roles = Role::where(function ($q) use ($id) {
            $q->whereNull('company_id')->orWhere('company_id', $id);
        })
            ->orderBy('level')
            ->get(['id', 'name', 'display_name', 'level', 'color']);

        return response()->json([
            'success' => true,
            'data'    => $roles,
        ]);
    }
}
