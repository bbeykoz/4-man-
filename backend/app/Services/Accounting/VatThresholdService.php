<?php

namespace App\Services\Accounting;

use App\Models\Accounting\JournalEntry;
use App\Models\Company;
use App\Support\AppTime;
use App\Support\CountryPack;
use Illuminate\Support\Facades\DB;

/**
 * Zorunlu KDV kayıt eşiği takibi (doküman §6.1).
 *
 * Bulgaristan'da 2026 eşiği 51.130 EUR. Eşik, ciro tanımı ve hesaplama
 * penceresi mevzuatla değişir; sayı ülke paketinden okunur, kod içinde durmaz.
 *
 * Ciro burada "gelir hesaplarına yazılan alacak toplamı" olarak alınıyor.
 * Mevzuattaki ciro tanımı bundan farklı olabilir (istisna işlemler, varlık
 * satışı); kesin tanım yerel danışman onayı ister.
 */
class VatThresholdService
{
    /** Eşiğin yüzde kaçına gelince uyarı verilsin. */
    private const UYARI_ORANI = 0.80;

    public function __construct(private readonly AuditService $audit) {}

    /**
     * Şirketin eşik durumunu hesaplar ve kaydeder.
     *
     * @param  string|null  $bitis  Pencerenin son günü; verilmezse bugün.
     */
    public function check(Company $company, ?string $bitis = null): array
    {
        $pack  = CountryPack::forCompany($company);
        $esik  = $pack['vat_threshold'] ?? null;

        if ($esik === null) {
            return [
                'applicable' => false,
                'message'    => "{$pack['name']} için ciro bazlı zorunlu KDV kayıt eşiği tanımlı değil.",
            ];
        }

        $bit = $bitis ?? AppTime::today()->toDateString();
        // Son 12 ay; mevzuattaki pencere farklıysa ülke paketinden okunur.
        $bas = \Illuminate\Support\Carbon::parse($bit)->subYear()->addDay()->toDateString();

        $ciro = $this->turnover($company, $bas, $bit);
        $sinir = (float) $esik['amount'];
        $oran  = $sinir > 0 ? $ciro / $sinir : 0.0;

        $seviye = match (true) {
            $ciro >= $sinir                 => 'exceeded',
            $oran >= self::UYARI_ORANI      => 'warning',
            default                         => 'ok',
        };

        $kayit = [
            'company_id'   => $company->id,
            'window_start' => $bas,
            'window_end'   => $bit,
            'turnover'     => $ciro,
            'threshold'    => $sinir,
            'currency'     => $esik['currency'],
            'ratio'        => round($oran, 4),
            'level'        => $seviye,
            'checked_at'   => now(),
        ];

        DB::table('vat_threshold_checks')->insert(['id' => (string) \Illuminate\Support\Str::uuid()] + $kayit);

        if ($seviye !== 'ok' && ! $company->vat_registered) {
            $this->audit->log(
                companyId: $company->id,
                action:    $seviye === 'exceeded' ? 'tax.threshold_exceeded' : 'tax.threshold_warning',
                entityType:'Company', entityId: $company->id,
                payload:   $kayit,
            );
        }

        return [
            'applicable'    => true,
            'window_start'  => $bas,
            'window_end'    => $bit,
            'turnover'      => round($ciro, 2),
            'threshold'     => $sinir,
            'currency'      => $esik['currency'],
            'ratio'         => round($oran, 4),
            'remaining'     => round(max($sinir - $ciro, 0), 2),
            'level'         => $seviye,
            'vat_registered'=> (bool) $company->vat_registered,
            'message'       => $this->message($seviye, $company, $ciro, $sinir, $esik['currency']),
            'checked_at'    => AppTime::now()->toIso8601String(),
        ];
    }

    /**
     * Ciro simülasyonu: planlanan ek satış eşiği aşar mı.
     * Doküman §6.1 "yaklaşma uyarısı ve simülasyon".
     */
    public function simulate(Company $company, float $ekCiro): array
    {
        $durum = $this->check($company);

        if (! $durum['applicable']) {
            return $durum;
        }

        $yeni  = $durum['turnover'] + $ekCiro;
        $asar  = $yeni >= $durum['threshold'];

        return $durum + [
            'simulated_turnover' => round($yeni, 2),
            'additional'         => round($ekCiro, 2),
            'would_exceed'       => $asar,
            'simulation_message' => $asar
                ? sprintf('%s %s ek ciro eşiği aşar; KDV kaydı zorunlu hale gelir.',
                    number_format($ekCiro, 2, ',', '.'), $durum['currency'])
                : sprintf('Eşiğe %s %s kalır.',
                    number_format($durum['threshold'] - $yeni, 2, ',', '.'), $durum['currency']),
        ];
    }

    /** Geçmiş kontroller. */
    public function history(Company $company, int $limit = 30): array
    {
        return DB::table('vat_threshold_checks')
            ->where('company_id', $company->id)
            ->orderByDesc('checked_at')
            ->limit($limit)
            ->get()
            ->map(fn ($s) => [
                'window_start' => $s->window_start,
                'window_end'   => $s->window_end,
                'turnover'     => round((float) $s->turnover, 2),
                'threshold'    => round((float) $s->threshold, 2),
                'ratio'        => round((float) $s->ratio, 4),
                'level'        => $s->level,
                'checked_at'   => $s->checked_at,
            ])->all();
    }

    /** Gelir hesaplarının net alacak toplamı. İade ve iskonto borç tarafında düşer. */
    private function turnover(Company $company, string $bas, string $bit): float
    {
        $satir = DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
            ->where('l.company_id', $company->id)
            ->whereIn('e.status', ['posted', 'reversed'])
            ->where('a.account_type', 'revenue')
            ->whereDate('e.posting_date', '>=', $bas)
            ->whereDate('e.posting_date', '<=', $bit)
            ->selectRaw('COALESCE(SUM(l.credit) - SUM(l.debit), 0) AS ciro')
            ->first();

        return round((float) ($satir->ciro ?? 0), 2);
    }

    private function message(string $seviye, Company $company, float $ciro, float $sinir, string $para): string
    {
        $c = number_format($ciro, 2, ',', '.');
        $s = number_format($sinir, 2, ',', '.');

        if ($company->vat_registered) {
            return "Şirket KDV mükellefi. Son 12 ay cirosu $c $para (eşik $s $para).";
        }

        return match ($seviye) {
            'exceeded' => "Ciro eşiği aşıldı: $c $para / $s $para. Zorunlu KDV kaydı için yerel danışmana başvurun.",
            'warning'  => "Ciro eşiğe yaklaştı: $c $para / $s $para.",
            default    => "Ciro eşiğin altında: $c $para / $s $para.",
        };
    }
}
