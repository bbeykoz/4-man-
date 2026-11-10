<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\BankAccountResource;
use App\Http\Resources\Accounting\BankTransactionResource;
use App\Http\Resources\Accounting\PaymentResource;
use App\Models\Accounting\BankAccount;
use App\Models\Accounting\BankStatement;
use App\Models\Accounting\BankTransaction;
use App\Models\Accounting\CashCount;
use App\Models\Accounting\Payment;
use App\Services\Accounting\AuditService;
use App\Services\Accounting\BankMatchingService;
use App\Services\Accounting\BankStatementService;
use App\Services\Accounting\CashCountService;
use App\Services\Accounting\PaymentService;
use App\Support\AppTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Banka ve kasa uçları: hesaplar, tahsilat/ödeme, ekstre, eşleştirme,
 * mutabakat ve kasa sayımı.
 */
class BankingController extends Controller
{
    public function __construct(
        private readonly PaymentService $payments,
        private readonly BankStatementService $statements,
        private readonly BankMatchingService $matching,
        private readonly CashCountService $cash,
        private readonly AuditService $audit,
    ) {}

    // ─── Hesaplar ───────────────────────────────────────────────────

    public function accounts(Request $request): JsonResponse
    {
        $hesaplar = BankAccount::where('company_id', $request->user()->company_id)
            ->with('account')
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->orderBy('code')
            ->get();

        // Bakiye isteğe bağlı; her hesap için ayrı sorgu olduğundan varsayılan kapalı.
        if ($request->boolean('with_balance')) {
            $tarih = $request->input('as_of');
            $hesaplar->each(fn (BankAccount $h) => $h->additional_balance = $h->ledgerBalance($tarih));
        }

        return response()->json(['success' => true, 'data' => BankAccountResource::collection($hesaplar)]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code'       => ['required', 'string', 'max:30'],
            'name'       => ['required', 'string', 'max:255'],
            'type'       => ['required', Rule::in(['bank', 'cash', 'pos'])],
            'bank_name'  => ['nullable', 'string', 'max:255'],
            'iban'       => ['nullable', 'string', 'max:34'],
            'bic'        => ['nullable', 'string', 'max:11'],
            'account_number' => ['nullable', 'string', 'max:40'],
            'currency'   => ['required', 'string', 'size:3'],
            'account_id' => ['required', 'uuid', 'exists:chart_accounts,id'],
            'cash_limit' => ['nullable', 'numeric', 'min:0'],
            'approval_threshold' => ['nullable', 'numeric', 'min:0'],
            'is_active'  => ['nullable', 'boolean'],
            'is_default' => ['nullable', 'boolean'],
            'notes'      => ['nullable', 'string', 'max:1000'],
        ]);

        $hesap = BankAccount::create($data + ['company_id' => $request->user()->company_id]);
        $this->audit->logModel($hesap, 'bank_account.created', ['code' => $hesap->code, 'type' => $hesap->type]);

        return response()->json([
            'success' => true,
            'data'    => new BankAccountResource($hesap->load('account')),
            'message' => 'Hesap oluşturuldu.',
        ], 201);
    }

    public function updateAccount(Request $request, string $id): JsonResponse
    {
        $hesap = $this->findAccount($request, $id);

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:255'],
            'bank_name'  => ['sometimes', 'nullable', 'string', 'max:255'],
            'iban'       => ['sometimes', 'nullable', 'string', 'max:34'],
            'bic'        => ['sometimes', 'nullable', 'string', 'max:11'],
            'cash_limit' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'approval_threshold' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'is_active'  => ['sometimes', 'boolean'],
            'is_default' => ['sometimes', 'boolean'],
            'notes'      => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $hesap->update($data);
        $this->audit->logModel($hesap, 'bank_account.updated', ['code' => $hesap->code]);

        return response()->json(['success' => true, 'data' => new BankAccountResource($hesap->fresh('account'))]);
    }

    public function accountBalance(Request $request, string $id): JsonResponse
    {
        $hesap = $this->findAccount($request, $id);
        $tarih = $request->input('as_of', AppTime::today()->toDateString());

        return response()->json(['success' => true, 'data' => [
            'bank_account'   => new BankAccountResource($hesap),
            'as_of'          => $tarih,
            'ledger_balance' => $hesap->ledgerBalance($tarih),
            'exceeds_cash_limit' => $hesap->exceedsCashLimit(),
        ]]);
    }

    // ─── Tahsilat / ödeme ───────────────────────────────────────────

    public function payments(Request $request): JsonResponse
    {
        $odemeler = Payment::where('company_id', $request->user()->company_id)
            ->with(['bankAccount', 'partner', 'journalEntry'])
            ->when($request->filled('direction'), fn ($q) => $q->where('direction', $request->string('direction')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('bank_account_id'), fn ($q) => $q->where('bank_account_id', $request->string('bank_account_id')))
            ->when($request->filled('partner_id'), fn ($q) => $q->where('partner_id', $request->string('partner_id')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('payment_date', '>=', $request->string('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('payment_date', '<=', $request->string('date_to')))
            ->when($request->boolean('unallocated'), fn ($q) => $q->whereColumn('allocated_amount', '<', 'amount'))
            ->orderByDesc('payment_date')->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json(['success' => true, 'data' => PaymentResource::collection($odemeler)]);
    }

    public function showPayment(Request $request, string $id): JsonResponse
    {
        $odeme = $this->findPayment($request, $id, ['bankAccount', 'partner', 'journalEntry', 'allocations.document']);

        return response()->json([
            'success' => true,
            'data'    => new PaymentResource($odeme),
            'audit'   => $this->audit->historyFor('Payment', $odeme->id),
        ]);
    }

    public function storePayment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction'       => ['required', Rule::in(['in', 'out'])],
            'bank_account_id' => ['required', 'uuid'],
            'partner_id'      => ['nullable', 'uuid'],
            'counter_account_id' => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'payment_date'    => ['nullable', 'date'],
            'amount'          => ['required', 'numeric', 'gt:0'],
            'currency'        => ['nullable', 'string', 'size:3'],
            'exchange_rate'   => ['nullable', 'numeric', 'gt:0'],
            'method'          => ['nullable', 'string', 'max:30'],
            'reference'       => ['nullable', 'string', 'max:255'],
            'description'     => ['nullable', 'string', 'max:1000'],
            'bank_charge'     => ['nullable', 'numeric', 'min:0'],
            'allocations'               => ['nullable', 'array'],
            'allocations.*.document_id' => ['required_with:allocations', 'uuid'],
            'allocations.*.amount'      => ['required_with:allocations', 'numeric', 'gt:0'],
        ]);

        $odeme = $this->payments->createDraft(
            $request->user()->company, $data, $data['allocations'] ?? [],
        );

        return response()->json([
            'success' => true,
            'data'    => new PaymentResource($odeme->load(['bankAccount', 'allocations.document'])),
            'message' => 'Ödeme taslağı oluşturuldu.',
        ], 201);
    }

    public function allocatePayment(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'allocations'               => ['required', 'array'],
            'allocations.*.document_id' => ['required', 'uuid'],
            'allocations.*.amount'      => ['required', 'numeric', 'gt:0'],
        ]);

        $odeme = $this->payments->allocate($this->findPayment($request, $id), $data['allocations']);

        return response()->json([
            'success' => true,
            'data'    => new PaymentResource($odeme->load('allocations.document')),
            'message' => 'Dağıtım güncellendi.',
        ]);
    }

    public function submitPayment(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => new PaymentResource($this->payments->submitForApproval($this->findPayment($request, $id))),
            'message' => 'Ödeme onaya gönderildi.',
        ]);
    }

    public function approvePayment(Request $request, string $id): JsonResponse
    {
        $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        $odeme = $this->payments->approve($this->findPayment($request, $id), $request->input('note'));

        return response()->json([
            'success' => true,
            'data'    => new PaymentResource($odeme),
            'message' => 'Ödeme onaylandı.',
        ]);
    }

    public function postPayment(Request $request, string $id): JsonResponse
    {
        $request->validate(['posting_date' => ['nullable', 'date']]);

        $odeme = $this->payments->post($this->findPayment($request, $id), $request->input('posting_date'));

        return response()->json([
            'success' => true,
            'data'    => new PaymentResource($odeme->load(['journalEntry', 'allocations.document'])),
            'message' => "Deftere işlendi: {$odeme->number}",
        ]);
    }

    public function cancelPayment(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        return response()->json([
            'success' => true,
            'data'    => new PaymentResource($this->payments->cancel($this->findPayment($request, $id), $request->string('reason'))),
            'message' => 'Ödeme iptal edildi.',
        ]);
    }

    // ─── Ekstre ─────────────────────────────────────────────────────

    public function importStatement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bank_account_id' => ['required', 'uuid'],
            'format'          => ['nullable', Rule::in(['csv', 'camt053'])],
            'file'            => ['required_without:content', 'file', 'max:10240'],
            'content'         => ['required_without:file', 'string'],
            'file_name'       => ['nullable', 'string', 'max:255'],
        ]);

        $hesap  = $this->findAccount($request, $data['bank_account_id']);
        $icerik = $request->hasFile('file')
            ? file_get_contents($request->file('file')->getRealPath())
            : $data['content'];
        $ad = $request->hasFile('file') ? $request->file('file')->getClientOriginalName() : ($data['file_name'] ?? null);

        $ekstre = $this->statements->import($request->user()->company, $hesap, $icerik, $data['format'] ?? 'csv', $ad);

        return response()->json([
            'success' => true,
            'data'    => [
                'id'               => $ekstre->id,
                'reference'        => $ekstre->reference,
                'period'           => "{$ekstre->period_start->toDateString()} – {$ekstre->period_end->toDateString()}",
                'opening_balance'  => round((float) $ekstre->opening_balance, 2),
                'closing_balance'  => round((float) $ekstre->closing_balance, 2),
                'transaction_count'=> $ekstre->transactions()->count(),
                'consistent'       => $ekstre->isInternallyConsistent(),
            ],
            'message' => 'Ekstre içe aktarıldı.',
        ], 201);
    }

    public function statements(Request $request): JsonResponse
    {
        $ekstreler = BankStatement::where('company_id', $request->user()->company_id)
            ->when($request->filled('bank_account_id'), fn ($q) => $q->where('bank_account_id', $request->string('bank_account_id')))
            ->withCount('transactions')
            ->orderByDesc('period_end')
            ->paginate($request->integer('per_page', 25));

        return response()->json(['success' => true, 'data' => $ekstreler->through(fn ($e) => [
            'id'                => $e->id,
            'bank_account_id'   => $e->bank_account_id,
            'reference'         => $e->reference,
            'period_start'      => $e->period_start->toDateString(),
            'period_end'        => $e->period_end->toDateString(),
            'opening_balance'   => round((float) $e->opening_balance, 2),
            'closing_balance'   => round((float) $e->closing_balance, 2),
            'currency'          => $e->currency,
            'format'            => $e->format,
            'status'            => $e->status,
            'transactions_count'=> $e->transactions_count,
        ])]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $satirlar = BankTransaction::where('company_id', $request->user()->company_id)
            ->with('payment')
            ->when($request->filled('bank_account_id'), fn ($q) => $q->where('bank_account_id', $request->string('bank_account_id')))
            ->when($request->filled('statement_id'), fn ($q) => $q->where('statement_id', $request->string('statement_id')))
            ->when($request->filled('match_status'), fn ($q) => $q->where('match_status', $request->string('match_status')))
            ->when($request->boolean('unmatched_only'), fn ($q) => $q->unmatched())
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('booking_date', '>=', $request->string('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('booking_date', '<=', $request->string('date_to')))
            ->orderBy('booking_date')
            ->paginate($request->integer('per_page', 50));

        return response()->json(['success' => true, 'data' => BankTransactionResource::collection($satirlar)]);
    }

    // ─── Eşleştirme ─────────────────────────────────────────────────

    public function suggestMatches(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->matching->suggest($this->findTransaction($request, $id), $request->integer('limit', 5)),
        ]);
    }

    public function suggestForStatement(Request $request, string $id): JsonResponse
    {
        $ekstre = BankStatement::where('company_id', $request->user()->company_id)->findOrFail($id);

        return response()->json([
            'success' => true,
            'data'    => $this->matching->suggestForStatement($ekstre->id, $request->integer('limit', 3)),
        ]);
    }

    public function confirmMatch(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'type'      => ['required', Rule::in(['payment', 'document'])],
            'target_id' => ['required', 'uuid'],
        ]);

        $satir = $this->matching->confirm(
            $this->findTransaction($request, $id), $data['type'], $data['target_id'], $this->payments,
        );

        return response()->json([
            'success' => true,
            'data'    => new BankTransactionResource($satir->load('payment')),
            'message' => 'Eşleştirme onaylandı.',
        ]);
    }

    public function ignoreTransaction(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        return response()->json([
            'success' => true,
            'data'    => new BankTransactionResource($this->matching->ignore($this->findTransaction($request, $id), $request->string('reason'))),
            'message' => 'Satır göz ardı edildi.',
        ]);
    }

    public function unmatchTransaction(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => new BankTransactionResource($this->matching->unmatch($this->findTransaction($request, $id))),
            'message' => 'Eşleştirme geri alındı.',
        ]);
    }

    public function reconcile(Request $request, string $id): JsonResponse
    {
        $request->validate(['as_of' => ['nullable', 'date']]);

        return response()->json([
            'success' => true,
            'data'    => $this->statements->reconcile(
                $this->findAccount($request, $id),
                $request->input('as_of', AppTime::today()->toDateString()),
            ),
        ]);
    }

    // ─── Kasa sayımı ────────────────────────────────────────────────

    public function cashStatus(Request $request, string $id): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->cash->status($this->findAccount($request, $id))]);
    }

    public function recordCashCount(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'counted_amount' => ['required', 'numeric', 'min:0'],
            'count_date'     => ['nullable', 'date'],
            'denominations'  => ['nullable', 'array'],
            'note'           => ['nullable', 'string', 'max:1000'],
        ]);

        $sayim = $this->cash->record(
            $this->findAccount($request, $id),
            (float) $data['counted_amount'],
            $data['count_date'] ?? null,
            $data['denominations'] ?? [],
            $data['note'] ?? null,
        );

        return response()->json([
            'success' => true,
            'data'    => [
                'id'             => $sayim->id,
                'count_date'     => $sayim->count_date->toDateString(),
                'ledger_balance' => round((float) $sayim->ledger_balance, 2),
                'counted_amount' => round((float) $sayim->counted_amount, 2),
                'difference'     => round((float) $sayim->difference, 2),
                'journal_entry_id' => $sayim->journal_entry_id,
            ],
            'message' => $sayim->hasDifference()
                ? 'Sayım kaydedildi; fark için düzeltme fişi üretildi.'
                : 'Sayım kaydedildi; fark yok.',
        ], 201);
    }

    public function cashCounts(Request $request, string $id): JsonResponse
    {
        $sayimlar = CashCount::where('bank_account_id', $id)
            ->where('company_id', $request->user()->company_id)
            ->orderByDesc('count_date')
            ->limit($request->integer('limit', 30))
            ->get();

        return response()->json(['success' => true, 'data' => $sayimlar->map(fn ($s) => [
            'id'             => $s->id,
            'count_date'     => $s->count_date->toDateString(),
            'ledger_balance' => round((float) $s->ledger_balance, 2),
            'counted_amount' => round((float) $s->counted_amount, 2),
            'difference'     => round((float) $s->difference, 2),
            'note'           => $s->note,
        ])]);
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    private function findAccount(Request $request, string $id): BankAccount
    {
        return BankAccount::where('company_id', $request->user()->company_id)->whereKey($id)->firstOrFail();
    }

    private function findPayment(Request $request, string $id, array $with = []): Payment
    {
        return Payment::where('company_id', $request->user()->company_id)->with($with)->whereKey($id)->firstOrFail();
    }

    private function findTransaction(Request $request, string $id): BankTransaction
    {
        return BankTransaction::where('company_id', $request->user()->company_id)->whereKey($id)->firstOrFail();
    }
}
