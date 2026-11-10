<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\AccountingPeriodResource;
use App\Models\Accounting\AccountingPeriod;
use App\Services\Accounting\PeriodService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountingPeriodController extends Controller
{
    public function __construct(private readonly PeriodService $service) {}

    public function index(Request $request): JsonResponse
    {
        $donemler = AccountingPeriod::where('company_id', $request->user()->company_id)
            ->when($request->filled('year'), fn ($q) => $q->whereYear('start_date', $request->integer('year')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->withCount('entries')
            ->orderBy('start_date')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => AccountingPeriodResource::collection($donemler),
        ]);
    }

    /** Bir mali yılın aylık dönemlerini üretir. */
    public function generate(Request $request): JsonResponse
    {
        $request->validate(['year' => ['required', 'integer', 'between:2000,2100']]);

        $eklenen = $this->service->generateYear($request->user()->company, $request->integer('year'));

        return response()->json([
            'success' => true,
            'data'    => ['created' => $eklenen],
            'message' => $eklenen > 0 ? "$eklenen dönem oluşturuldu." : 'Bu yılın dönemleri zaten tanımlı.',
        ], $eklenen > 0 ? 201 : 200);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $donem = $this->find($request, $id);

        return response()->json([
            'success' => true,
            'data'    => (new AccountingPeriodResource($donem))->additional(['totals' => $this->service->totals($donem)]),
            'totals'  => $this->service->totals($donem),
        ]);
    }

    public function startClosing(Request $request, string $id): JsonResponse
    {
        return $this->respond($this->service->startClosing($this->find($request, $id)), 'Dönem kapanış moduna alındı.');
    }

    public function close(Request $request, string $id): JsonResponse
    {
        return $this->respond($this->service->close($this->find($request, $id)), 'Dönem kapatıldı.');
    }

    public function reopen(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        return $this->respond(
            $this->service->reopen($this->find($request, $id), $request->string('reason')),
            'Dönem yeniden açıldı.',
        );
    }

    public function lock(Request $request, string $id): JsonResponse
    {
        return $this->respond($this->service->lock($this->find($request, $id)), 'Dönem kilitlendi.');
    }

    private function respond(AccountingPeriod $donem, string $mesaj): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => new AccountingPeriodResource($donem),
            'message' => $mesaj,
        ]);
    }

    private function find(Request $request, string $id): AccountingPeriod
    {
        return AccountingPeriod::where('company_id', $request->user()->company_id)
            ->whereKey($id)
            ->firstOrFail();
    }
}
