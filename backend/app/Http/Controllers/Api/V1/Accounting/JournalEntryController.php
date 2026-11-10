<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\JournalEntryResource;
use App\Models\Accounting\JournalEntry;
use App\Services\Accounting\AuditService;
use App\Services\Accounting\JournalService;
use App\Services\Accounting\JournalValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Yevmiye fişi uçları.
 *
 * Durum geçişleri ayrı uçlarda: PUT ile durum değiştirilemez, her geçişin
 * kendi kuralı ve denetim kaydı var.
 */
class JournalEntryController extends Controller
{
    public function __construct(
        private readonly JournalService $service,
        private readonly JournalValidator $validator,
        private readonly AuditService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $fisler = JournalEntry::where('company_id', $request->user()->company_id)
            ->with(['period', 'createdBy', 'postedBy'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('journal_type'), fn ($q) => $q->where('journal_type', $request->string('journal_type')))
            ->when($request->filled('period_id'), fn ($q) => $q->where('period_id', $request->string('period_id')))
            ->when($request->filled('source_type'), fn ($q) => $q->where('source_type', $request->string('source_type')))
            ->when($request->filled('journal_no'), fn ($q) => $q->where('journal_no', 'ilike', '%' . $request->string('journal_no') . '%'))
            ->when($request->filled('search'), function ($q) use ($request) {
                $a = '%' . $request->string('search') . '%';
                $q->where(fn ($s) => $s->where('description', 'ilike', $a)->orWhere('reference', 'ilike', $a));
            })
            ->betweenPostingDates($request->input('date_from'), $request->input('date_to'))
            ->orderByDesc('posting_date')
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json(['success' => true, 'data' => JournalEntryResource::collection($fisler)]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $fis = $this->find($request, $id, ['lines.account', 'period', 'createdBy', 'approvedBy', 'postedBy', 'reversalOf', 'reversedBy']);

        return response()->json([
            'success'   => true,
            'data'      => new JournalEntryResource($fis),
            'audit'     => $this->audit->historyFor('JournalEntry', $fis->id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());

        $fis = $this->service->createDraft($request->user()->company, $data, $data['lines']);

        return response()->json([
            'success' => true,
            'data'    => new JournalEntryResource($fis->load('lines.account')),
            'message' => 'Taslak fiş oluşturuldu.',
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $fis  = $this->find($request, $id);
        $data = $request->validate($this->rules(sometimes: true));

        $fis = $this->service->updateDraft($fis, $data, $data['lines'] ?? null);

        return response()->json([
            'success' => true,
            'data'    => new JournalEntryResource($fis->load('lines.account')),
            'message' => 'Fiş güncellendi.',
        ]);
    }

    /** Taslağı siler. Deftere işlenmiş fişte 422 döner. */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $fis = $this->find($request, $id);

        if ($fis->status->isFinal()) {
            throw ValidationException::withMessages([
                'status' => "Deftere işlenmiş fiş silinemez ({$fis->journal_no}). Ters kayıt kullanın.",
            ]);
        }

        $fis->delete();

        return response()->json(['success' => true, 'message' => 'Taslak fiş silindi.']);
    }

    /** Kaydetmeden doğrular; hata listesini döndürür. */
    public function check(Request $request, string $id): JsonResponse
    {
        $fis     = $this->find($request, $id, ['lines.account', 'company']);
        $hatalar = $this->validator->validate($fis);

        return response()->json([
            'success' => true,
            'data'    => ['valid' => $hatalar === [], 'errors' => $hatalar],
        ]);
    }

    public function validateEntry(Request $request, string $id): JsonResponse
    {
        return $this->respond($this->service->validateEntry($this->find($request, $id, ['lines.account'])), 'Fiş doğrulandı.');
    }

    public function submitApproval(Request $request, string $id): JsonResponse
    {
        return $this->respond($this->service->submitForApproval($this->find($request, $id, ['lines.account'])), 'Fiş onaya gönderildi.');
    }

    public function approve(Request $request, string $id): JsonResponse
    {
        return $this->respond($this->service->approve($this->find($request, $id, ['lines.account'])), 'Fiş onaylandı.');
    }

    public function returnToDraft(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        return $this->respond(
            $this->service->returnToDraft($this->find($request, $id), $request->string('reason')),
            'Fiş taslağa döndürüldü.',
        );
    }

    public function post(Request $request, string $id): JsonResponse
    {
        $fis = $this->service->post($this->find($request, $id, ['lines.account']));

        return response()->json([
            'success' => true,
            'data'    => new JournalEntryResource($fis->load('lines.account')),
            'message' => "Fiş deftere işlendi: {$fis->journal_no}",
        ]);
    }

    public function reverse(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'reason'       => ['required', 'string', 'min:3', 'max:500'],
            'posting_date' => ['nullable', 'date'],
        ]);

        $ters = $this->service->reverse(
            $this->find($request, $id),
            $request->string('reason'),
            $request->input('posting_date'),
        );

        return response()->json([
            'success' => true,
            'data'    => new JournalEntryResource($ters->load('lines.account')),
            'message' => "Ters kayıt oluşturuldu: {$ters->journal_no}",
        ], 201);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        return $this->respond(
            $this->service->cancel($this->find($request, $id), $request->string('reason')),
            'Fiş iptal edildi.',
        );
    }

    private function rules(bool $sometimes = false): array
    {
        $z = $sometimes ? 'sometimes' : 'required';

        return [
            'journal_type'         => ['nullable', Rule::in([
                'opening', 'general', 'sales', 'purchase', 'bank', 'cash', 'inventory',
                'payroll', 'fixed_asset', 'fx', 'tax_adjustment', 'closing',
            ])],
            'document_date'        => ['nullable', 'date'],
            'posting_date'         => [$z, 'date'],
            'description'          => [$z, 'string', 'max:255'],
            'reference'            => ['nullable', 'string', 'max:255'],
            'memo'                 => ['nullable', 'string', 'max:1000'],

            'lines'                  => [$z, 'array', 'min:2'],
            'lines.*.account_id'     => ['required', 'uuid', 'exists:chart_accounts,id'],
            'lines.*.description'    => ['nullable', 'string', 'max:255'],
            'lines.*.debit'          => ['nullable', 'numeric', 'min:0'],
            'lines.*.credit'         => ['nullable', 'numeric', 'min:0'],
            'lines.*.txn_currency'   => ['nullable', 'string', 'size:3'],
            'lines.*.txn_debit'      => ['nullable', 'numeric', 'min:0'],
            'lines.*.txn_credit'     => ['nullable', 'numeric', 'min:0'],
            'lines.*.fx_rate'        => ['nullable', 'numeric', 'gt:0'],
            'lines.*.fx_rate_date'   => ['nullable', 'date'],
            'lines.*.fx_rate_source' => ['nullable', 'string', 'max:30'],
            'lines.*.partner_id'     => ['nullable', 'uuid'],
            'lines.*.dimensions'     => ['nullable', 'array'],

            // Vergi alanları. validate() yalnız kural tanımlı anahtarları
            // döndürdüğü için bunlar listede olmazsa satıra hiç ulaşmıyor.
            'lines.*.tax_code_id'    => ['nullable', 'uuid', 'exists:tax_codes,id'],
            'lines.*.tax_base'       => ['nullable', 'numeric'],
            'lines.*.tax_amount'     => ['nullable', 'numeric'],
            'lines.*.tax_rate'       => ['nullable', 'numeric', 'between:0,100'],
            'lines.*.non_deductible_amount' => ['nullable', 'numeric'],
        ];
    }

    private function respond(JournalEntry $fis, string $mesaj): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => new JournalEntryResource($fis->load('lines.account')),
            'message' => $mesaj,
        ]);
    }

    private function find(Request $request, string $id, array $with = []): JournalEntry
    {
        return JournalEntry::where('company_id', $request->user()->company_id)
            ->with($with)
            ->whereKey($id)
            ->firstOrFail();
    }
}
