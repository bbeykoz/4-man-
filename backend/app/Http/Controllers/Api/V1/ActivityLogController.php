<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ActivityLogResource;
use App\Repositories\ActivityLogRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function __construct(private readonly ActivityLogRepository $logRepository) {}

    public function index(Request $request): JsonResponse
    {
        $user    = $request->user();
        $filters = array_merge(
            $request->only(['user_id', 'action', 'model_type', 'date_from', 'date_to']),
            ['company_id' => $user->company_id]
        );

        $logs = $this->logRepository->paginate(
            perPage: $request->integer('per_page', 20),
            filters: $filters,
        );

        return response()->json([
            'success' => true,
            'data'    => ActivityLogResource::collection($logs->items()),
            'meta'    => ['current_page' => $logs->currentPage(), 'total' => $logs->total()],
        ]);
    }

    public function globalIndex(Request $request): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);

        $logs = $this->logRepository->paginate(
            perPage: $request->integer('per_page', 20),
            filters: $request->only(['user_id', 'company_id', 'action', 'date_from', 'date_to']),
        );

        return response()->json([
            'success' => true,
            'data'    => ActivityLogResource::collection($logs->items()),
            'meta'    => ['current_page' => $logs->currentPage(), 'total' => $logs->total()],
        ]);
    }
}
