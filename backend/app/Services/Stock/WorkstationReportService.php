<?php

namespace App\Services\Stock;

use App\Support\AppTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Workstation raporu: hangi bölüm / kişi / depo ne kadar çalışmış.
 *
 * Kırılım üç türlü olabilir (bölüm, personel, depo) ve dört ölçü verilir:
 * işlem adedi, taşınan miktar, ortalama işlem süresi, saatlik yoğunluk.
 * Her ölçü seçilen dönem ile bir önceki eşit uzunluktaki dönem karşılaştırılır.
 *
 * Veri kaynağı modül kayıt tablolarıdır. Tabloların alanları aynı değil:
 * miktar yalnız depo kayıtlarında, tamamlanma zamanı bazı modüllerde yok.
 * Eksik ölçüler null döner; arayüz "—" gösterir.
 */
class WorkstationReportService
{
    public const GROUPS = ['module', 'user', 'warehouse'];

    /**
     * Modül tabloları.
     * tamamlanma: işlem süresini hesaplamak için bitiş alanı (yoksa süre verilmez)
     * miktar:     taşınan miktar alanı (yoksa miktar verilmez)
     */
    private const MODULLER = [
        'warehouse'  => ['tablo' => 'warehouse_records',  'ad' => 'Depo',            'tamamlanma' => 'posted_at',    'miktar' => 'quantity'],
        'packaging'  => ['tablo' => 'packaging_records',  'ad' => 'Paketleme',       'tamamlanma' => 'completed_at', 'miktar' => null],
        'shipping'   => ['tablo' => 'shipping_records',   'ad' => 'Nakliye',         'tamamlanma' => null,           'miktar' => null],
        'returns'    => ['tablo' => 'return_records',     'ad' => 'İade',            'tamamlanma' => 'completed_at', 'miktar' => null],
        'customs'    => ['tablo' => 'customs_records',    'ad' => 'Gümrük',          'tamamlanma' => 'completed_at', 'miktar' => null],
        'accounting' => ['tablo' => 'accounting_records', 'ad' => 'Muhasebe',        'tamamlanma' => 'completed_at', 'miktar' => null],
        'marketing'  => ['tablo' => 'marketing_records',  'ad' => 'Pazarlama',       'tamamlanma' => 'completed_at', 'miktar' => null],
    ];

    public function report(string $companyId, string $groupBy, Carbon $from, Carbon $to): array
    {
        $groupBy = in_array($groupBy, self::GROUPS, true) ? $groupBy : 'module';

        // Önceki dönem: seçilen aralıkla aynı uzunlukta, hemen öncesi
        $gun     = max(1, (int) round($from->diffInDays($to)) + 1);
        $oncekiS = $from->copy()->subDays($gun);
        $oncekiB = $from->copy()->subSecond();

        $simdi  = $this->topla($companyId, $groupBy, $from, $to);
        $onceki = $this->topla($companyId, $groupBy, $oncekiS, $oncekiB);

        $satirlar = $this->birlestir($simdi, $onceki, $groupBy);
        $toplam   = $this->toplamSatir($satirlar);

        return [
            'group_by' => $groupBy,
            'period'   => [
                'from' => $from->toDateString(),
                'to'   => $to->toDateString(),
                'days' => $gun,
                'previous_from' => $oncekiS->toDateString(),
                'previous_to'   => $oncekiB->toDateString(),
            ],
            'rows'    => $satirlar->values()->all(),
            'totals'  => $toplam,
            'hourly'  => $this->saatlik($companyId, $groupBy, $from, $to),
            'notes'   => $this->notlar($groupBy),
        ];
    }

    // ─── Toplama ────────────────────────────────────────────────────

    /** @return Collection<string, array> anahtar → ham ölçüler */
    private function topla(string $companyId, string $groupBy, Carbon $from, Carbon $to): Collection
    {
        $sonuc = collect();

        foreach (self::MODULLER as $anahtar => $m) {
            // Depo kırılımında yalnız depo bilgisi taşıyan kayıtlar anlamlı
            if ($groupBy === 'warehouse' && $anahtar !== 'warehouse') {
                continue;
            }

            $q = DB::table($m['tablo'] . ' as r')
                ->where('r.company_id', $companyId)
                ->whereNull('r.deleted_at')
                ->whereBetween('r.created_at', [$from->copy()->utc(), $to->copy()->utc()]);

            // Süre: açılıştan tamamlanmaya geçen dakika
            $sureIfade = $m['tamamlanma']
                ? "AVG(EXTRACT(EPOCH FROM (r.{$m['tamamlanma']} - r.created_at)) / 60) FILTER (WHERE r.{$m['tamamlanma']} IS NOT NULL)"
                : 'NULL';
            $miktarIfade = $m['miktar'] ? "SUM(r.{$m['miktar']})" : 'NULL';

            $secim = [
                DB::raw('COUNT(*) as adet'),
                DB::raw("{$miktarIfade} as miktar"),
                DB::raw("{$sureIfade} as dakika"),
                DB::raw('MAX(r.created_at) as son'),
            ];

            match ($groupBy) {
                'user' => $q->leftJoin('users as u', 'u.id', '=', 'r.created_by')
                    ->groupBy('r.created_by', 'u.name')
                    ->addSelect(['r.created_by as anahtar', DB::raw("COALESCE(u.name, 'Bilinmiyor') as etiket")]),
                'warehouse' => $q->leftJoin('warehouses as w', 'w.id', '=', 'r.warehouse_id')
                    ->groupBy('r.warehouse_id', 'w.name')
                    ->addSelect(['r.warehouse_id as anahtar', DB::raw("COALESCE(w.name, 'Depo atanmamış') as etiket")]),
                default => $q->addSelect([
                    DB::raw("'{$anahtar}' as anahtar"),
                    DB::raw("'{$m['ad']}' as etiket"),
                ]),
            };

            foreach ($q->addSelect($secim)->get() as $row) {
                $k = (string) ($row->anahtar ?? $anahtar);
                $v = $sonuc->get($k, [
                    'key' => $k, 'label' => $row->etiket,
                    'records' => 0, 'quantity' => null, 'minutes_sum' => 0.0, 'minutes_n' => 0, 'last' => null,
                    'supports_quantity' => false, 'supports_duration' => false,
                ]);

                $v['records'] += (int) $row->adet;

                if ($m['miktar']) {
                    $v['supports_quantity'] = true;
                    $v['quantity'] = round((float) ($v['quantity'] ?? 0) + (float) ($row->miktar ?? 0), 3);
                }
                if ($m['tamamlanma'] && $row->dakika !== null) {
                    $v['supports_duration'] = true;
                    // Modüller arası ortalama, kayıt adedine göre ağırlıklandırılır
                    $v['minutes_sum'] += (float) $row->dakika * (int) $row->adet;
                    $v['minutes_n']   += (int) $row->adet;
                }
                if ($row->son && (!$v['last'] || $row->son > $v['last'])) {
                    $v['last'] = $row->son;
                }

                $sonuc[$k] = $v;
            }
        }

        return $sonuc;
    }

    /** Şimdiki ve önceki dönemi tek satırda birleştirir. */
    private function birlestir(Collection $simdi, Collection $onceki, string $groupBy): Collection
    {
        $dk = fn(array $v) => $v['minutes_n'] > 0 ? round($v['minutes_sum'] / $v['minutes_n'], 1) : null;

        return $simdi
            ->map(function (array $v, string $k) use ($onceki, $dk) {
                $o = $onceki->get($k);

                return [
                    'key'               => $k,
                    'label'             => $v['label'],
                    'records'           => $v['records'],
                    'records_prev'      => $o['records'] ?? 0,
                    'quantity'          => $v['supports_quantity'] ? round((float) $v['quantity'], 3) : null,
                    'quantity_prev'     => ($o && $o['supports_quantity']) ? round((float) $o['quantity'], 3) : null,
                    'avg_minutes'       => $dk($v),
                    'avg_minutes_prev'  => $o ? $dk($o) : null,
                    'last_activity'     => $v['last'] ? Carbon::parse($v['last'])->toISOString() : null,
                    'supports_quantity' => $v['supports_quantity'],
                    'supports_duration' => $v['supports_duration'],
                ];
            })
            ->sortByDesc('records');
    }

    private function toplamSatir(Collection $satirlar): array
    {
        $sureli = $satirlar->filter(fn($r) => $r['avg_minutes'] !== null);

        return [
            'records'      => (int) $satirlar->sum('records'),
            'records_prev' => (int) $satirlar->sum('records_prev'),
            'quantity'     => round((float) $satirlar->sum(fn($r) => $r['quantity'] ?? 0), 3),
            'groups'       => $satirlar->count(),
            // Grup ortalamalarının kayıt adedine göre ağırlıklı ortalaması
            'avg_minutes'  => $sureli->isEmpty() ? null : round(
                $sureli->sum(fn($r) => $r['avg_minutes'] * $r['records']) / max(1, $sureli->sum('records')),
                1,
            ),
        ];
    }

    // ─── Saatlik yoğunluk ───────────────────────────────────────────

    /** Gün içindeki 24 saatlik dağılım (Türkiye saatine göre). */
    private function saatlik(string $companyId, string $groupBy, Carbon $from, Carbon $to): array
    {
        $kovalar = array_fill(0, 24, 0);

        foreach (self::MODULLER as $anahtar => $m) {
            if ($groupBy === 'warehouse' && $anahtar !== 'warehouse') {
                continue;
            }

            $saat = 'EXTRACT(HOUR FROM ' . AppTime::sqlLocal('created_at') . ')';

            $rows = DB::table($m['tablo'])
                ->where('company_id', $companyId)
                ->whereNull('deleted_at')
                ->whereBetween('created_at', [$from->copy()->utc(), $to->copy()->utc()])
                ->groupBy(DB::raw($saat))
                ->get([DB::raw("{$saat} as saat"), DB::raw('COUNT(*) as adet')]);

            foreach ($rows as $r) {
                $kovalar[(int) $r->saat] += (int) $r->adet;
            }
        }

        return collect($kovalar)
            ->map(fn(int $adet, int $saat) => ['hour' => $saat, 'records' => $adet])
            ->values()
            ->all();
    }

    /** Kırılıma göre ölçü sınırlarını arayüze bildirir. */
    private function notlar(string $groupBy): array
    {
        $notlar = [];

        if ($groupBy === 'warehouse') {
            $notlar[] = 'Depo kırılımı yalnız depo kayıtlarını kapsar; diğer bölümlerin kayıtlarında depo bilgisi tutulmuyor.';
        } else {
            $notlar[] = 'Taşınan miktar yalnız depo kayıtlarında tutulur; diğer bölümlerde "—" görünür.';
            $notlar[] = 'Nakliye kayıtlarında tamamlanma zamanı tutulmadığı için işlem süresi hesaplanamıyor.';
        }

        return $notlar;
    }
}
