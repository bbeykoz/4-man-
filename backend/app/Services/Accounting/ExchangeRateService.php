<?php

namespace App\Services\Accounting;

use App\Models\Accounting\ExchangeRate;
use App\Models\Company;
use App\Support\AppTime;
use App\Support\CountryPack;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Kur yönetimi.
 *
 * Kur her zaman defter para birimine çevirmek için isteniyor: "1 birim X kaç
 * birim defter parası eder". Çift bulunamazsa ters çift denenir, sonra
 * üçgenleme (X → EUR → defter) denenir.
 *
 * Sabit kurlar ülke paketinden geliyor ve değiştirilemiyor. Bulgaristan'da
 * 1 EUR = 1.95583 BGN mevzuatla belirli; piyasa kuru değil.
 */
class ExchangeRateService
{
    public function __construct(private readonly AuditService $audit) {}

    /** Ülke paketindeki sabit kurları kurar (BGN legacy gibi). */
    public function installFixedRates(Company $company): int
    {
        $pack  = CountryPack::forCompany($company);
        $eski  = $pack['legacy_currency'] ?? null;

        if (! $eski) {
            return 0;
        }

        $varMi = ExchangeRate::where('company_id', $company->id)
            ->forPair($pack['currency'], $eski['code'])
            ->where('is_fixed', true)
            ->exists();

        if ($varMi) {
            return 0;
        }

        ExchangeRate::create([
            'company_id'     => $company->id,
            'base_currency'  => $pack['currency'],
            'quote_currency' => $eski['code'],
            // Geçiş tarihinden önceki her gün için geçerli; tek kayıt yeterli
            // çünkü asOf sorgusu en yakın önceki kuru alıyor.
            'rate_date'      => '1999-01-01',
            'rate'           => $eski['fixed_rate'],
            'source'         => 'FIXED',
            'is_fixed'       => true,
            'note'           => "Mevzuatla belirlenen sabit dönüşüm kuru. {$eski['until']} tarihine kadar {$eski['code']} kullanıldı.",
        ]);

        $this->audit->log(
            companyId: $company->id, action: 'fx.fixed_rate_installed',
            entityType: 'ExchangeRate',
            payload: ['pair' => "{$pack['currency']}/{$eski['code']}", 'rate' => $eski['fixed_rate']],
        );

        return 1;
    }

    /**
     * Kur kaydeder.
     *
     * Elle girilen kur gerekçe ister; resmî kaynaktan gelen istemez.
     */
    public function store(Company $company, array $data): ExchangeRate
    {
        $base  = strtoupper($data['base_currency']);
        $quote = strtoupper($data['quote_currency']);

        if ($base === $quote) {
            throw ValidationException::withMessages(['quote_currency' => 'Aynı para birimi için kur tanımlanmaz.']);
        }

        $kaynak = strtoupper($data['source'] ?? 'MANUAL');

        if ($kaynak === 'MANUAL' && blank($data['reason'] ?? null)) {
            throw ValidationException::withMessages([
                'reason' => 'Elle girilen kur için gerekçe zorunludur. Resmî kaynaktan gelen kurlarda kaynak adını belirtin.',
            ]);
        }

        if ($kaynak === 'FIXED') {
            throw ValidationException::withMessages([
                'source' => 'Sabit kur elle tanımlanamaz; ülke paketinden gelir.',
            ]);
        }

        // Aynı gün aynı kaynaktan ikinci kur gelirse üzerine yazılır; kur
        // düzeltmeleri normaldir ve geçmiş fişleri etkilemez.
        $mevcut = ExchangeRate::where('company_id', $company->id)
            ->forPair($base, $quote)
            ->whereDate('rate_date', $data['rate_date'])
            ->where('source', $kaynak)
            ->first();

        if ($mevcut?->is_fixed) {
            throw ValidationException::withMessages(['rate' => 'Bu çift sabit kurlu; değiştirilemez.']);
        }

        $kur = $mevcut ?? new ExchangeRate([
            'id'             => (string) Str::uuid(),
            'company_id'     => $company->id,
            'base_currency'  => $base,
            'quote_currency' => $quote,
            'rate_date'      => $data['rate_date'],
            'source'         => $kaynak,
        ]);

        $kur->fill([
            'rate'         => $data['rate'],
            'note'         => $data['note'] ?? null,
            'reason'       => $data['reason'] ?? null,
            'entered_by'   => auth()->id(),
            'retrieved_at' => now(),
            'is_fixed'     => false,
        ])->save();

        $this->audit->log(
            companyId: $company->id,
            action:    $mevcut ? 'fx.rate_updated' : 'fx.rate_added',
            entityType:'ExchangeRate', entityId: $kur->id,
            payload:   ['pair' => $kur->pair(), 'date' => $data['rate_date'], 'rate' => (string) $data['rate'], 'source' => $kaynak],
            reason:    $data['reason'] ?? null,
        );

        return $kur->fresh();
    }

    /**
     * 1 birim $paraBirimi kaç birim defter parası eder.
     *
     * Sıra: doğrudan çift → ters çift → EUR üzerinden üçgenleme.
     *
     * @return array{rate: float, source: string, rate_date: string, method: string}
     */
    public function resolve(Company $company, string $paraBirimi, ?string $tarih = null): array
    {
        $defter = $company->functionalCurrency();
        $para   = strtoupper($paraBirimi);
        $gun    = $tarih ?: AppTime::today()->toDateString();

        if ($para === $defter) {
            return ['rate' => 1.0, 'source' => 'SAME', 'rate_date' => $gun, 'method' => 'direct'];
        }

        // Doğrudan: 1 para = ? defter
        if ($k = $this->find($company, $para, $defter, $gun)) {
            return ['rate' => (float) $k->rate, 'source' => $k->source,
                    'rate_date' => $k->rate_date->toDateString(), 'method' => 'direct'];
        }

        // Ters kayıt: 1 defter = ? para → tersini al
        if ($k = $this->find($company, $defter, $para, $gun)) {
            return ['rate' => $k->inverse(), 'source' => $k->source,
                    'rate_date' => $k->rate_date->toDateString(), 'method' => 'inverse'];
        }

        // Üçgenleme: her ikisi de EUR üzerinden tanımlıysa
        $ara = 'EUR';

        if ($para !== $ara && $defter !== $ara) {
            $a = $this->find($company, $para, $ara, $gun) ?? $this->find($company, $ara, $para, $gun);
            $b = $this->find($company, $ara, $defter, $gun) ?? $this->find($company, $defter, $ara, $gun);

            if ($a && $b) {
                $paraEur   = $a->base_currency === $para ? (float) $a->rate : $a->inverse();
                $eurDefter = $b->base_currency === $ara ? (float) $b->rate : $b->inverse();

                return [
                    'rate'      => round($paraEur * $eurDefter, 10),
                    'source'    => "{$a->source}+{$b->source}",
                    'rate_date' => min($a->rate_date->toDateString(), $b->rate_date->toDateString()),
                    'method'    => 'triangulated',
                ];
            }
        }

        throw ValidationException::withMessages([
            'exchange_rate' => "$para → $defter kuru $gun tarihi için tanımlı değil. Kur tablosuna ekleyin.",
        ]);
    }

    /** Tutarı defter para birimine çevirir. */
    public function convert(Company $company, float $tutar, string $paraBirimi, ?string $tarih = null): array
    {
        $kur = $this->resolve($company, $paraBirimi, $tarih);

        return $kur + [
            'amount'          => round($tutar, 2),
            'converted'       => round($tutar * $kur['rate'], 2),
            'from'            => strtoupper($paraBirimi),
            'to'              => $company->functionalCurrency(),
        ];
    }

    /** Kur listesi; arayüz ve rapor için. */
    public function listing(Company $company, ?string $paraBirimi = null, int $limit = 100): array
    {
        return ExchangeRate::where('company_id', $company->id)
            ->when($paraBirimi, fn ($q) => $q->where(fn ($s) => $s
                ->where('base_currency', strtoupper($paraBirimi))
                ->orWhere('quote_currency', strtoupper($paraBirimi))))
            ->orderByDesc('rate_date')->orderBy('base_currency')
            ->limit($limit)
            ->get()
            ->map(fn (ExchangeRate $k) => [
                'id'        => $k->id,
                'pair'      => $k->pair(),
                'base'      => $k->base_currency,
                'quote'     => $k->quote_currency,
                'rate_date' => $k->rate_date->toDateString(),
                'rate'      => (float) $k->rate,
                'inverse'   => $k->inverse(),
                'source'    => $k->source,
                'is_fixed'  => $k->is_fixed,
                'note'      => $k->note,
                'reason'    => $k->reason,
            ])->all();
    }

    /** Şirketin defterinde geçen yabancı para birimleri. */
    public function currenciesInUse(Company $company): array
    {
        $defter = $company->functionalCurrency();

        $belgeler = DB::table('documents')->where('company_id', $company->id)
            ->whereNotNull('currency')->distinct()->pluck('currency');

        $satirlar = DB::table('journal_lines')->where('company_id', $company->id)
            ->whereNotNull('txn_currency')->distinct()->pluck('txn_currency');

        return $belgeler->merge($satirlar)
            ->filter(fn ($p) => $p && $p !== $defter)
            ->unique()->values()->all();
    }

    private function find(Company $company, string $base, string $quote, string $tarih): ?ExchangeRate
    {
        return ExchangeRate::where(fn ($q) => $q->where('company_id', $company->id)->orWhereNull('company_id'))
            ->forPair($base, $quote)
            ->asOf($tarih)
            ->first();
    }
}
