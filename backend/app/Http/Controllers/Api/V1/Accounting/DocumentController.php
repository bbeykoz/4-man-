<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Enums\Accounting\DocumentType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\DocumentResource;
use App\Models\Accounting\Document;
use App\Services\Accounting\AuditService;
use App\Services\Accounting\DocumentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DocumentController extends Controller
{
    public function __construct(
        private readonly DocumentService $service,
        private readonly AuditService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $belgeler = Document::where('company_id', $request->user()->company_id)
            ->with(['series', 'journalEntry'])
            ->when($request->filled('doc_type'), fn ($q) => $q->where('doc_type', $request->string('doc_type')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('partner_id'), fn ($q) => $q->where('partner_id', $request->string('partner_id')))
            ->when($request->filled('number'), fn ($q) => $q->where('number', 'ilike', '%' . $request->string('number') . '%'))
            ->when($request->filled('partner_name'), fn ($q) => $q->where('partner_name', 'ilike', '%' . $request->string('partner_name') . '%'))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('issue_date', '>=', $request->string('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('issue_date', '<=', $request->string('date_to')))
            ->when($request->string('direction')->toString() === 'sale', fn ($q) => $q->sales())
            ->when($request->string('direction')->toString() === 'purchase', fn ($q) => $q->purchases())
            ->when($request->boolean('open_only'), fn ($q) => $q->open())
            ->when($request->boolean('overdue'), fn ($q) => $q->open()->whereDate('due_date', '<', now()->toDateString()))
            ->orderByDesc('issue_date')
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json(['success' => true, 'data' => DocumentResource::collection($belgeler)]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $belge = $this->find($request, $id, ['lines.taxCode', 'lines.account', 'series', 'journalEntry', 'corrects', 'corrections']);

        return response()->json([
            'success' => true,
            'data'    => new DocumentResource($belge),
            'audit'   => $this->audit->historyFor('Document', $belge->id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());

        $belge = $this->service->createDraft($request->user()->company, $data, $data['lines']);

        return response()->json([
            'success' => true,
            'data'    => new DocumentResource($belge->load(['lines.taxCode'])),
            'message' => 'Taslak belge oluşturuldu.',
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data  = $request->validate($this->rules(sometimes: true));
        $belge = $this->service->updateDraft($this->find($request, $id), $data, $data['lines'] ?? null);

        return response()->json([
            'success' => true,
            'data'    => new DocumentResource($belge->load(['lines.taxCode'])),
            'message' => 'Belge güncellendi.',
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $belge = $this->find($request, $id);

        if ($belge->status->affectsLedger()) {
            throw ValidationException::withMessages([
                'status' => "Deftere işlenmiş belge silinemez ({$belge->number}). İade belgesi düzenleyin.",
            ]);
        }

        if ($belge->number) {
            throw ValidationException::withMessages([
                'number' => "Numarası verilmiş belge silinemez ({$belge->number}); numara atlaması olur. İptal edin.",
            ]);
        }

        $belge->delete();

        return response()->json(['success' => true, 'message' => 'Taslak belge silindi.']);
    }

    /** Numara atar. */
    public function issue(Request $request, string $id): JsonResponse
    {
        $request->validate(['series_id' => ['nullable', 'uuid']]);

        $belge = $this->service->issue($this->find($request, $id), $request->input('series_id'));

        return response()->json([
            'success' => true,
            'data'    => new DocumentResource($belge->load(['lines.taxCode', 'series'])),
            'message' => "Belge kesildi: {$belge->number}",
        ]);
    }

    public function post(Request $request, string $id): JsonResponse
    {
        $request->validate(['posting_date' => ['nullable', 'date']]);

        $belge = $this->service->post($this->find($request, $id), $request->input('posting_date'));

        return response()->json([
            'success' => true,
            'data'    => new DocumentResource($belge->load(['lines.taxCode', 'journalEntry'])),
            'message' => "Belge deftere işlendi. Fiş: {$belge->journalEntry?->journal_no}",
        ]);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        $belge = $this->service->cancel($this->find($request, $id), $request->string('reason'));

        return response()->json([
            'success' => true,
            'data'    => new DocumentResource($belge),
            'message' => 'Belge iptal edildi.',
        ]);
    }

    /** İade / düzeltme belgesi üretir. */
    public function correct(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reason'                 => ['required', 'string', 'min:3', 'max:500'],
            'issue_date'             => ['nullable', 'date'],
            'lines'                  => ['nullable', 'array', 'min:1'],
            'lines.*.description'    => ['required_with:lines', 'string', 'max:255'],
            'lines.*.quantity'       => ['required_with:lines', 'numeric'],
            'lines.*.unit_price'     => ['required_with:lines', 'numeric', 'min:0'],
            'lines.*.tax_code_id'    => ['nullable', 'uuid'],
            'lines.*.account_id'     => ['nullable', 'uuid'],
        ]);

        $iade = $this->service->createCorrection(
            $this->find($request, $id, ['lines']),
            $data['reason'],
            $data['lines'] ?? null,
            $data['issue_date'] ?? null,
        );

        return response()->json([
            'success' => true,
            'data'    => new DocumentResource($iade->load(['lines.taxCode', 'corrects'])),
            'message' => 'İade belgesi taslak olarak oluşturuldu.',
        ], 201);
    }

    private function rules(bool $sometimes = false): array
    {
        $z = $sometimes ? 'sometimes' : 'required';

        return [
            'doc_type'      => [$sometimes ? 'prohibited' : 'required', Rule::in(array_column(DocumentType::cases(), 'value'))],
            'issue_date'    => ['nullable', 'date'],
            'tax_date'      => ['nullable', 'date'],
            'supply_date'   => ['nullable', 'date'],
            'due_date'      => ['nullable', 'date', 'after_or_equal:issue_date'],

            'partner_id'    => ['nullable', 'uuid'],
            'partner_name'  => ['nullable', 'string', 'max:255'],
            'partner_vat_number'          => ['nullable', 'string', 'max:20'],
            'partner_registration_number' => ['nullable', 'string', 'max:30'],
            'partner_address'             => ['nullable', 'array'],

            'currency'      => ['nullable', 'string', 'size:3'],
            'exchange_rate' => ['nullable', 'numeric', 'gt:0'],
            'exchange_rate_date'   => ['nullable', 'date'],
            'exchange_rate_source' => ['nullable', 'string', 'max:30'],

            'reference'     => ['nullable', 'string', 'max:255'],
            'notes'         => ['nullable', 'string', 'max:2000'],
            'payment_terms' => ['nullable', 'string', 'max:60'],

            'lines'                  => [$z, 'array', 'min:1'],
            'lines.*.line_no'        => ['nullable', 'integer'],
            'lines.*.product_id'     => ['nullable', 'uuid'],
            'lines.*.item_code'      => ['nullable', 'string', 'max:60'],
            'lines.*.description'    => ['required', 'string', 'max:255'],
            'lines.*.quantity'       => ['required', 'numeric', 'not_in:0'],
            'lines.*.unit'           => ['nullable', 'string', 'max:20'],
            'lines.*.unit_price'     => ['required', 'numeric'],
            'lines.*.discount_rate'  => ['nullable', 'numeric', 'between:0,100'],
            'lines.*.discount_amount'=> ['nullable', 'numeric', 'min:0'],
            'lines.*.tax_code_id'    => ['nullable', 'uuid', 'exists:tax_codes,id'],
            'lines.*.tax_code'       => ['nullable', 'string', 'max:30'],
            'lines.*.tax_included'   => ['nullable', 'boolean'],
            'lines.*.account_id'     => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'lines.*.dimensions'     => ['nullable', 'array'],
        ];
    }

    private function find(Request $request, string $id, array $with = []): Document
    {
        return Document::where('company_id', $request->user()->company_id)
            ->with($with)
            ->whereKey($id)
            ->firstOrFail();
    }
}
