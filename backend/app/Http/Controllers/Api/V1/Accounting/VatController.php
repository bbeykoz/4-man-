<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Accounting\VatReturn;
use App\Services\Accounting\AuditService;
use App\Services\Accounting\VatLedgerService;
use App\Services\Accounting\VatReturnService;
use App\Support\AppTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * KDV merkezi: satış/alış defterleri, VIES, beyan taslağı, kontrol listesi,
 * gönderim ve sonradan değişiklik tespiti.
 */
class VatController extends Controller
{
    public function __construct(
        private readonly VatLedgerService $ledger,
        private readonly VatReturnService $returns,
        private readonly AuditService $audit,
    ) {}

    /** KDV merkezi özeti: açık dönemler, yaklaşan son tarihler. */
    public function overview(Request $request): JsonResponse
    {
        $company = $request->user()->company;
        $bugun   = AppTime::today();

        $beyanlar = VatReturn::where('company_id', $company->id)
            ->orderByDesc('period_key')
            ->limit(12)
            ->get();

        // Son 6 ayın beyanı var mı; eksikler görünür olsun.
        $eksik = [];
        for ($i = 1; $i <= 6; $i++) {
            $anahtar = $bugun->copy()->subMonths($i)->format('Y-m');

            if (! $beyanlar->firstWhere('period_key', $anahtar)) {
                $eksik[] = [
                    'period_key' => $anahtar,
                    'due_date'   => $this->ledger->dueDate($company, $anahtar),
                ];
            }
        }

        return response()->json(['success' => true, 'data' => [
            'vat_registered'   => (bool) $company->vat_registered,
            'vat_number'       => $company->vat_number,
            'vat_term'         => data_get($company->countryPack(), 'vat_term'),
            'due_day'          => data_get($company->countryPack(), 'vat_return_due_day'),
            'current_period'   => $bugun->format('Y-m'),
            'returns'          => $beyanlar->map(fn (VatReturn $b) => $this->shape($b)),
            'missing_periods'  => $eksik,
            'currency'         => $company->functionalCurrency(),
        ]]);
    }

    public function salesBook(Request $request): JsonResponse
    {
        [$bas, $bit] = $this->range($request);

        return response()->json([
            'success' => true,
            'data'    => $this->ledger->salesBook($request->user()->company, $bas, $bit),
        ]);
    }

    public function purchaseBook(Request $request): JsonResponse
    {
        [$bas, $bit] = $this->range($request);

        return response()->json([
            'success' => true,
            'data'    => $this->ledger->purchaseBook($request->user()->company, $bas, $bit),
        ]);
    }

    public function vies(Request $request): JsonResponse
    {
        [$bas, $bit] = $this->range($request);

        return response()->json([
            'success' => true,
            'data'    => $this->ledger->viesReport($request->user()->company, $bas, $bit),
        ]);
    }

    public function returns(Request $request): JsonResponse
    {
        $beyanlar = VatReturn::where('company_id', $request->user()->company_id)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('period_key')
            ->paginate($request->integer('per_page', 24));

        return response()->json(['success' => true, 'data' => $beyanlar->through(fn ($b) => $this->shape($b))]);
    }

    public function showReturn(Request $request, string $id): JsonResponse
    {
        $beyan = $this->find($request, $id);

        return response()->json(['success' => true, 'data' => $this->shape($beyan, detayli: true) + [
            'reconciliation' => $this->returns->ledgerVsAccounts($beyan),
            'drift'          => $this->returns->detectDrift($beyan),
            'audit'          => $this->audit->historyFor('VatReturn', $beyan->id),
        ]]);
    }

    /** Dönem beyanını üretir ya da tazeler. */
    public function prepare(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period_key' => ['required', 'string', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $beyan = $this->returns->prepare($request->user()->company, $data['period_key']);
        $kontrol = $this->returns->validateReturn($beyan);

        return response()->json([
            'success' => true,
            'data'    => $this->shape($beyan->fresh(), detayli: true) + ['validation' => $kontrol],
            'message' => $kontrol['ok']
                ? 'Beyan taslağı hazır; kontrollerden geçti.'
                : sprintf('Beyan taslağı hazır ama %d hata var.', count($kontrol['errors'])),
        ], 201);
    }

    /** Beyan öncesi kontrol listesi. */
    public function validateReturn(Request $request, string $id): JsonResponse
    {
        $kontrol = $this->returns->validateReturn($this->find($request, $id));

        return response()->json([
            'success' => true,
            'data'    => $kontrol,
            'message' => $kontrol['ok']
                ? 'Kontroller temiz; beyan gönderilebilir.'
                : sprintf('%d hata, %d uyarı var.', count($kontrol['errors']), count($kontrol['warnings'])),
        ]);
    }

    public function submit(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['nullable', 'string', 'max:255'],
            'note'      => ['nullable', 'string', 'max:1000'],
        ]);

        $beyan = $this->returns->submit($this->find($request, $id), $data['reference'] ?? null, $data['note'] ?? null);

        return response()->json([
            'success' => true,
            'data'    => $this->shape($beyan, detayli: true),
            'message' => "{$beyan->period_key} dönemi beyanı gönderildi olarak işaretlendi.",
        ]);
    }

    /** Kurum cevabı: kabul ya da ret. */
    public function markResponse(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'accepted' => ['required', 'boolean'],
            'note'     => ['nullable', 'string', 'max:1000'],
        ]);

        $beyan = $this->find($request, $id);

        if (! $beyan->isSubmitted()) {
            throw ValidationException::withMessages(['status' => 'Yalnız gönderilmiş beyan için kurum cevabı işlenir.']);
        }

        $beyan->forceFill([
            'status'          => $data['accepted'] ? 'accepted' : 'rejected',
            'submission_note' => $data['note'] ?? $beyan->submission_note,
        ])->save();

        $this->audit->logModel($beyan, $data['accepted'] ? 'vat_return.accepted' : 'vat_return.rejected',
            ['period' => $beyan->period_key], $data['note'] ?? null);

        return response()->json([
            'success' => true,
            'data'    => $this->shape($beyan->fresh()),
            'message' => $data['accepted'] ? 'Beyan kabul edildi.' : 'Beyan reddedildi; düzeltme gerekiyor.',
        ]);
    }

    private function shape(VatReturn $b, bool $detayli = false): array
    {
        $temel = [
            'id'            => $b->id,
            'period_key'    => $b->period_key,
            'period_start'  => $b->period_start->toDateString(),
            'period_end'    => $b->period_end->toDateString(),
            'due_date'      => $b->due_date->toDateString(),
            'days_to_due'   => $b->daysToDue(AppTime::today()->toDateString()),
            'currency'      => $b->currency,
            'output_base'   => round((float) $b->output_base, 2),
            'output_tax'    => round((float) $b->output_tax, 2),
            'input_base'    => round((float) $b->input_base, 2),
            'input_tax'     => round((float) $b->input_tax, 2),
            'non_deductible_tax' => round((float) $b->non_deductible_tax, 2),
            'net_payable'   => round((float) $b->net_payable, 2),
            'is_payable'    => $b->isPayable(),
            'sales_count'   => $b->sales_count,
            'purchase_count'=> $b->purchase_count,
            'status'        => $b->status,
            'status_label'  => $b->statusLabel(),
            'is_editable'   => $b->isEditable(),
            'submitted_at'  => $b->submitted_at?->toISOString(),
            'submission_reference' => $b->submission_reference,
            'journal_entry_id'     => $b->journal_entry_id,
        ];

        if (! $detayli) {
            return $temel;
        }

        return $temel + [
            'boxes'             => $b->boxes,
            'validation_issues' => $b->validation_issues,
            'entries'           => $b->entries()->orderBy('book')->orderBy('tax_date')->get()->map(fn ($e) => [
                'book'            => $e->book,
                'document_number' => $e->document_number,
                'doc_type'        => $e->doc_type,
                'tax_date'        => $e->tax_date->toDateString(),
                'partner_name'    => $e->partner_name,
                'tax_code'        => $e->tax_code,
                'report_box'      => $e->report_box,
                'base'            => round((float) $e->base, 2),
                'tax'             => round((float) $e->tax, 2),
            ]),
        ];
    }

    /** Tarih aralığı: ya period_key ya da from/to. */
    private function range(Request $request): array
    {
        $request->validate([
            'period_key' => ['nullable', 'string', 'regex:/^\d{4}-\d{2}$/'],
            'from'       => ['nullable', 'date'],
            'to'         => ['nullable', 'date'],
        ]);

        if ($request->filled('period_key')) {
            return $this->ledger->periodRange($request->string('period_key'));
        }

        $bugun = AppTime::today();

        return [
            $request->input('from', $bugun->copy()->startOfMonth()->toDateString()),
            $request->input('to', $bugun->copy()->endOfMonth()->toDateString()),
        ];
    }

    private function find(Request $request, string $id): VatReturn
    {
        return VatReturn::where('company_id', $request->user()->company_id)->whereKey($id)->firstOrFail();
    }
}
