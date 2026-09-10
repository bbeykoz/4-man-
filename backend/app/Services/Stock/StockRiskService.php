<?php

namespace App\Services\Stock;

use App\Models\WarehouseProduct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Stok risk skoru (0–100). Üç riskin en yükseği skoru belirler:
 * - stockout:   tedarik süresi boyunca tüketimin kullanılabilir stoğu aşma olasılığı
 * - below_min:  güvenlik stoğu / minimum stok altına düşme
 * - expiry:     SKT dolmadan tüketilemeyecek miktarın payı (FEFO sırasıyla)
 * Hesap saf fonksiyondur; what-if simülasyonu $modifiers ile aynı hesabı kullanır.
 */
class StockRiskService
{
    public function __construct(private readonly StockMetricsService $metrics) {}

    /**
     * @param array{demand_factor?: float, lead_time_extra_days?: int, safety_factor?: float} $modifiers
     * @return Collection<int, array>
     */
    public function assessCompany(string $companyId, ?string $warehouseId = null, array $modifiers = []): Collection
    {
        $products = WarehouseProduct::forCompany($companyId)->active()->with('defaultSupplier:id,name,default_lead_time_days')->orderBy('name')->get();
        $metrics  = $this->metrics->forProducts($companyId, $warehouseId, $products->pluck('id')->all());

        return $products->map(fn(WarehouseProduct $p) => $this->assess($p, $metrics[$p->id], $modifiers));
    }

    public function assess(WarehouseProduct $product, array $m, array $modifiers = []): array
    {
        $demandFactor  = (float) ($modifiers['demand_factor'] ?? 1.0);
        $leadTimeExtra = (int) ($modifiers['lead_time_extra_days'] ?? 0);

        // Tedarik süresi: ürün → varsayılan tedarikçi → sistem varsayılanı (tahmini)
        $supplierLead = $product->default_supplier_id ? $product->defaultSupplier?->default_lead_time_days : null;
        $leadTimeSet  = $product->lead_time_days !== null || $supplierLead !== null;
        $leadTime     = max(1, ($product->lead_time_days ?? $supplierLead ?? (int) config('stock.default_lead_time_days', 7)) + $leadTimeExtra);
        $review      = (int) config('stock.review_period_days', 7);
        $safety      = (float) ($product->safety_stock ?? 0) * (float) ($modifiers['safety_factor'] ?? 1.0);
        $minStock    = (float) ($product->min_stock ?? 0);
        $available   = max(0.0, (float) $m['available']);
        $onOrder     = (float) ($m['on_order'] ?? 0);  // tedarikçiye gönderilmiş, gelmemiş
        $inDraft     = (float) ($m['in_draft'] ?? 0);  // taslak siparişte
        $pipeline    = $available + $onOrder;           // gelecek siparişler dahil stok
        $daily       = (float) $m['daily_consumption'] * $demandFactor;
        $dailyStd    = (float) $m['daily_std'] * $demandFactor;
        $unit        = $product->unit ?: 'adet';

        $daysOfCover = $daily > 0 ? $available / $daily : null;

        // 1) Tükenme olasılığı; talep ~ N(μ, σ). İki durumun kötüsü:
        //    a) açık sipariş gelmeden eldeki stok biter mi (beklenen teslime kadar)
        //    b) tedarik süresi boyunca eldeki + yoldaki stok yeter mi
        $nextArrival  = $m['next_arrival_days'] ?? null;
        $stockoutProb = 0.0;
        $beforeArrivalProb = 0.0;
        if ($daily > 0) {
            $stockoutProb = $this->shortfallProbability($pipeline, $daily, $dailyStd, $leadTime);
            if ($onOrder > 0 && $nextArrival !== null) {
                $beforeArrivalProb = $nextArrival > 0
                    ? $this->shortfallProbability($available, $daily, $dailyStd, $nextArrival)
                    : 0.0;
                $stockoutProb = max($stockoutProb, $beforeArrivalProb);
            }
        } elseif ($pipeline <= 0 && $minStock > 0) {
            $stockoutProb = 1.0;
        }

        // 2) Güvenlik / minimum stok altı
        $belowScore = 0;
        if ($safety > 0 && $available <= $safety) {
            $belowScore = 75;
        } elseif ($minStock > 0 && $available <= $minStock) {
            $belowScore = 60;
        }

        // 3) SKT riski
        $expiry      = $this->expiryRisk($m['lots'], $daily);
        $expiryShare = $available > 0 ? min(1, $expiry['qty'] / $available) : 0;

        // 4) Sipariş noktası: tedarik + gözden geçirme süresi boyunca yetmeyecek stok (orta risk bandı 30–59)
        $reorderPoint = $daily > 0 ? $daily * ($leadTime + $review) + $safety : 0;
        $reorderScore = 0;
        if ($daily > 0 && $pipeline <= $reorderPoint) {
            $reorderScore = (int) round(30 + 29 * (1 - min(1, ($pipeline / $daily) / ($leadTime + $review))));
        }

        $components = [
            'stockout'  => (int) round($stockoutProb * 100),
            'below_min' => $belowScore,
            'expiry'    => (int) round($expiryShare * 80),
            'reorder'   => $reorderScore,
        ];
        arsort($components);
        $driver = array_key_first($components);
        $score  = max(0, min(100, $components[$driver]));
        if ($score === 0) {
            $driver = null;
        }

        // Taslakta bekleyen miktar da düşülür ki aynı ihtiyaç iki kez önerilmesin
        $netNeed      = $this->netNeed($daily, $leadTime, $review, $safety, $minStock, $pipeline + $inDraft);
        $suggestedQty = $netNeed > 0 && !$product->reorder_blocked
            ? $this->roundOrderQty($netNeed, (float) ($product->min_order_qty ?? 0), (float) ($product->order_multiple ?? 0))
            : 0.0;

        return [
            'product_id'         => $product->id,
            'name'               => $product->name,
            'sku'                => $product->sku,
            'unit'               => $unit,
            'available'          => round($available, 3),
            'on_order'           => round($onOrder, 3),
            'in_draft'           => round($inDraft, 3),
            'default_supplier_id'=> $product->default_supplier_id,
            'supplier_name'      => $product->default_supplier_id ? $product->defaultSupplier?->name : null,
            'min_order_qty'      => $product->min_order_qty,
            'order_multiple'     => $product->order_multiple,
            'unit_price'         => $product->unit_price !== null ? (float) $product->unit_price : null,
            'daily_consumption'  => round($daily, 3),
            'days_of_cover'      => $daysOfCover !== null ? round($daysOfCover, 1) : null,
            'lead_time_days'     => $leadTime,
            'lead_time_estimated'=> !$leadTimeSet,
            'safety_stock'       => $safety,
            'min_stock'          => $minStock,
            'stockout_probability' => round($stockoutProb * 100, 1),
            'expiry_risk_qty'    => round($expiry['qty'], 3),
            'nearest_expiry'     => $expiry['nearest'],
            'risk_score'         => $score,
            'risk_level'         => $this->level($score),
            'driver'             => $driver,
            'components'         => $components,
            'suggested_order_qty'=> $suggestedQty,
            'last_consumption_at'=> $m['last_consumption_at'],
            'reorder_point'      => round($reorderPoint, 3),
            'explanation'        => $this->explain($product->name, $unit, $available, $daily, $daysOfCover, $leadTime, !$leadTimeSet, $stockoutProb, $expiry, $safety, $minStock, $reorderPoint)
                . ($onOrder > 0 ? " Yolda {$this->fmt($onOrder)} {$unit} açık sipariş var" . ($nextArrival !== null
                    ? ", {$nextArrival} gün sonra bekleniyor; o zamana kadar tükenme olasılığı %" . round($beforeArrivalProb * 100) . '.'
                    : '.') : '')
                . ($inDraft > 0 ? " Taslak siparişte {$this->fmt($inDraft)} {$unit} bekliyor." : ''),
            'next_arrival_days'  => $nextArrival,
            'before_arrival_probability' => round($beforeArrivalProb * 100, 1),
            'reorder_blocked'    => (bool) $product->reorder_blocked,
            'recommendation'     => $product->reorder_blocked && $netNeed > 0
                ? 'Sipariş durduruldu (ölü / yavaş stok)'
                : ($beforeArrivalProb >= 0.5 && $suggestedQty <= 0
                ? "Sipariş {$nextArrival} gün sonra geliyor, stok {$this->fmt($daysOfCover)} günde bitiyor: teslimi hızlandır"
                : $this->recommend($score, $driver, $unit, $daily, $available, $daysOfCover, $leadTime, $review, $suggestedQty, $expiry, $onOrder, $inDraft)),
        ];
    }

    /** Skoru günlük olarak saklar (risk trendi). Aynı gün tekrar çalışırsa üzerine yazar. */
    public function snapshot(string $companyId, ?Carbon $date = null): int
    {
        $date = ($date ?? Carbon::today())->toDateString();
        $rows = $this->assessCompany($companyId)->map(fn($r) => [
            'company_id'        => $companyId,
            'product_id'        => $r['product_id'],
            'snapshot_date'     => $date,
            'risk_score'        => $r['risk_score'],
            'risk_level'        => $r['risk_level'],
            'driver'            => $r['driver'],
            'available'         => $r['available'],
            'daily_consumption' => $r['daily_consumption'],
            'days_of_cover'     => $r['days_of_cover'],
            'created_at'        => now(),
            'updated_at'        => now(),
        ])->all();

        if ($rows) {
            DB::table('stock_risk_snapshots')->upsert(
                $rows,
                ['company_id', 'snapshot_date', 'product_id'],
                ['risk_score', 'risk_level', 'driver', 'available', 'daily_consumption', 'days_of_cover', 'updated_at'],
            );
        }

        return count($rows);
    }

    public function level(int $score): string
    {
        $levels = config('stock.risk_levels');

        return match (true) {
            $score >= $levels['critical'] => 'critical',
            $score >= $levels['high']     => 'high',
            $score >= $levels['medium']   => 'medium',
            default                       => 'low',
        };
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /**
     * FEFO sırasıyla tüketim simülasyonu: her lot sırası geldiğinde SKT'si geçmişse
     * tüketilemeyen kısmı risklidir. Tüketim yoksa 90 gün içinde SKT'si dolan her şey risklidir.
     */
    private function expiryRisk(array $lots, float $daily): array
    {
        $today   = Carbon::today();
        $atRisk  = 0.0;
        $cursor  = 0.0; // lotun tüketimine başlanacak gün
        $nearest = null;

        foreach ($lots as $lot) {
            $qty = (float) $lot['qty'];
            if (!$lot['expiry_date']) {
                $cursor += $daily > 0 ? $qty / $daily : 0;
                continue;
            }

            $daysToExpiry = $today->diffInDays(Carbon::parse($lot['expiry_date']), false);
            $nearest    ??= $lot['expiry_date'];

            if ($daily <= 0) {
                if ($daysToExpiry <= 90) {
                    $atRisk += $qty;
                }
                continue;
            }

            $consumableBeforeExpiry = max(0, ($daysToExpiry - $cursor) * $daily);
            $atRisk += max(0, $qty - $consumableBeforeExpiry);
            $cursor += $qty / $daily;
        }

        return ['qty' => $atRisk, 'nearest' => $nearest];
    }

    /** Hedef stok (tedarik + gözden geçirme süresi talebi + güvenlik) − eldeki ve yoldaki stok. */
    private function netNeed(float $daily, int $leadTime, int $review, float $safety, float $minStock, float $pipeline): float
    {
        $target = $daily > 0
            ? $daily * ($leadTime + $review) + $safety
            : max($safety, $minStock);

        return max(0, $target - $pipeline);
    }

    /** Minimum sipariş miktarı ve paket katına yukarı yuvarlar. */
    public function roundOrderQty(float $qty, float $minOrder, float $multiple): float
    {
        $qty = max($qty, $minOrder);
        if ($multiple > 0) {
            return ceil(round($qty / $multiple, 6)) * $multiple;
        }

        return ceil($qty);
    }

    private function explain(
        string $name, string $unit, float $available, float $daily, ?float $cover,
        int $leadTime, bool $estimated, float $prob, array $expiry, float $safety, float $minStock, float $reorderPoint
    ): string {
        if ($daily <= 0) {
            $text = $available > 0
                ? "{$name}: son dönemde tüketim yok, {$this->fmt($available)} {$unit} stok bekliyor."
                : "{$name}: stok ve tüketim yok.";
        } else {
            $leadText = $estimated ? "{$leadTime} gün (tahmini, üründe girilmemiş)" : "{$leadTime} gün";
            $text = "{$name} ürününün {$this->fmt($cover)} günlük stoğu kaldı (günlük ortalama {$this->fmt($daily)} {$unit}). "
                . "Tedarik süresi {$leadText}. {$leadTime} gün içinde stok tükenme riski %" . round($prob * 100) . '.';
        }

        if ($safety > 0 && $available <= $safety) {
            $text .= " Güvenlik stoğunun ({$this->fmt($safety)} {$unit}) altında.";
        } elseif ($minStock > 0 && $available <= $minStock) {
            $text .= " Minimum stoğun ({$this->fmt($minStock)} {$unit}) altında.";
        } elseif ($reorderPoint > 0 && $available <= $reorderPoint) {
            $text .= " Sipariş noktasının ({$this->fmt($reorderPoint)} {$unit}) altında; sipariş verilmezse bir sonraki teslimattan önce azalır.";
        }

        if ($expiry['qty'] > 0) {
            $text .= " {$this->fmt($expiry['qty'])} {$unit} SKT dolmadan tüketilemeyebilir (en yakın SKT {$expiry['nearest']}).";
        }

        return $text;
    }

    private function recommend(
        int $score, ?string $driver, string $unit, float $daily, float $available, ?float $cover,
        int $leadTime, int $review, float $suggestedQty, array $expiry, float $onOrder = 0, float $inDraft = 0
    ): string {
        if (in_array($driver, ['stockout', 'below_min', 'reorder'], true) && $suggestedQty > 0 && $score >= 30) {
            return "{$this->fmt($suggestedQty)} {$unit} sipariş öner";
        }
        if ($suggestedQty <= 0 && $inDraft > 0 && ($score >= 30 || $driver)) {
            return "Taslak siparişi gönder ({$this->fmt($inDraft)} {$unit})";
        }
        if ($suggestedQty <= 0 && $onOrder > 0 && ($score >= 30 || $driver)) {
            return "Siparişte {$this->fmt($onOrder)} {$unit} var, teslimi takip et";
        }
        if ($driver === 'expiry' && $score >= 30) {
            return "FEFO: {$this->fmt($expiry['qty'])} {$unit} için öncelikli sevk / kampanya";
        }
        if ($score >= 30) {
            return 'İzle';
        }
        if ($daily <= 0) {
            return $available > 0 ? 'Hareket yok, izle' : '—';
        }
        if ($cover !== null && $cover > 2 * ($leadTime + $review)) {
            return 'Sipariş beklet';
        }

        return 'Yeterli';
    }

    /** $days gün boyunca talebin $stock'u aşma olasılığı. */
    private function shortfallProbability(float $stock, float $daily, float $dailyStd, int $days): float
    {
        $mu    = $daily * $days;
        $sigma = max($dailyStd * sqrt($days), 0.1 * $mu); // tek tip çıkışlarda ikili sonuç vermesin

        return 1 - $this->normalCdf(($stock - $mu) / $sigma);
    }

    /** Standart normal dağılım CDF (Abramowitz–Stegun erf yaklaşımı). */
    private function normalCdf(float $z): float
    {
        $t    = 1 / (1 + 0.3275911 * abs($z) / M_SQRT2);
        $poly = $t * (0.254829592 + $t * (-0.284496736 + $t * (1.421413741 + $t * (-1.453152027 + $t * 1.061405429))));
        $erf  = 1 - $poly * exp(-($z * $z) / 2);

        return $z >= 0 ? 0.5 * (1 + $erf) : 0.5 * (1 - $erf);
    }

    private function fmt(?float $n): string
    {
        if ($n === null) {
            return '∞';
        }

        return rtrim(rtrim(number_format($n, 1, ',', '.'), '0'), ',');
    }
}
