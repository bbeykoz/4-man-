<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\TaxCodeResource;
use App\Models\Accounting\TaxCode;
use App\Services\Accounting\TaxCodeService;
use App\Services\Accounting\TaxEngine;
use App\Services\Accounting\VatThresholdService;
use App\Support\AppTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaxCodeController extends Controller
{
    private const NITELIKLER = [
        'standard', 'reduced', 'reduced_low', 'zero', 'exempt', 'reverse_charge',
        'eu_supply', 'eu_acquisition', 'import', 'export', 'triangulation', 'out_of_scope',
    ];

    public function __construct(
        private readonly TaxCodeService $service,
        private readonly TaxEngine $engine,
        private readonly VatThresholdService $threshold,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $kodlar = TaxCode::where('company_id', $request->user()->company_id)
            ->when($request->filled('treatment'), fn ($q) => $q->where('treatment', $request->string('treatment')))
            ->when($request->filled('direction'), fn ($q) => $q->forDirection($request->string('direction')))
            ->when($request->filled('approval_status'), fn ($q) => $q->where('approval_status', $request->string('approval_status')))
            // Varsayılan: bugün geçerli olanlar. Tarihçe isteyen açıkça ister.
            ->when(! $request->boolean('all_versions'), fn ($q) => $q->effectiveOn($request->input('on', AppTime::today()->toDateString())))
            ->orderBy('code')
            ->orderByDesc('valid_from')
            ->get();

        return response()->json(['success' => true, 'data' => TaxCodeResource::collection($kodlar)]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json(['success' => true, 'data' => new TaxCodeResource($this->find($request, $id))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());

        return response()->json([
            'success' => true,
            'data'    => new TaxCodeResource($this->service->create($request->user()->company, $data)),
            'message' => 'Vergi kodu oluşturuldu. Canlıda kullanmadan önce onaylanmalı.',
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate($this->rules(sometimes: true));

        return response()->json([
            'success' => true,
            'data'    => new TaxCodeResource($this->service->update($this->find($request, $id), $data)),
            'message' => 'Vergi kodu güncellendi.',
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->service->delete($this->find($request, $id));

        return response()->json(['success' => true, 'message' => 'Vergi kodu silindi.']);
    }

    public function approve(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => new TaxCodeResource($this->service->approve($this->find($request, $id))),
            'message' => 'Vergi kodu onaylandı; artık fişlerde kullanılabilir.',
        ]);
    }

    /** Oran değişikliği: eskisini kapatır, yenisini açar. */
    public function changeRate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'rate'            => ['required', 'numeric', 'between:0,100'],
            'effective_from'  => ['required', 'date'],
            'legal_reference' => ['nullable', 'string', 'max:255'],
        ]);

        $yeni = $this->service->changeRate(
            $this->find($request, $id),
            (float) $data['rate'],
            $data['effective_from'],
            $data['legal_reference'] ?? null,
        );

        return response()->json([
            'success' => true,
            'data'    => new TaxCodeResource($yeni),
            'message' => "Yeni oran {$data['effective_from']} tarihinden itibaren geçerli. Onay bekliyor.",
        ], 201);
    }

    public function installTemplate(Request $request): JsonResponse
    {
        $request->validate(['valid_from' => ['nullable', 'date']]);

        $eklenen = $this->service->installTemplate($request->user()->company, $request->input('valid_from'));

        return response()->json([
            'success' => true,
            'data'    => ['created' => $eklenen],
            'message' => $eklenen > 0
                ? "$eklenen vergi kodu eklendi. Hepsi taslak; danışman onayı gerekiyor."
                : 'Ülke paketindeki tüm kodlar zaten tanımlı.',
        ]);
    }

    /** Vergi hesaplama önizlemesi; fiş yazmadan sonucu gösterir. */
    public function calculate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date'                 => ['nullable', 'date'],
            'direction'            => ['nullable', Rule::in(['sale', 'purchase'])],
            'lines'                => ['required', 'array', 'min:1'],
            'lines.*.amount'       => ['required', 'numeric'],
            'lines.*.tax_code'     => ['nullable', 'string', 'max:30'],
            'lines.*.treatment'    => ['nullable', Rule::in(self::NITELIKLER)],
            'lines.*.tax_included' => ['nullable', 'boolean'],
            'lines.*.line_no'      => ['nullable', 'integer'],
        ]);

        $sonuc = $this->engine->calculateLines(
            $request->user()->company,
            $data['date'] ?? AppTime::today()->toDateString(),
            $data['lines'],
            $data['direction'] ?? 'sale',
        );

        return response()->json(['success' => true, 'data' => $sonuc]);
    }

    /** KDV kayıt eşiği durumu. */
    public function thresholdStatus(Request $request): JsonResponse
    {
        $request->validate(['as_of' => ['nullable', 'date'], 'additional' => ['nullable', 'numeric', 'min:0']]);

        $company = $request->user()->company;

        $data = $request->filled('additional')
            ? $this->threshold->simulate($company, (float) $request->input('additional'))
            : $this->threshold->check($company, $request->input('as_of'));

        return response()->json([
            'success' => true,
            'data'    => $data + ['history' => $this->threshold->history($company, 12)],
        ]);
    }

    private function rules(bool $sometimes = false): array
    {
        $z = $sometimes ? 'sometimes' : 'required';

        return [
            'code'               => [$z, 'string', 'max:30'],
            'name'               => [$z, 'string', 'max:255'],
            'name_local'         => ['nullable', 'string', 'max:255'],
            'country_code'       => ['nullable', 'string', 'size:2'],
            'tax_type'           => ['nullable', 'string', 'max:20'],
            'treatment'          => [$z, Rule::in(self::NITELIKLER)],
            'rate'               => [$z, 'numeric', 'between:0,100'],
            'direction'          => ['nullable', Rule::in(['sale', 'purchase', 'both'])],
            'deductible_rate'    => ['nullable', 'numeric', 'between:0,100'],
            'output_account_id'  => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'input_account_id'   => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'expense_account_id' => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'report_box'         => ['nullable', 'string', 'max:20'],
            'saft_code'          => ['nullable', 'string', 'max:20'],
            'eu_reportable'      => ['nullable', 'boolean'],
            'affects_vat_return' => ['nullable', 'boolean'],
            'valid_from'         => [$z, 'date'],
            'valid_to'           => ['nullable', 'date', 'after_or_equal:valid_from'],
            'legal_reference'    => ['nullable', 'string', 'max:255'],
            'is_default'         => ['nullable', 'boolean'],
            'description'        => ['nullable', 'string', 'max:1000'],
        ];
    }

    private function find(Request $request, string $id): TaxCode
    {
        return TaxCode::where('company_id', $request->user()->company_id)->whereKey($id)->firstOrFail();
    }
}
