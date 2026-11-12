<?php

namespace App\Services\Platform;

use App\Models\ActivityLog;
use App\Models\Company;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Platform panelinin iki ayrı raporu:
 *   1. Kendi ekibimizin iş hacmi ve çalışma süresi
 *   2. Kiracı şirketlerin işlem hacmi (günlük / haftalık / aylık)
 *
 * Kaynak activity_logs. Çalışma süresi ayrı tutulmuyor, işlem zamanlarından
 * çıkarılıyor: art arda gelen iki işlem arası 30 dakikadan kısaysa aynı
 * oturum sayılır, uzunsa ara verilmiş kabul edilir. Giriş-çıkış saati
 * tutulmadığı için gerçek mesai değil, ekranda geçirilen etkin süredir.
 */
class PlatformAnalyticsService
{
    /** Bu süreden uzun boşluk yeni oturum sayılır. */
    private const OTURUM_BOSLUGU_DK = 30;

    /** Tek bir işlemin varsaydığımız süresi (oturumda tek kayıt varsa). */
    private const TEK_ISLEM_DK = 2;

    public function staff(array $filtre = []): array
    {
        [$bas, $bit] = $this->aralik($filtre);

        $ekip = User::whereNull('company_id')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'title', 'last_login_at', 'status']);

        if ($ekip->isEmpty()) {
            return ['period' => $this->donemBilgisi($bas, $bit), 'staff' => [], 'totals' => $this->bosToplam()];
        }

        // Ekip üyesi bir şirkete bağlanıp iş yaptıysa log o şirketin sahibine
        // yazılır; gerçek aktör impersonated_by sütununda. İkisi de sayılır.
        $loglar = ActivityLog::where(fn ($q) => $q
                ->whereIn('user_id', $ekip->pluck('id'))
                ->orWhereIn('impersonated_by', $ekip->pluck('id')))
            ->whereBetween('created_at', [$bas, $bit])
            ->orderBy('created_at')
            ->get(['user_id', 'impersonated_by', 'action', 'company_id', 'created_at']);

        $gruplu  = $loglar->groupBy(fn (ActivityLog $l) => $l->impersonated_by ?? $l->user_id);
        $ticket  = $this->ticketOzeti($ekip->pluck('id')->all(), $bas, $bit);
        $satirlar = [];

        foreach ($ekip as $kisi) {
            $kendi = $gruplu->get($kisi->id, collect());
            $sure  = $this->calismaSuresi($kendi->pluck('created_at'));

            $satirlar[] = [
                'id'              => $kisi->id,
                'name'            => $kisi->name,
                'email'           => $kisi->email,
                'title'           => $kisi->title,
                'status'          => $kisi->status,
                'actions'         => $kendi->count(),
                'active_days'     => $sure['gun'],
                'minutes'         => $sure['dakika'],
                'hours'           => round($sure['dakika'] / 60, 1),
                'avg_day_minutes' => $sure['gun'] > 0 ? (int) round($sure['dakika'] / $sure['gun']) : 0,
                'sessions'        => $sure['oturum'],
                'companies'       => $kendi->pluck('company_id')->filter()->unique()->count(),
                'last_action_at'  => $kendi->last()?->created_at?->toISOString(),
                'last_login_at'   => $kisi->last_login_at?->toISOString(),
                'top_actions'     => $this->enCokYapilan($kendi),
                'daily'           => $this->gunlukSeri($kendi, $bas, $bit),
                'tickets'         => $ticket[$kisi->id] ?? ['assigned' => 0, 'resolved' => 0],
            ];
        }

        // Çok çalışan üstte: iş hacmi raporunun ilk bakışta söylemesi gereken bu.
        usort($satirlar, fn ($a, $b) => $b['actions'] <=> $a['actions']);

        return [
            'period' => $this->donemBilgisi($bas, $bit),
            'staff'  => $satirlar,
            'totals' => [
                'people'       => count($satirlar),
                'actions'      => array_sum(array_column($satirlar, 'actions')),
                'minutes'      => array_sum(array_column($satirlar, 'minutes')),
                'hours'        => round(array_sum(array_column($satirlar, 'minutes')) / 60, 1),
                'tickets_done' => array_sum(array_map(fn ($s) => $s['tickets']['resolved'], $satirlar)),
            ],
        ];
    }

    /** Bir kişinin tek tek işlemleri; satıra tıklayınca açılan döküm. */
    public function staffDetail(string $userId, array $filtre = []): array
    {
        [$bas, $bit] = $this->aralik($filtre);

        $kisi = User::whereNull('company_id')->findOrFail($userId);

        $loglar = ActivityLog::where(fn ($q) => $q->where('user_id', $userId)->orWhere('impersonated_by', $userId))
            ->whereBetween('created_at', [$bas, $bit])
            ->with('company:id,name')
            ->orderByDesc('created_at')
            ->limit(500)
            ->get();

        return [
            'user'    => ['id' => $kisi->id, 'name' => $kisi->name, 'email' => $kisi->email],
            'period'  => $this->donemBilgisi($bas, $bit),
            'actions' => $loglar->map(fn (ActivityLog $l) => [
                'id'          => $l->id,
                'action'      => $l->action,
                'description' => $l->description,
                'model_type'  => $l->model_type,
                'company'     => $l->company?->name,
                'via_company' => $l->impersonated_by === $userId && $l->user_id !== $userId,
                'ip_address'  => $l->ip_address,
                'created_at'  => $l->created_at?->toISOString(),
            ])->all(),
        ];
    }

    public function companies(array $filtre = []): array
    {
        $kova = in_array($filtre['bucket'] ?? 'day', ['day', 'week', 'month'], true)
            ? $filtre['bucket'] ?? 'day'
            : 'day';

        [$bas, $bit] = $this->aralik($filtre);
        $uzunluk     = $bas->diffInSeconds($bit);
        $oncekiBas   = $bas->subSeconds($uzunluk);

        $sirketler = Company::orderBy('name')->get(['id', 'name', 'status']);
        $adlar     = $sirketler->pluck('name', 'id');

        $toplamlar = $this->sirketToplamlari($bas, $bit, $filtre['company_id'] ?? null);
        $oncekiler = $this->sirketToplamlari($oncekiBas, $bas, $filtre['company_id'] ?? null);

        $satirlar = $sirketler
            ->filter(fn ($s) => empty($filtre['company_id']) || $s->id === $filtre['company_id'])
            ->map(function (Company $s) use ($toplamlar, $oncekiler) {
                $simdi  = (int) ($toplamlar[$s->id]->adet ?? 0);
                $onceki = (int) ($oncekiler[$s->id]->adet ?? 0);

                return [
                    'id'            => $s->id,
                    'name'          => $s->name,
                    'status'        => $s->status instanceof \BackedEnum ? $s->status->value : $s->status,
                    'actions'       => $simdi,
                    'active_users'  => (int) ($toplamlar[$s->id]->kullanici ?? 0),
                    'last_action_at'=> $toplamlar[$s->id]->son ?? null,
                    'previous'      => $onceki,
                    // Önceki dönem sıfırsa yüzde anlamsız; null bırakıp arayüzde "yeni" diyoruz.
                    'change_pct'    => $onceki > 0 ? round((($simdi - $onceki) / $onceki) * 100, 1) : null,
                ];
            })
            ->sortByDesc('actions')
            ->values()
            ->all();

        return [
            'period'  => $this->donemBilgisi($bas, $bit) + ['bucket' => $kova],
            'series'  => $this->sirketSerisi($bas, $bit, $kova, $adlar, $filtre['company_id'] ?? null),
            'companies' => $satirlar,
            'modules' => $this->modulDagilimi($bas, $bit, $filtre['company_id'] ?? null),
            'totals'  => [
                'actions'   => array_sum(array_column($satirlar, 'actions')),
                'previous'  => array_sum(array_column($satirlar, 'previous')),
                'companies' => count(array_filter($satirlar, fn ($s) => $s['actions'] > 0)),
            ],
        ];
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} */
    private function aralik(array $filtre): array
    {
        $bit = ! empty($filtre['date_to'])
            ? CarbonImmutable::parse($filtre['date_to'])->endOfDay()
            : CarbonImmutable::now()->endOfDay();

        if (! empty($filtre['date_from'])) {
            return [CarbonImmutable::parse($filtre['date_from'])->startOfDay(), $bit];
        }

        $gun = (int) ($filtre['days'] ?? 30);

        return [$bit->subDays(max($gun, 1) - 1)->startOfDay(), $bit];
    }

    private function donemBilgisi(CarbonImmutable $bas, CarbonImmutable $bit): array
    {
        return [
            'from' => $bas->toDateString(),
            'to'   => $bit->toDateString(),
            'days' => (int) $bas->diffInDays($bit) + 1,
        ];
    }

    private function bosToplam(): array
    {
        return ['people' => 0, 'actions' => 0, 'minutes' => 0, 'hours' => 0, 'tickets_done' => 0];
    }

    /**
     * İşlem zamanlarından etkin çalışma süresi.
     *
     * @param Collection<int, \Carbon\CarbonInterface> $zamanlar sıralı
     * @return array{dakika: int, gun: int, oturum: int}
     */
    private function calismaSuresi(Collection $zamanlar): array
    {
        if ($zamanlar->isEmpty()) {
            return ['dakika' => 0, 'gun' => 0, 'oturum' => 0];
        }

        $dakika  = 0;
        $oturum  = 1;
        $onceki  = null;
        $oturumIlk = null;
        $oturumSon = null;

        foreach ($zamanlar as $an) {
            if ($onceki === null) {
                $oturumIlk = $an;
            } elseif ($onceki->diffInMinutes($an) > self::OTURUM_BOSLUGU_DK) {
                $dakika += $this->oturumDakikasi($oturumIlk, $oturumSon);
                $oturum++;
                $oturumIlk = $an;
            }

            $oturumSon = $an;
            $onceki    = $an;
        }

        $dakika += $this->oturumDakikasi($oturumIlk, $oturumSon);

        return [
            'dakika' => (int) round($dakika),
            'gun'    => $zamanlar->map(fn ($t) => $t->toDateString())->unique()->count(),
            'oturum' => $oturum,
        ];
    }

    private function oturumDakikasi(?\Carbon\CarbonInterface $ilk, ?\Carbon\CarbonInterface $son): float
    {
        if (! $ilk || ! $son) {
            return 0;
        }

        $fark = $ilk->diffInMinutes($son);

        // Tek işlemlik oturum sıfır dakika görünmesin.
        return $fark > 0 ? $fark : self::TEK_ISLEM_DK;
    }

    private function enCokYapilan(Collection $loglar): array
    {
        return $loglar->groupBy('action')
            ->map->count()
            ->sortDesc()
            ->take(5)
            ->map(fn ($adet, $eylem) => ['action' => $eylem, 'count' => $adet])
            ->values()
            ->all();
    }

    private function gunlukSeri(Collection $loglar, CarbonImmutable $bas, CarbonImmutable $bit): array
    {
        $sayim = $loglar->groupBy(fn ($l) => $l->created_at->toDateString())->map->count();
        $seri  = [];

        for ($gun = $bas; $gun->lessThanOrEqualTo($bit); $gun = $gun->addDay()) {
            $anahtar = $gun->toDateString();
            $seri[]  = ['date' => $anahtar, 'count' => (int) ($sayim[$anahtar] ?? 0)];
        }

        return $seri;
    }

    private function ticketOzeti(array $userIds, CarbonImmutable $bas, CarbonImmutable $bit): array
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('tickets')) {
            return [];
        }

        $satirlar = DB::table('tickets')
            ->whereIn('assigned_to', $userIds)
            ->whereBetween('updated_at', [$bas, $bit])
            ->selectRaw("assigned_to, count(*) as atanan, count(*) filter (where status in ('resolved','closed')) as cozulen")
            ->groupBy('assigned_to')
            ->get();

        return $satirlar->mapWithKeys(fn ($r) => [
            $r->assigned_to => ['assigned' => (int) $r->atanan, 'resolved' => (int) $r->cozulen],
        ])->all();
    }

    private function sirketToplamlari(CarbonImmutable $bas, CarbonImmutable $bit, ?string $sirket): Collection
    {
        return ActivityLog::whereBetween('created_at', [$bas, $bit])
            ->whereNotNull('company_id')
            ->when($sirket, fn ($q) => $q->where('company_id', $sirket))
            ->selectRaw('company_id, count(*) as adet, count(distinct user_id) as kullanici, max(created_at) as son')
            ->groupBy('company_id')
            ->get()
            ->keyBy('company_id');
    }

    private function sirketSerisi(
        CarbonImmutable $bas,
        CarbonImmutable $bit,
        string $kova,
        Collection $adlar,
        ?string $sirket,
    ): array {
        // $kova yalnız day/week/month olabilir; çağıran doğruluyor.
        $satirlar = ActivityLog::whereBetween('created_at', [$bas, $bit])
            ->whereNotNull('company_id')
            ->when($sirket, fn ($q) => $q->where('company_id', $sirket))
            ->selectRaw("date_trunc('{$kova}', created_at) as kova, company_id, count(*) as adet")
            ->groupBy('kova', 'company_id')
            ->orderBy('kova')
            ->get();

        $gruplu = $satirlar->groupBy(fn ($r) => CarbonImmutable::parse($r->kova)->toDateString());

        return $gruplu->map(function (Collection $grup, string $tarih) use ($adlar) {
            $sirketler = $grup->mapWithKeys(fn ($r) => [
                ($adlar[$r->company_id] ?? 'Bilinmeyen') => (int) $r->adet,
            ])->all();

            return [
                'date'      => $tarih,
                'total'     => array_sum($sirketler),
                'companies' => $sirketler,
            ];
        })->values()->all();
    }

    /** İşlem adının ilk parçası modülü veriyor: warehouse.record.created → warehouse */
    private function modulDagilimi(CarbonImmutable $bas, CarbonImmutable $bit, ?string $sirket): array
    {
        $satirlar = ActivityLog::whereBetween('created_at', [$bas, $bit])
            ->whereNotNull('company_id')
            ->when($sirket, fn ($q) => $q->where('company_id', $sirket))
            ->selectRaw("split_part(action, '.', 1) as modul, count(*) as adet")
            ->groupBy('modul')
            ->orderByDesc('adet')
            ->limit(12)
            ->get();

        return $satirlar->map(fn ($r) => ['module' => $r->modul, 'count' => (int) $r->adet])->all();
    }
}
