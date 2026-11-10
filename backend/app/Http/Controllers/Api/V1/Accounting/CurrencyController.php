<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Services\Accounting\ExchangeRateService;
use App\Services\Accounting\FxRevaluationService;
use App\Support\AppTime;
use App\Support\CountryPack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Çoklu para: kur tablosu, çevrim, dönem sonu değerleme ve eski para koruması.
 */
class CurrencyController extends Controller
{
    public function __construct(
        private readonly ExchangeRateService $rates,
        private readonly FxRevaluationService $fx,
    ) {}

    /** Genel durum: defter para birimi, kullanılan dövizler, eski para bilgisi. */
    public function overview(Request $request): JsonResponse
    {
        $company = $request->user()->company;
        $pack    = $company->countryPack();

        return response()->json(['success' => true, 'data' => [
            'book_currency'      => $company->functionalCurrency(),
            'country_code'       => $company->country_code,
            'currencies_in_use'  => $this->rates->currenciesInUse($company),
            'legacy_currency'    => $pack['legacy_currency'] ?? null,
            'recent_rates'       => $this->rates->listing($company, null, 20),
            'revaluations'       => $this->fx->history($company, 12),
        ]]);
    }

    public function rates(Request $request): JsonResponse
    {
        $request->validate(['currency' => ['nullable', 'string', 'size:3'], 'limit' => ['nullable', 'integer', 'between:1,500']]);

        return response()->json([
            'success' => true,
            'data'    => $this->rates->listing($request->user()->company, $request->input('currency'), $request->integer('limit', 100)),
        ]);
    }

    public function storeRate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'base_currency'  => ['required', 'string', 'size:3'],
            'quote_currency' => ['required', 'string', 'size:3'],
            'rate_date'      => ['required', 'date'],
            'rate'           => ['required', 'numeric', 'gt:0'],
            'source'         => ['nullable', 'string', 'max:30'],
            'reason'         => ['nullable', 'string', 'max:500'],
            'note'           => ['nullable', 'string', 'max:500'],
        ]);

        $kur = $this->rates->store($request->user()->company, $data);

        return response()->json([
            'success' => true,
            'data'    => ['id' => $kur->id, 'pair' => $kur->pair(), 'rate' => (float) $kur->rate,
                          'rate_date' => $kur->rate_date->toDateString(), 'source' => $kur->source],
            'message' => "{$kur->pair()} kuru kaydedildi.",
        ], 201);
    }

    /** Sabit kurları ülke paketinden kurar (BGN gibi). */
    public function installFixed(Request $request): JsonResponse
    {
        $eklenen = $this->rates->installFixedRates($request->user()->company);

        return response()->json([
            'success' => true,
            'data'    => ['created' => $eklenen],
            'message' => $eklenen > 0 ? 'Sabit kur kuruldu.' : 'Sabit kur zaten tanımlı ya da ülkede eski para yok.',
        ]);
    }

    /** Çevrim önizlemesi. */
    public function convert(Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount'   => ['required', 'numeric'],
            'currency' => ['required', 'string', 'size:3'],
            'date'     => ['nullable', 'date'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => $this->rates->convert($request->user()->company, (float) $data['amount'], $data['currency'], $data['date'] ?? null),
        ]);
    }

    // ─── Dönem sonu değerleme ───────────────────────────────────────

    public function revaluationPreview(Request $request): JsonResponse
    {
        $request->validate([
            'valuation_date' => ['nullable', 'date'],
            'currency'       => ['nullable', 'string', 'size:3'],
        ]);

        return response()->json([
            'success' => true,
            'data'    => $this->fx->preview(
                $request->user()->company,
                $request->input('valuation_date', AppTime::today()->toDateString()),
                $request->input('currency'),
            ),
        ]);
    }

    public function runRevaluation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'valuation_date' => ['required', 'date'],
            'currency'       => ['required', 'string', 'size:3'],
        ]);

        $sonuc = $this->fx->run($request->user()->company, $data['valuation_date'], $data['currency']);

        return response()->json([
            'success' => true,
            'data'    => $sonuc,
            'message' => sprintf('%s değerlemesi kaydedildi; net etki %s.',
                strtoupper($data['currency']), number_format($sonuc['net_effect'], 2, ',', '.')),
        ], 201);
    }

    public function reverseRevaluation(Request $request, string $id): JsonResponse
    {
        $fisId = $this->fx->reverseNextPeriod($request->user()->company, $id);

        return response()->json([
            'success' => true,
            'data'    => ['reversal_entry_id' => $fisId],
            'message' => 'Değerleme ters çevrildi; gerçekleşmemiş fark sonraki döneme taşınmıyor.',
        ]);
    }

    public function revaluations(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->fx->history($request->user()->company, $request->integer('limit', 24)),
        ]);
    }
}
