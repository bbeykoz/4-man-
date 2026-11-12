<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Services\Platform\PlatformAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Platform panelindeki iki rapor: kendi ekibimiz ve kiracı şirketler. */
class PlatformAnalyticsController extends Controller
{
    public function __construct(private readonly PlatformAnalyticsService $analytics) {}

    public function staff(Request $request): JsonResponse
    {
        $filtre = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to'   => ['nullable', 'date'],
            'days'      => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        return response()->json(['success' => true, 'data' => $this->analytics->staff($filtre)]);
    }

    public function staffDetail(Request $request, string $id): JsonResponse
    {
        $filtre = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to'   => ['nullable', 'date'],
            'days'      => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        return response()->json(['success' => true, 'data' => $this->analytics->staffDetail($id, $filtre)]);
    }

    public function companies(Request $request): JsonResponse
    {
        $filtre = $request->validate([
            'date_from'  => ['nullable', 'date'],
            'date_to'    => ['nullable', 'date'],
            'days'       => ['nullable', 'integer', 'min:1', 'max:365'],
            'bucket'     => ['nullable', 'in:day,week,month'],
            'company_id' => ['nullable', 'uuid'],
        ]);

        return response()->json(['success' => true, 'data' => $this->analytics->companies($filtre)]);
    }
}
