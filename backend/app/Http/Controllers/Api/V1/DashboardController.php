<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\DashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private readonly DashboardService $dashboardService) {}

    public function superAdmin(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        return response()->json([
            'success' => true,
            'data'    => $this->dashboardService->getSuperAdminStats(),
        ]);
    }

    public function company(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'success' => true,
            'data'    => $this->dashboardService->getCompanyStats($user->company_id),
        ]);
    }

    public function recentActivity(Request $request): JsonResponse
    {
        $user = $request->user();

        // company_id ile eşleşen VEYA şirket kullanıcısı tarafından yapılan logları getir
        $companyUserIds = \App\Models\User::where('company_id', $user->company_id)->pluck('id');

        $logs = \App\Models\ActivityLog::where(function ($q) use ($user, $companyUserIds) {
                $q->where('company_id', $user->company_id)
                  ->orWhereIn('user_id', $companyUserIds);
            })
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->limit(15)
            ->get();

        return response()->json([
            'success' => true,
            'data'    => \App\Http\Resources\ActivityLogResource::collection($logs),
        ]);
    }

    public function module(Request $request, string $module): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'success' => true,
            'data'    => $this->dashboardService->getModuleStats($user->company_id, $module),
        ]);
    }
}
