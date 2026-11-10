<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\BusinessPartnerResource;
use App\Http\Resources\Accounting\PartnerAddressResource;
use App\Models\Accounting\BusinessPartner;
use App\Models\Accounting\PartnerAddress;
use App\Services\Accounting\AuditService;
use App\Services\Accounting\PartnerLedgerService;
use App\Services\Accounting\PartnerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PartnerController extends Controller
{
    public function __construct(
        private readonly PartnerService $service,
        private readonly PartnerLedgerService $ledger,
        private readonly AuditService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $cariler = BusinessPartner::where('company_id', $request->user()->company_id)
            ->when($request->filled('search'), fn ($q) => $q->search($request->string('search')))
            ->when($request->boolean('customers'), fn ($q) => $q->customers())
            ->when($request->boolean('suppliers'), fn ($q) => $q->suppliers())
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->when($request->filled('country_code'), fn ($q) => $q->where('country_code', $request->string('country_code')))
            ->withCount('documents')
            ->orderBy('legal_name')
            ->paginate($request->integer('per_page', 25));

        return response()->json(['success' => true, 'data' => BusinessPartnerResource::collection($cariler)]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $cari = $this->find($request, $id, ['addresses']);

        return response()->json([
            'success' => true,
            'data'    => new BusinessPartnerResource($cari),
            'balance' => $this->ledger->balance($cari),
            'credit'  => $this->ledger->creditCheck($cari),
            'audit'   => $this->audit->historyFor('BusinessPartner', $cari->id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());

        $cari = $this->service->create($request->user()->company, $data);

        return response()->json([
            'success' => true,
            'data'    => new BusinessPartnerResource($cari),
            'message' => "Cari oluşturuldu: {$cari->code}",
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate($this->rules(sometimes: true));

        return response()->json([
            'success' => true,
            'data'    => new BusinessPartnerResource($this->service->update($this->find($request, $id), $data)),
            'message' => 'Cari güncellendi.',
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->service->delete($this->find($request, $id));

        return response()->json(['success' => true, 'message' => 'Cari silindi.']);
    }

    public function block(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        return response()->json([
            'success' => true,
            'data'    => new BusinessPartnerResource($this->service->block($this->find($request, $id), $request->string('reason'))),
            'message' => 'Cari bloke edildi; yeni belge kesilemez.',
        ]);
    }

    public function unblock(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => new BusinessPartnerResource($this->service->unblock($this->find($request, $id))),
            'message' => 'Cari bloğu kaldırıldı.',
        ]);
    }

    // ─── Adresler ───────────────────────────────────────────────────

    public function addresses(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => PartnerAddressResource::collection($this->find($request, $id)->addresses),
        ]);
    }

    public function storeAddress(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'type'           => ['nullable', Rule::in(['billing', 'delivery', 'other'])],
            'label'          => ['nullable', 'string', 'max:255'],
            'line1'          => ['required', 'string', 'max:255'],
            'line2'          => ['nullable', 'string', 'max:255'],
            'city'           => ['nullable', 'string', 'max:80'],
            'postal_code'    => ['nullable', 'string', 'max:20'],
            'region'         => ['nullable', 'string', 'max:80'],
            'country_code'   => ['nullable', 'string', 'size:2'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'phone'          => ['nullable', 'string', 'max:30'],
            'is_default'     => ['nullable', 'boolean'],
        ]);

        $adres = $this->service->addAddress($this->find($request, $id), $data);

        return response()->json([
            'success' => true,
            'data'    => new PartnerAddressResource($adres),
            'message' => 'Adres eklendi.',
        ], 201);
    }

    public function destroyAddress(Request $request, string $id, string $addressId): JsonResponse
    {
        $adres = PartnerAddress::where('company_id', $request->user()->company_id)
            ->where('partner_id', $id)
            ->findOrFail($addressId);

        $this->service->deleteAddress($adres);

        return response()->json(['success' => true, 'message' => 'Adres silindi.']);
    }

    // ─── Defter ─────────────────────────────────────────────────────

    public function statement(Request $request, string $id): JsonResponse
    {
        $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);

        return response()->json([
            'success' => true,
            'data'    => $this->ledger->statement($this->find($request, $id), $request->input('from'), $request->input('to')),
        ]);
    }

    public function openItems(Request $request, string $id): JsonResponse
    {
        $request->validate(['as_of' => ['nullable', 'date']]);

        $cari = $this->find($request, $id);

        return response()->json(['success' => true, 'data' => [
            'partner_id' => $cari->id,
            'items'      => $this->ledger->openItems($cari, $request->input('as_of')),
            'balance'    => $this->ledger->balance($cari, $request->input('as_of')),
        ]]);
    }

    public function creditCheck(Request $request, string $id): JsonResponse
    {
        $request->validate(['amount' => ['nullable', 'numeric', 'min:0']]);

        return response()->json([
            'success' => true,
            'data'    => $this->ledger->creditCheck($this->find($request, $id), (float) $request->input('amount', 0)),
        ]);
    }

    /** Tüm cariler için yaşlandırma. */
    public function ageing(Request $request): JsonResponse
    {
        $request->validate([
            'direction' => ['nullable', Rule::in(['customer', 'supplier'])],
            'as_of'     => ['nullable', 'date'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => $this->ledger->ageing($request->user()->company, $request->input('direction'), $request->input('as_of')),
        ]);
    }

    // ─── Mahsup ─────────────────────────────────────────────────────

    public function offsetProposal(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->ledger->offsetProposal($this->find($request, $id)),
        ]);
    }

    public function offset(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'amount'      => ['required', 'numeric', 'gt:0'],
            'reason'      => ['required', 'string', 'min:3', 'max:500'],
            'offset_date' => ['nullable', 'date'],
        ]);

        $mahsup = $this->service->offset(
            $this->find($request, $id),
            (float) $data['amount'],
            $data['reason'],
            $data['offset_date'] ?? null,
        );

        return response()->json([
            'success' => true,
            'data'    => [
                'id'          => $mahsup->id,
                'amount'      => (float) $mahsup->amount,
                'offset_date' => $mahsup->offset_date->toDateString(),
                'journal_no'  => $mahsup->journalEntry?->journal_no,
                'documents'   => $mahsup->lines->map(fn ($l) => [
                    'document_id'    => $l->document_id,
                    'applied_amount' => (float) $l->applied_amount,
                ]),
            ],
            'message' => 'Mahsup kaydedildi.',
        ], 201);
    }

    private function rules(bool $sometimes = false): array
    {
        $z = $sometimes ? 'sometimes' : 'required';

        return [
            'code'         => ['nullable', 'string', 'max:30'],
            'legal_name'   => [$z, 'string', 'max:255'],
            'trade_name'   => ['nullable', 'string', 'max:255'],
            'is_customer'  => ['nullable', 'boolean'],
            'is_supplier'  => ['nullable', 'boolean'],
            'country_code' => ['nullable', 'string', 'size:2'],
            'registration_number' => ['nullable', 'string', 'max:30'],
            'vat_number'          => ['nullable', 'string', 'max:20'],
            'vat_registered'      => ['nullable', 'boolean'],
            'email'          => ['nullable', 'email', 'max:255'],
            'phone'          => ['nullable', 'string', 'max:30'],
            'website'        => ['nullable', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'currency'       => ['nullable', 'string', 'size:3'],
            'payment_terms'  => ['nullable', 'string', 'max:60'],
            'payment_days'   => ['nullable', 'integer', 'between:0,365'],
            'credit_limit'   => ['nullable', 'numeric', 'min:0'],
            'discount_rate'  => ['nullable', 'numeric', 'between:0,100'],
            'receivable_account_id' => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'payable_account_id'    => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'default_revenue_account_id' => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'default_expense_account_id' => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'default_tax_code_id'        => ['nullable', 'uuid', 'exists:tax_codes,id'],
            'is_active'      => ['nullable', 'boolean'],
            'notes'          => ['nullable', 'string', 'max:2000'],
        ];
    }

    private function find(Request $request, string $id, array $with = []): BusinessPartner
    {
        return BusinessPartner::where('company_id', $request->user()->company_id)
            ->with($with)->whereKey($id)->firstOrFail();
    }
}
