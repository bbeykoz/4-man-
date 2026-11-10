<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Enums\Accounting\DocumentType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\DocumentSeriesResource;
use App\Models\Accounting\DocumentSeries;
use App\Services\Accounting\AccountRoleService;
use App\Services\Accounting\ChartOfAccountsService;
use App\Services\Accounting\DocumentSeriesService;
use App\Services\Accounting\PeriodService;
use App\Services\Accounting\TaxCodeService;
use App\Support\AppTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Muhasebe kurulumu: hesap rolleri, numara serileri ve tek adımda tam kurulum.
 *
 * Şirket muhasebeye yeni başlarken hesap planı, dönemler, vergi kodları, rol
 * eşlemesi ve seriler birlikte gerekiyor. Tek tek kurmak kolayca eksik
 * bırakılıyor; bootstrap hepsini sırayla kuruyor ve eksikleri raporluyor.
 */
class AccountingSetupController extends Controller
{
    public function __construct(
        private readonly ChartOfAccountsService $chart,
        private readonly PeriodService $periods,
        private readonly TaxCodeService $taxes,
        private readonly AccountRoleService $roles,
        private readonly DocumentSeriesService $series,
    ) {}

    /**
     * Muhasebe özeti: kasa, gelir/gider, alacak/borç, avans, KDV, trend.
     * Hem muhasebe modülünün özet sekmesi hem müdür ekranı bunu kullanıyor.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to'   => ['nullable', 'date'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => app(\App\Services\Accounting\AccountingDashboardService::class)
                ->summary($request->user()->company, $request->only(['from', 'to'])),
        ]);
    }

    /** Kurulum durumu: ne var, ne eksik. */
    public function status(Request $request): JsonResponse
    {
        $company = $request->user()->company;

        return response()->json(['success' => true, 'data' => [
            'country_code'        => $company->country_code,
            'functional_currency' => $company->functionalCurrency(),
            'timezone'            => $company->timezone,
            'chart_accounts'      => \App\Models\Accounting\ChartAccount::where('company_id', $company->id)->count(),
            'periods'             => \App\Models\Accounting\AccountingPeriod::where('company_id', $company->id)->count(),
            'tax_codes'           => \App\Models\Accounting\TaxCode::where('company_id', $company->id)->count(),
            'tax_codes_approved'  => \App\Models\Accounting\TaxCode::where('company_id', $company->id)->approved()->count(),
            'document_series'     => DocumentSeries::where('company_id', $company->id)->count(),
            'account_roles'       => $this->roles->listing($company),
            'missing_roles'       => $this->roles->missingRequired($company),
            'ready_for_documents' => $this->roles->missingRequired($company) === []
                                     && DocumentSeries::where('company_id', $company->id)->exists(),
        ]]);
    }

    /** Tek adımda kurulum. Var olanları bozmaz, eksikleri tamamlar. */
    public function bootstrap(Request $request): JsonResponse
    {
        $request->validate(['year' => ['nullable', 'integer', 'between:2000,2100']]);

        $company = $request->user()->company;
        $yil     = $request->integer('year', (int) AppTime::today()->format('Y'));

        $sonuc = [
            'chart_accounts'  => $this->chart->installTemplate($company),
            'periods'         => $this->periods->generateYear($company, $yil),
            'tax_codes'       => $this->taxes->installTemplate($company),
            'account_roles'   => $this->roles->installDefaults($company),
            'document_series' => $this->series->installDefaults($company),
            'bank_accounts'   => $this->installBankAccounts($company),
            'fixed_rates'     => app(\App\Services\Accounting\ExchangeRateService::class)->installFixedRates($company),
        ];

        return response()->json([
            'success' => true,
            'data'    => $sonuc + ['missing_roles' => $this->roles->missingRequired($company)],
            'message' => 'Muhasebe kurulumu tamamlandı. Vergi kodları onay bekliyor.',
        ]);
    }

    // ─── Hesap rolleri ──────────────────────────────────────────────

    public function roleListing(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->roles->listing($request->user()->company)]);
    }

    public function setRole(Request $request): JsonResponse
    {
        $data = $request->validate([
            'role'       => ['required', 'string', Rule::in(\App\Support\AccountRole::all())],
            'account_id' => ['required', 'uuid'],
        ]);

        $this->roles->set($request->user()->company, $data['role'], $data['account_id']);

        return response()->json([
            'success' => true,
            'data'    => $this->roles->listing($request->user()->company),
            'message' => 'Hesap rolü güncellendi.',
        ]);
    }

    // ─── Numara serileri ────────────────────────────────────────────

    public function seriesIndex(Request $request): JsonResponse
    {
        $seriler = DocumentSeries::where('company_id', $request->user()->company_id)
            ->when($request->filled('doc_type'), fn ($q) => $q->forType($request->string('doc_type')))
            ->withCount('documents')
            ->orderBy('doc_type')->orderBy('code')
            ->get();

        return response()->json(['success' => true, 'data' => DocumentSeriesResource::collection($seriler)]);
    }

    public function seriesStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'doc_type'         => ['required', Rule::in(array_column(DocumentType::cases(), 'value'))],
            'code'             => ['required', 'string', 'max:20'],
            'name'             => ['required', 'string', 'max:255'],
            'prefix'           => ['nullable', 'string', 'max:20'],
            'padding'          => ['nullable', 'integer', 'between:1,12'],
            'reset_yearly'     => ['nullable', 'boolean'],
            'is_default'       => ['nullable', 'boolean'],
            'is_active'        => ['nullable', 'boolean'],
            'allowed_user_ids' => ['nullable', 'array'],
            'allowed_user_ids.*' => ['uuid'],
            'branch'           => ['nullable', 'string', 'max:60'],
        ]);

        $seri = $this->series->create($request->user()->company, $data);

        return response()->json([
            'success' => true,
            'data'    => new DocumentSeriesResource($seri),
            'message' => 'Numara serisi oluşturuldu.',
        ], 201);
    }

    public function seriesUpdate(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'name'             => ['sometimes', 'string', 'max:255'],
            'prefix'           => ['sometimes', 'nullable', 'string', 'max:20'],
            'padding'          => ['sometimes', 'integer', 'between:1,12'],
            'reset_yearly'     => ['sometimes', 'boolean'],
            'is_default'       => ['sometimes', 'boolean'],
            'is_active'        => ['sometimes', 'boolean'],
            'allowed_user_ids' => ['sometimes', 'array'],
            'branch'           => ['sometimes', 'nullable', 'string', 'max:60'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => new DocumentSeriesResource($this->series->update($this->findSeries($request, $id), $data)),
            'message' => 'Seri güncellendi.',
        ]);
    }

    public function seriesDestroy(Request $request, string $id): JsonResponse
    {
        $this->series->delete($this->findSeries($request, $id));

        return response()->json(['success' => true, 'message' => 'Seri silindi.']);
    }

    /** Numara atlaması kontrolü; mevzuat atlamasız sıra istiyor. */
    public function seriesGapCheck(Request $request, string $id): JsonResponse
    {
        $request->validate(['year' => ['nullable', 'integer']]);

        return response()->json([
            'success' => true,
            'data'    => $this->series->gapCheck($this->findSeries($request, $id), $request->integer('year') ?: null),
        ]);
    }

    /**
     * Rol eşlemesindeki kasa ve banka hesaplarından birer varsayılan
     * banka/kasa kaydı kurar. Ödeme kesmek için en az bir hesap gerekiyor.
     */
    private function installBankAccounts(\App\Models\Company $company): int
    {
        $eklenen = 0;

        $tanimlar = [
            ['role' => \App\Support\AccountRole::CASH, 'code' => 'KASA', 'name' => 'Merkez kasa', 'type' => 'cash'],
            ['role' => \App\Support\AccountRole::BANK, 'code' => 'BANKA', 'name' => 'Ana banka hesabı', 'type' => 'bank'],
        ];

        foreach ($tanimlar as $t) {
            if (\App\Models\Accounting\BankAccount::where('company_id', $company->id)->where('code', $t['code'])->exists()) {
                continue;
            }

            $hesapId = $this->roles->accountIdOrNull($company, $t['role']);

            if (! $hesapId) {
                continue;
            }

            \App\Models\Accounting\BankAccount::create([
                'company_id' => $company->id,
                'code'       => $t['code'],
                'name'       => $t['name'],
                'type'       => $t['type'],
                'currency'   => $company->functionalCurrency(),
                'account_id' => $hesapId,
                'is_active'  => true,
                'is_default' => $t['type'] === 'bank',
            ]);

            $eklenen++;
        }

        return $eklenen;
    }

    private function findSeries(Request $request, string $id): DocumentSeries
    {
        return DocumentSeries::where('company_id', $request->user()->company_id)->whereKey($id)->firstOrFail();
    }
}
