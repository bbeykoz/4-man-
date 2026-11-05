<?php

namespace App\Services\Stock;

use App\Models\DailyCheckTask;
use App\Models\DailyTaskCheck;
use App\Models\Modules\WarehouseRecord;
use App\Models\ProductDailyCheck;
use App\Models\PurchaseOrder;
use App\Models\StockAnomaly;
use App\Models\StockMovement;
use App\Models\StockReservation;
use App\Models\WarehouseProduct;
use App\Support\AppTime;
use Illuminate\Support\Facades\DB;

/**
 * Panel ana sayfası için depo bölümlerinin özeti.
 *
 * Depo sekmelerinin her biri için ayrı ayrı istek atmak yerine tek seferde
 * özet üretir. Ağır analiz servisleri (risk, SKT, ABC) burada çalıştırılmaz;
 * özetler doğrudan defter ve kayıt tablolarından sayılır, böylece ana sayfa
 * hızlı açılır. Ayrıntı için kullanıcı ilgili sekmeye gider.
 */
class WarehouseSummaryService
{
    /** Kontrolcünün yaptığı işler: stoğu düzelten ve denetleyen kayıt tipleri. */
    private const KONTROL_TIPLERI = ['adjustment', 'stock_count', 'damage', 'inspection'];

    public function summary(string $companyId, int $gun = 7): array
    {
        [$baslangic, $bitis] = [
            AppTime::today()->copy()->subDays(max(0, $gun - 1)),
            AppTime::today()->copy()->endOfDay(),
        ];
        $aralik = [$baslangic->copy()->utc(), $bitis->copy()->utc()];

        return [
            'period'      => ['days' => $gun, 'from' => $baslangic->toDateString(), 'to' => $bitis->toDateString()],
            'control'     => $this->kontrolIsleri($companyId, $aralik, $gun),
            'daily_check' => $this->gunlukKontrol($companyId, $gun),
            'stock'       => $this->stokDurumu($companyId, $aralik, $gun),
            'booked'      => $this->booked($companyId, $aralik, $gun),
            'risk'        => $this->riskOzeti($companyId, $gun),
            'purchasing'  => $this->satinAlma($companyId, $aralik, $gun),
            'expiry'      => $this->sktVeOluStok($companyId, $gun),
            'transfers'   => $this->transferler($companyId, $aralik, $gun),
            'anomalies'   => $this->anomaliler($companyId, $gun),
            'workstation' => $this->workstation($companyId, $aralik, $gun),
        ];
    }

    // ─── Grafik serileri ────────────────────────────────────────────

    /**
     * Dönemdeki her gün için bir değer üretir: [['date' => 'Y-m-d', 'value' => 0], ...]
     * Veri olmayan günler 0 ile doldurulur; grafik çizgisi kopmaz.
     *
     * @param array<string, float|int> $degerler tarih → değer
     */
    private function seri(array $degerler, int $gun, ?string $bitisTarihi = null): array
    {
        $bitis = $bitisTarihi ? AppTime::startOfLocalDay($bitisTarihi) : AppTime::today();
        $cikti = [];

        for ($i = $gun - 1; $i >= 0; $i--) {
            $t = $bitis->copy()->subDays($i)->toDateString();
            $cikti[] = ['date' => $t, 'value' => round((float) ($degerler[$t] ?? 0), 3)];
        }

        return $cikti;
    }

    /** Bir tablodaki kayıtların gün bazında sayısı (Türkiye gününe göre). */
    private function gunlukSayim(string $tablo, string $companyId, array $aralik, ?callable $suzgec = null): array
    {
        $gunIfade = 'DATE(' . AppTime::sqlLocal('created_at') . ')';

        $q = DB::table($tablo)
            ->where('company_id', $companyId)
            ->whereBetween('created_at', $aralik)
            ->groupBy(DB::raw($gunIfade));

        if (DB::getSchemaBuilder()->hasColumn($tablo, 'deleted_at')) {
            $q->whereNull('deleted_at');
        }
        if ($suzgec) {
            $suzgec($q);
        }

        return $q->get([DB::raw("{$gunIfade} as g"), DB::raw('COUNT(*) as adet')])
            ->mapWithKeys(fn($r) => [substr((string) $r->g, 0, 10) => (int) $r->adet])
            ->all();
    }

    // ─── Depo kontrolcüsünün yaptığı işler ──────────────────────────

    /**
     * Kontrol işleri: sayım, denetim, hasar ve düzeltme kayıtları.
     *
     * Depo Müdürü ve Depo Kontrolcüsü aynı kayıt tablosunu kullanıyor; kaydın
     * hangi ekrandan açıldığı tutulmuyor. Bu yüzden "kontrolcü işi" hareket
     * tipinden çıkarılır.
     */
    private function kontrolIsleri(string $companyId, array $aralik, int $gun): array
    {
        $temel = fn() => WarehouseRecord::where('company_id', $companyId)
            ->whereIn('type', self::KONTROL_TIPLERI);

        $donem = (clone $temel())->whereBetween('created_at', $aralik);

        return [
            'records'    => (clone $donem)->count(),
            'by_type'    => (clone $donem)->select('type', DB::raw('count(*) as total'))
                ->groupBy('type')->pluck('total', 'type'),
            'pending'    => (clone $temel())->whereIn('status', ['pending', 'in_progress'])->count(),
            'qc_waiting' => WarehouseRecord::where('company_id', $companyId)
                ->where('qc_status', WarehouseRecord::QC_PENDING)->count(),
            'last_at'    => (clone $temel())->max('created_at'),
            'trend'      => $this->seri(
                $this->gunlukSayim('warehouse_records', $companyId, $aralik,
                    fn($q) => $q->whereIn('type', self::KONTROL_TIPLERI)),
                $gun,
            ),
            'trend_label' => 'Günlük kontrol kaydı',
        ];
    }

    // ─── Günlük kontrol ─────────────────────────────────────────────

    private function gunlukKontrol(string $companyId, int $gun): array
    {
        $bugun = AppTime::today()->toDateString();

        $urun       = WarehouseProduct::forCompany($companyId)->active()->count();
        $gorev      = DailyCheckTask::where('company_id', $companyId)->whereNull('deleted_at')->where('is_active', true)->count();
        $urunIsaret = ProductDailyCheck::where('company_id', $companyId)->where('check_date', $bugun)->where('is_checked', true)->count();
        $gorevIsaret= DailyTaskCheck::where('company_id', $companyId)->where('check_date', $bugun)->where('is_checked', true)->count();

        $toplam = $urun + $gorev;
        $yapilan = $urunIsaret + $gorevIsaret;

        return [
            'total'      => $toplam,
            'done'       => $yapilan,
            'remaining'  => max(0, $toplam - $yapilan),
            'percent'    => $toplam > 0 ? round($yapilan / $toplam * 100, 1) : null,
            'products'   => ['total' => $urun,  'done' => $urunIsaret],
            'tasks'      => ['total' => $gorev, 'done' => $gorevIsaret],
            // Gün bazında işaretlenen kontrol sayısı (ürün + görev)
            'trend'      => $this->seri($this->gunlukKontrolSerisi($companyId, $gun), $gun),
            'trend_label'=> 'İşaretlenen kontrol',
        ];
    }

    /** @return array<string, int> tarih → o gün işaretlenen kontrol sayısı */
    private function gunlukKontrolSerisi(string $companyId, int $gun): array
    {
        $baslangic = AppTime::today()->copy()->subDays($gun - 1)->toDateString();
        $toplam    = [];

        foreach (['product_daily_checks', 'daily_task_checks'] as $tablo) {
            $satirlar = DB::table($tablo)
                ->where('company_id', $companyId)
                ->where('is_checked', true)
                ->where('check_date', '>=', $baslangic)
                ->groupBy('check_date')
                ->get(['check_date', DB::raw('COUNT(*) as adet')]);

            foreach ($satirlar as $r) {
                $k = substr((string) $r->check_date, 0, 10);
                $toplam[$k] = ($toplam[$k] ?? 0) + (int) $r->adet;
            }
        }

        return $toplam;
    }

    // ─── Stok durumu ────────────────────────────────────────────────

    private function stokDurumu(string $companyId, array $aralik, int $gun): array
    {
        $kovalar = StockMovement::forCompany($companyId)
            ->select('bucket', DB::raw('SUM(quantity) as toplam'))
            ->groupBy('bucket')
            ->pluck('toplam', 'bucket');

        $urunler = WarehouseProduct::forCompany($companyId)->active()
            ->get(['id', 'current_stock', 'min_stock', 'unit_price']);

        return [
            'products'   => $urunler->count(),
            'available'  => round((float) ($kovalar[StockMovement::BUCKET_AVAILABLE] ?? 0), 3),
            'reserved'   => round((float) ($kovalar[StockMovement::BUCKET_RESERVED] ?? 0), 3),
            'quarantine' => round((float) ($kovalar[StockMovement::BUCKET_QUARANTINE] ?? 0), 3),
            'damaged'    => round((float) ($kovalar[StockMovement::BUCKET_DAMAGED] ?? 0), 3),
            'value'      => round($urunler->sum(fn($p) => (float) $p->current_stock * (float) ($p->unit_price ?? 0)), 2),
            'below_min'  => $urunler->filter(fn($p) => (float) $p->min_stock > 0 && (float) $p->current_stock <= (float) $p->min_stock)->count(),
            'out_of_stock' => $urunler->filter(fn($p) => (float) $p->current_stock <= 0)->count(),
            'trend'        => $this->seri($this->stokSerisi($companyId, $aralik, $gun), $gun),
            'trend_label'  => 'Kullanılabilir stok',
        ];
    }

    /**
     * Gün sonu kullanılabilir stok seviyesi.
     *
     * Dönem başındaki bakiyeden başlanır, her günün hareketi üstüne eklenir.
     * Böylece çizgi gerçek stok seviyesini gösterir, günlük hareketi değil.
     *
     * @return array<string, float>
     */
    private function stokSerisi(string $companyId, array $aralik, int $gun): array
    {
        $acilis = (float) StockMovement::forCompany($companyId)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->where('occurred_at', '<', $aralik[0])
            ->sum('quantity');

        $gunIfade = 'DATE(' . AppTime::sqlLocal('occurred_at') . ')';
        $gunluk = StockMovement::forCompany($companyId)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->whereBetween('occurred_at', $aralik)
            ->groupBy(DB::raw($gunIfade))
            ->get([DB::raw("{$gunIfade} as g"), DB::raw('SUM(quantity) as toplam')])
            ->mapWithKeys(fn($r) => [substr((string) $r->g, 0, 10) => (float) $r->toplam])
            ->all();

        $bitis   = AppTime::today();
        $bakiye  = $acilis;
        $seviye  = [];

        for ($i = $gun - 1; $i >= 0; $i--) {
            $t = $bitis->copy()->subDays($i)->toDateString();
            $bakiye += $gunluk[$t] ?? 0;
            $seviye[$t] = round($bakiye, 3);
        }

        return $seviye;
    }

    // ─── Booked ─────────────────────────────────────────────────────

    private function booked(string $companyId, array $aralik, int $gun): array
    {
        $acik = StockReservation::where('company_id', $companyId)->open()->get();

        return [
            'open'      => $acik->count(),
            'reserved'  => round($acik->sum(fn(StockReservation $r) => $r->remaining()), 3),
            'shortage'  => $acik->filter(fn(StockReservation $r) => $r->shortage() > 0)->count(),
            'delivered' => StockReservation::where('company_id', $companyId)
                ->where('status', StockReservation::STATUS_DELIVERED)->count(),
            'trend'       => $this->seri($this->gunlukSayim('stock_reservations', $companyId, $aralik), $gun),
            'trend_label' => 'Açılan rezervasyon',
        ];
    }

    // ─── Stok riski (son anlık görüntüden) ──────────────────────────

    /**
     * Risk sayıları gece alınan anlık görüntüden okunur; ana sayfada tüm
     * ürünler için risk hesabı çalıştırmak pahalıdır.
     */
    private function riskOzeti(string $companyId, int $gun): array
    {
        $sonTarih = DB::table('stock_risk_snapshots')->where('company_id', $companyId)->max('snapshot_date');

        if (!$sonTarih) {
            return [
                'snapshot_date' => null, 'levels' => [], 'critical' => 0, 'high' => 0, 'top' => [],
                'trend' => $this->seri([], $gun), 'trend_label' => 'Kritik + yüksek riskli ürün',
            ];
        }

        $satirlar = DB::table('stock_risk_snapshots as s')
            ->leftJoin('warehouse_products as p', 'p.id', '=', 's.product_id')
            ->where('s.company_id', $companyId)
            ->where('s.snapshot_date', $sonTarih)
            ->get(['s.risk_level', 's.risk_score', 'p.name']);

        return [
            'snapshot_date' => $sonTarih,
            'levels'   => $satirlar->groupBy('risk_level')->map->count(),
            'critical' => $satirlar->where('risk_level', 'critical')->count(),
            'high'     => $satirlar->where('risk_level', 'high')->count(),
            'top'      => $satirlar->sortByDesc('risk_score')->take(3)
                ->map(fn($r) => ['name' => $r->name, 'score' => (int) $r->risk_score, 'level' => $r->risk_level])
                ->values(),
            // Gece alınan anlık görüntülerden: gün bazında riskli ürün sayısı
            'trend' => $this->seri(
                DB::table('stock_risk_snapshots')
                    ->where('company_id', $companyId)
                    ->whereIn('risk_level', ['critical', 'high'])
                    ->where('snapshot_date', '>=', AppTime::today()->copy()->subDays($gun - 1)->toDateString())
                    ->groupBy('snapshot_date')
                    ->get(['snapshot_date', DB::raw('COUNT(*) as adet')])
                    ->mapWithKeys(fn($r) => [substr((string) $r->snapshot_date, 0, 10) => (int) $r->adet])
                    ->all(),
                $gun,
            ),
            'trend_label' => 'Kritik + yüksek riskli ürün',
        ];
    }

    // ─── Satın alma ─────────────────────────────────────────────────

    private function satinAlma(string $companyId, array $aralik, int $gun): array
    {
        $siparisler = PurchaseOrder::where('company_id', $companyId)->get(['id', 'status', 'expected_date', 'total_amount', 'received_at']);
        $bugun      = AppTime::today();

        $acik = $siparisler->whereIn('status', PurchaseOrder::OPEN_STATUSES);

        return [
            'draft'        => $siparisler->where('status', PurchaseOrder::STATUS_DRAFT)->count(),
            'open'         => $acik->count(),
            'open_amount'  => round((float) $acik->sum('total_amount'), 2),
            'overdue'      => $acik->filter(fn($po) => $po->expected_date && $po->expected_date->lt($bugun))->count(),
            'received_30d' => $siparisler->filter(fn($po) => $po->received_at && $po->received_at->gte($bugun->copy()->subDays(29)))->count(),
            'trend'        => $this->seri($this->gunlukSayim('purchase_orders', $companyId, $aralik), $gun),
            'trend_label'  => 'Açılan sipariş',
        ];
    }

    // ─── SKT ve ölü stok ────────────────────────────────────────────

    private function sktVeOluStok(string $companyId, int $gun): array
    {
        $bugun  = AppTime::today();
        $kritik = (int) config('stock.expiry_levels.critical', 30);

        // Lot bazında kullanılabilir bakiye; SKT'si olan lotlar
        $lotlar = StockMovement::forCompany($companyId)
            ->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->whereNotNull('expiry_date')
            ->select('product_id', 'warehouse_id', 'lot_number', 'expiry_date', DB::raw('SUM(quantity) as miktar'))
            ->groupBy('product_id', 'warehouse_id', 'lot_number', 'expiry_date')
            ->havingRaw('SUM(quantity) > 0.0005')
            ->get();

        $gecmis = $lotlar->filter(fn($l) => $l->expiry_date && $bugun->gt($l->expiry_date));
        $yakin  = $lotlar->filter(fn($l) => $l->expiry_date && !$bugun->gt($l->expiry_date)
            && $bugun->copy()->addDays($kritik)->gte($l->expiry_date));

        // Ölü stok: son 90 günde hiç çıkışı olmayan ama stoğu duran ürünler
        $hareketliUrun = StockMovement::forCompany($companyId)
            ->where('movement_type', 'stock_out')
            ->where('occurred_at', '>=', $bugun->copy()->subDays(90))
            ->distinct()->pluck('product_id');

        $oluStok = WarehouseProduct::forCompany($companyId)->active()
            ->where('current_stock', '>', 0)
            ->whereNotIn('id', $hareketliUrun)
            ->get(['id', 'current_stock', 'unit_price']);

        return [
            'expired_lots'  => $gecmis->count(),
            'expired_qty'   => round((float) $gecmis->sum('miktar'), 3),
            'critical_lots' => $yakin->count(),
            'critical_qty'  => round((float) $yakin->sum('miktar'), 3),
            'critical_days' => $kritik,
            'dead_products' => $oluStok->count(),
            'dead_value'    => round($oluStok->sum(fn($p) => (float) $p->current_stock * (float) ($p->unit_price ?? 0)), 2),
            // Bu çizgi geriye değil ileriye bakar: önümüzdeki günlerde SKT'si dolacak miktar
            'trend'         => $this->sktSerisi($lotlar, $gun),
            'trend_label'   => 'Önümüzdeki günlerde SKT dolan miktar',
            'trend_forward' => true,
        ];
    }

    /**
     * SKT çizgisi ileriye dönüktür: bugünden başlayarak her gün SKT'si dolan miktar.
     * Geçmiş trend burada anlamsız olurdu; planlama için önemli olan hangi gün ne kadar
     * stoğun son kullanma tarihinin dolacağıdır.
     *
     * @param \Illuminate\Support\Collection $lotlar
     */
    private function sktSerisi($lotlar, int $gun): array
    {
        $bugun = AppTime::today();
        $gunluk = [];

        foreach ($lotlar as $l) {
            if (!$l->expiry_date) {
                continue;
            }
            $t = substr((string) $l->expiry_date, 0, 10);
            $gunluk[$t] = ($gunluk[$t] ?? 0) + (float) $l->miktar;
        }

        $cikti = [];
        for ($i = 0; $i < $gun; $i++) {
            $t = $bugun->copy()->addDays($i)->toDateString();
            $cikti[] = ['date' => $t, 'value' => round((float) ($gunluk[$t] ?? 0), 3)];
        }

        return $cikti;
    }

    // ─── Depo transferleri ──────────────────────────────────────────

    private function transferler(string $companyId, array $aralik, int $gun): array
    {
        $temel = fn() => WarehouseRecord::where('company_id', $companyId)->where('type', 'transfer');

        return [
            'records'  => (clone $temel())->whereBetween('created_at', $aralik)->count(),
            'pending'  => (clone $temel())->whereIn('status', ['pending', 'in_progress'])->count(),
            'qty'      => round((float) (clone $temel())->whereBetween('created_at', $aralik)->sum('quantity'), 3),
            'last_at'  => (clone $temel())->max('created_at'),
            'trend'    => $this->seri(
                $this->gunlukSayim('warehouse_records', $companyId, $aralik, fn($q) => $q->where('type', 'transfer')),
                $gun,
            ),
            'trend_label' => 'Günlük transfer',
        ];
    }

    // ─── Anomaliler ─────────────────────────────────────────────────

    private function anomaliler(string $companyId, int $gun): array
    {
        $acik = StockAnomaly::where('company_id', $companyId)
            ->where('status', StockAnomaly::STATUS_OPEN)
            ->get(['type', 'severity', 'message', 'detected_for']);

        return [
            'open'     => $acik->count(),
            'severe'   => $acik->where('severity', '>=', 70)->count(),
            'by_type'  => $acik->groupBy('type')->map->count(),
            'top'      => $acik->sortByDesc('severity')->take(3)
                ->map(fn($a) => ['type' => $a->type, 'severity' => (int) $a->severity, 'message' => $a->message])
                ->values(),
            // Tespit gününe göre: hangi gün kaç anomali çıkmış
            'trend' => $this->seri(
                StockAnomaly::where('company_id', $companyId)
                    ->where('detected_for', '>=', AppTime::today()->copy()->subDays($gun - 1)->toDateString())
                    ->groupBy('detected_for')
                    ->get(['detected_for', DB::raw('COUNT(*) as adet')])
                    ->mapWithKeys(fn($r) => [substr((string) $r->detected_for, 0, 10) => (int) $r->adet])
                    ->all(),
                $gun,
            ),
            'trend_label' => 'Tespit edilen anomali',
        ];
    }

    // ─── Workstation ────────────────────────────────────────────────

    /** Dönemde en çok iş yapan ilk üç kişi ve toplam işlem. */
    private function workstation(string $companyId, array $aralik, int $gun): array
    {
        $satirlar = WarehouseRecord::where('warehouse_records.company_id', $companyId)
            ->whereBetween('warehouse_records.created_at', $aralik)
            ->leftJoin('users as u', 'u.id', '=', 'warehouse_records.created_by')
            ->groupBy('warehouse_records.created_by', 'u.name')
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->get([DB::raw("COALESCE(u.name, 'Bilinmiyor') as ad"), DB::raw('COUNT(*) as adet')]);

        return [
            'records' => (int) $satirlar->sum('adet'),
            'people'  => $satirlar->count(),
            'top'     => $satirlar->take(3)->map(fn($r) => ['name' => $r->ad, 'records' => (int) $r->adet])->values(),
            'trend'   => $this->seri($this->gunlukSayim('warehouse_records', $companyId, $aralik), $gun),
            'trend_label' => 'Günlük işlem',
        ];
    }
}
