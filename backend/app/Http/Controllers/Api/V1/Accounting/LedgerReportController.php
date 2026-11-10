<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Services\Accounting\LedgerReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Defter raporları: mizan, büyük defter, hesap ekstresi, yevmiye defteri.
 *
 * Hepsi salt okunur. Şirket oturumdan gelir.
 */
class LedgerReportController extends Controller
{
    public function __construct(private readonly LedgerReportService $service) {}

    public function trialBalance(Request $request): JsonResponse
    {
        $filtre = $this->filters($request, ['include_empty', 'account_type']);

        return $this->ok($this->service->trialBalance($request->user()->company, $filtre));
    }

    public function generalLedger(Request $request): JsonResponse
    {
        $filtre = $this->filters($request, ['account_type', 'code_from', 'code_to', 'account_ids', 'journal_type', 'partner_id', 'limit']);

        return $this->ok($this->service->generalLedger($request->user()->company, $filtre));
    }

    public function accountStatement(Request $request, string $accountId): JsonResponse
    {
        $filtre = $this->filters($request, ['journal_type', 'partner_id']);

        return $this->ok($this->service->accountStatement($request->user()->company, $accountId, $filtre));
    }

    public function journalBook(Request $request): JsonResponse
    {
        $filtre = $this->filters($request, ['journal_type', 'limit']);

        return $this->ok($this->service->journalBook($request->user()->company, $filtre));
    }

    /** Ortak parametre doğrulaması; her rapor kendi ek alanlarını açar. */
    private function filters(Request $request, array $ekAlanlar = []): array
    {
        $kurallar = [
            'from'           => ['nullable', 'date'],
            'to'             => ['nullable', 'date'],
            'dimensions'     => ['nullable', 'array'],
            'dimensions.*'   => ['nullable', 'string', 'max:64'],
            'include_empty'  => ['nullable', 'boolean'],
            'account_type'   => ['nullable', Rule::in(['asset', 'liability', 'equity', 'revenue', 'expense', 'off_balance'])],
            'code_from'      => ['nullable', 'string', 'max:20'],
            'code_to'        => ['nullable', 'string', 'max:20'],
            'account_ids'    => ['nullable', 'array'],
            'account_ids.*'  => ['uuid'],
            'journal_type'   => ['nullable', 'string', 'max:30'],
            'partner_id'     => ['nullable', 'uuid'],
            'limit'          => ['nullable', 'integer', 'between:1,20000'],
        ];

        $izinli = array_merge(['from', 'to', 'dimensions'], $ekAlanlar);

        $data = $request->validate($kurallar);

        // Rapora ait olmayan parametreler sessizce düşsün; yanlış rapora
        // yanlış süzgeç geçerse sonucu açıklamak zorlaşır.
        $sonuc = array_intersect_key($data, array_flip($izinli));

        if (isset($sonuc['include_empty'])) {
            $sonuc['include_empty'] = $request->boolean('include_empty');
        }

        return $sonuc;
    }

    private function ok(array $data): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data]);
    }
}
