<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Http\Controllers\Controller;
use App\Models\StockAnomaly;
use App\Services\Stock\AnomalyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Stok anomalileri: listeleme, elle tarama, inceleme (normal / sorun var). */
class StockAnomalyController extends Controller
{
    public function __construct(private readonly AnomalyService $anomalies) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizePerm($request, 'warehouse.records.view');
        $companyId = $request->user()->company_id;

        $data = $request->validate([
            'status' => ['nullable', Rule::in(['open', 'acknowledged', 'dismissed', 'all'])],
            'type'   => ['nullable', Rule::in(array_keys(AnomalyService::TYPE_LABELS))],
        ]);

        $items = StockAnomaly::forCompany($companyId)
            ->with(['product:id,name,unit', 'warehouse:id,name', 'user:id,name', 'record:id,record_number', 'reviewedBy:id,name'])
            ->when(($data['status'] ?? 'open') !== 'all', fn($q) => $q->where('status', $data['status'] ?? 'open'))
            ->when($data['type'] ?? null, fn($q, $t) => $q->where('type', $t))
            ->orderByDesc('severity')
            ->orderByDesc('detected_for')
            ->limit(200)
            ->get()
            ->map(fn(StockAnomaly $a) => [
                'id'            => $a->id,
                'type'          => $a->type,
                'type_label'    => AnomalyService::TYPE_LABELS[$a->type] ?? $a->type,
                'severity'      => $a->severity,
                'message'       => $a->message,
                'detected_for'  => $a->detected_for?->toDateString(),
                'status'        => $a->status,
                'product'       => $a->product?->name,
                'warehouse'     => $a->warehouse?->name,
                'user'          => $a->user?->name,
                'record_id'     => $a->record_id,
                'record_number' => $a->record?->record_number,
                'metrics'       => $a->metrics,
                'reviewed_by'   => $a->reviewedBy?->name,
                'reviewed_at'   => $a->reviewed_at?->toISOString(),
                'review_note'   => $a->review_note,
            ]);

        $base = StockAnomaly::forCompany($companyId);

        return response()->json([
            'success' => true,
            'data'    => $items,
            'summary' => [
                'open'       => (clone $base)->where('status', 'open')->count(),
                'open_high'  => (clone $base)->where('status', 'open')->where('severity', '>=', 70)->count(),
                'last_7_days'=> (clone $base)->where('created_at', '>=', now()->subDays(7))->count(),
                'by_type'    => (clone $base)->where('status', 'open')->groupBy('type')->selectRaw('type, COUNT(*) as n')->pluck('n', 'type'),
            ],
            'types'   => AnomalyService::TYPE_LABELS,
        ]);
    }

    public function scan(Request $request): JsonResponse
    {
        $this->authorizePerm($request, 'warehouse.records.view');
        $result = $this->anomalies->scan($request->user()->company_id);

        return response()->json([
            'success' => true,
            'data'    => $result,
            'message' => "Tarama tamamlandı: {$result['new']} yeni anomali, toplam {$result['open']} açık.",
        ]);
    }

    public function review(Request $request, string $id): JsonResponse
    {
        $this->authorizePerm($request, 'warehouse.records.edit');

        $data = $request->validate([
            'status' => ['required', Rule::in(['open', 'acknowledged', 'dismissed'])],
            'note'   => ['nullable', 'string', 'max:500'],
        ]);

        $anomaly = StockAnomaly::forCompany($request->user()->company_id)->findOrFail($id);
        $reopen  = $data['status'] === StockAnomaly::STATUS_OPEN;

        $anomaly->update([
            'status'      => $data['status'],
            'review_note' => $data['note'] ?? $anomaly->review_note,
            'reviewed_by' => $reopen ? null : $request->user()->id,
            'reviewed_at' => $reopen ? null : now(),
        ]);

        return response()->json(['success' => true, 'message' => match ($data['status']) {
            'dismissed'    => 'Normal olarak işaretlendi.',
            'acknowledged' => 'Sorun olarak kaydedildi.',
            default        => 'Yeniden açıldı.',
        }]);
    }

    private function authorizePerm(Request $request, string $permission): void
    {
        abort_unless($request->user()->hasPermission($permission), 403);
        abort_unless($request->user()->company_id, 422, 'Bu hesap bir şirkete bağlı değil. Şirket kullanıcısıyla giriş yapın.');
    }
}
