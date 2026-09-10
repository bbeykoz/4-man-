<?php

namespace App\Services\Stock;

use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Support\TurkishSuffix;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Tedarikçi performansı: satın alma siparişleri ve teslim kayıtlarından teslim süresi, zamanında teslim,
 * gecikme, eksik / hasarlı teslim ve fiyat değişimi; tedarikçi skoru ve ürün bazında karşılaştırma.
 */
class SupplierPerformanceService
{
    /** Skor ağırlıkları (toplam 1) */
    private const WEIGHTS = ['on_time' => 0.35, 'fill' => 0.25, 'quality' => 0.25, 'price' => 0.15];

    public function analyze(string $companyId, int $days = 180): array
    {
        $today = Carbon::today();
        $since = $today->copy()->subDays($days);

        $orders = PurchaseOrder::forCompany($companyId)
            ->whereNotNull('sent_at')
            ->where(fn($q) => $q->where('order_date', '>=', $since)->orWhere(fn($w) => $w->whereNull('order_date')->where('sent_at', '>=', $since)))
            ->with(['items.product:id,name,unit,category', 'receipts'])
            ->get();

        $suppliers = Supplier::forCompany($companyId)->withTrashed()->get()->keyBy('id');
        $facts     = $orders->map(fn(PurchaseOrder $po) => $this->orderFacts($po, $today));

        $rows = $facts->groupBy('supplier_id')->map(function (Collection $f, $supplierId) use ($suppliers, $orders) {
            $supplier = $suppliers[$supplierId];

            return $this->supplierRow($supplier, $f, $orders->where('supplier_id', $supplierId));
        })->sortByDesc('score')->values();

        return [
            'days'        => $days,
            'suppliers'   => $rows,
            'comparisons' => $this->comparisons($orders, $suppliers),
            'summary'     => [
                'suppliers'    => $rows->count(),
                'orders'       => $orders->count(),
                'on_time_rate' => $this->pct($facts->whereNotNull('on_time')->where('on_time', true)->count(), $facts->whereNotNull('on_time')->count()),
                'avg_delay'    => round($facts->whereNotNull('delay_days')->avg('delay_days') ?? 0, 1),
                'overdue'      => $facts->where('overdue', true)->count(),
                'spend'        => round($orders->sum('total_amount'), 2),
            ],
        ];
    }

    /** Tedarikçinin beyan ettiği teslim süresini gerçekleşen ortalamayla günceller (kullanıcı onayıyla). */
    public function applyActualLeadTime(string $companyId, string $supplierId, int $days = 180): Supplier
    {
        $row = collect($this->analyze($companyId, $days)['suppliers'])->firstWhere('supplier_id', $supplierId);
        abort_unless($row && $row['avg_lead_time'] !== null, 422, 'Bu tedarikçi için yeterli teslim verisi yok.');

        $supplier = Supplier::forCompany($companyId)->findOrFail($supplierId);
        $supplier->update(['default_lead_time_days' => max(1, (int) round($row['avg_lead_time']))]);

        return $supplier;
    }

    // ─── Sipariş düzeyi ─────────────────────────────────────────────

    private function orderFacts(PurchaseOrder $po, Carbon $today): array
    {
        $orderDate    = ($po->order_date ?? $po->sent_at)?->copy()->startOfDay();
        $expected     = $po->expected_date?->copy()->endOfDay();
        $firstReceipt = $po->receipts->min('received_at');
        $firstReceipt = $firstReceipt ? Carbon::parse($firstReceipt) : null;

        $ordered  = (float) $po->items->sum('quantity');
        $good     = (float) $po->items->sum('received_qty');
        $damaged  = (float) $po->items->sum('damaged_qty');
        $closed   = $po->status === PurchaseOrder::STATUS_RECEIVED;
        $open     = in_array($po->status, PurchaseOrder::OPEN_STATUSES, true);
        $overdue  = $open && !$firstReceipt && $expected && $expected->lt($today);

        $onTime = $firstReceipt && $expected ? $firstReceipt->lte($expected) : ($overdue ? false : null);
        $delay  = null;
        if ($firstReceipt && $expected) {
            $delay = max(0, (int) $expected->copy()->startOfDay()->diffInDays($firstReceipt->copy()->startOfDay(), false));
        } elseif ($overdue) {
            $delay = (int) $expected->copy()->startOfDay()->diffInDays($today);
        }

        return [
            'supplier_id'  => $po->supplier_id,
            'lead_time'    => $firstReceipt && $orderDate ? max(0, (int) $orderDate->diffInDays($firstReceipt->copy()->startOfDay())) : null,
            'on_time'      => $onTime,
            'delay_days'   => $delay,
            'overdue'      => $overdue,
            'closed'       => $closed,
            'ordered'      => $ordered,
            'good'         => $good,
            'damaged'      => $damaged,
            'short'        => $closed && ($good + $damaged) < $ordered - 0.0005, // kalanı iptal edilerek kapatıldı
            'in_full'      => $closed && ($good + $damaged) >= $ordered - 0.0005 && $damaged <= 0,
            'otif'         => $onTime === true && $closed && ($good + $damaged) >= $ordered - 0.0005 && $damaged <= 0
                && (!$po->received_at || !$expected || $po->received_at->lte($expected)),
        ];
    }

    // ─── Tedarikçi düzeyi ───────────────────────────────────────────

    private function supplierRow(Supplier $supplier, Collection $f, Collection $orders): array
    {
        $delivered  = $f->whereNotNull('lead_time');
        $leadTimes  = $delivered->pluck('lead_time');
        $avgLead    = $leadTimes->isNotEmpty() ? $leadTimes->avg() : null;
        $leadStd    = $leadTimes->count() > 1 ? sqrt($leadTimes->map(fn($v) => ($v - $avgLead) ** 2)->sum() / $leadTimes->count()) : 0;
        $judged     = $f->whereNotNull('on_time');
        $closed     = $f->where('closed', true);

        $onTimeRate = $this->pct($judged->where('on_time', true)->count(), $judged->count());
        $fillRate   = $closed->sum('ordered') > 0 ? round($closed->sum('good') / $closed->sum('ordered') * 100, 1) : null;
        $received   = $f->sum('good') + $f->sum('damaged');
        $damageRate = $received > 0 ? round($f->sum('damaged') / $received * 100, 1) : null;
        $shortRate  = $this->pct($closed->where('short', true)->count(), $closed->count());
        $priceChg   = $this->priceChange($orders);

        // Skor: ölçülemeyen bileşen nötr (100) sayılmaz; mevcut bileşenlerin ağırlıkları yeniden dağıtılır
        $parts = array_filter([
            'on_time' => $onTimeRate,
            'fill'    => $fillRate,
            'quality' => $damageRate !== null ? max(0, 100 - $damageRate * 5) : null,      // %20 hasar → 0
            'price'   => $priceChg !== null ? max(0, 100 - max(0, $priceChg) * 5) : null,   // %20 zam → 0
        ], fn($v) => $v !== null);
        $weight = array_sum(array_intersect_key(self::WEIGHTS, $parts));
        $score  = $weight > 0
            ? (int) round(array_sum(array_map(fn($k) => $parts[$k] * self::WEIGHTS[$k], array_keys($parts))) / $weight)
            : null;

        $declared = $supplier->default_lead_time_days;

        return [
            'supplier_id'       => $supplier->id,
            'name'              => $supplier->name,
            'code'              => $supplier->code,
            'orders'            => $f->count(),
            'delivered'         => $delivered->count(),
            'open_overdue'      => $f->where('overdue', true)->count(),
            'declared_lead_time'=> $declared,
            'avg_lead_time'     => $avgLead !== null ? round($avgLead, 1) : null,
            'lead_time_std'     => round($leadStd, 1),
            'on_time_rate'      => $onTimeRate,
            'avg_delay_days'    => round($f->whereNotNull('delay_days')->avg('delay_days') ?? 0, 1),
            'fill_rate'         => $fillRate,
            'short_delivery_rate' => $shortRate,
            'otif_rate'         => $this->pct($closed->where('otif', true)->count(), $closed->count()),
            'damage_rate'       => $damageRate,
            'price_change_pct'  => $priceChg,
            'spend'             => round($orders->sum('total_amount'), 2),
            'score'             => $score,
            'grade'             => $score === null ? null : ($score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 50 ? 'C' : 'D'))),
            'lead_time_gap'     => $avgLead !== null && $declared ? round($avgLead - $declared, 1) : null,
            'insights'          => $this->insights($supplier, $avgLead, $declared, $onTimeRate, $fillRate, $damageRate, $priceChg, $f->where('overdue', true)->count()),
        ];
    }

    /** Ürün bazında: en eski ve en yeni birim fiyat arasındaki değişimin (miktar ağırlıklı) ortalaması. */
    private function priceChange(Collection $orders): ?float
    {
        $changes = $orders->sortBy(fn($po) => $po->order_date ?? $po->sent_at)
            ->flatMap(fn($po) => $po->items->map(fn($i) => ['product_id' => $i->product_id, 'price' => (float) $i->unit_price, 'qty' => (float) $i->quantity]))
            ->filter(fn($i) => $i['price'] > 0)
            ->groupBy('product_id')
            ->filter(fn($g) => $g->count() >= 2)
            ->map(fn($g) => ['pct' => ($g->last()['price'] - $g->first()['price']) / $g->first()['price'] * 100, 'qty' => $g->sum('qty')]);

        if ($changes->isEmpty()) {
            return null;
        }

        return round($changes->sum(fn($c) => $c['pct'] * $c['qty']) / max(1, $changes->sum('qty')), 1);
    }

    private function insights(Supplier $s, ?float $avgLead, ?int $declared, ?float $onTime, ?float $fill, ?float $damage, ?float $price, int $overdue): array
    {
        $n   = fn(float $v) => rtrim(rtrim(number_format($v, 1, ',', '.'), '0'), ',');
        $out = [];
        if ($avgLead !== null && $declared && abs($avgLead - $declared) >= max(2, $declared * 0.2)) {
            $out[] = "Beyan edilen teslim süresi {$declared} gün, gerçekleşen ortalama {$n($avgLead)} gün."
                . ($avgLead > $declared ? ' Risk ve sipariş önerileri için gerçek süre kullanılmalı.' : '');
        }
        if ($onTime !== null && $onTime < 80) {
            $out[] = 'Geç teslim oranı: %' . $n(100 - $onTime) . '.';
        }
        if ($overdue > 0) {
            $out[] = "{$overdue} sipariş beklenen tarihi geçti ve hâlâ teslim edilmedi.";
        }
        if ($fill !== null && $fill < 95) {
            $out[] = 'Tam teslim oranı: %' . $n($fill) . '. Eksik kalan miktarlar sipariş kapatılarak iptal edildi.';
        }
        if ($damage !== null && $damage >= 3) {
            $out[] = 'Hasarlı teslim oranı: %' . $n($damage) . '.';
        }
        if ($price !== null && $price >= 5) {
            $out[] = 'Birim fiyat artışı: dönem içinde ortalama %' . $n($price) . '.';
        }

        return $out;
    }

    // ─── Ürün bazında karşılaştırma ─────────────────────────────────

    /** Aynı ürün / ürün grubu birden fazla tedarikçiden alınıyorsa teslim hızı, zamanında teslim, fiyat ve hasar karşılaştırması. */
    private function comparisons(Collection $orders, Collection $suppliers): array
    {
        $today = Carbon::today();
        $lines = $orders->flatMap(function (PurchaseOrder $po) use ($today) {
            $facts = $this->orderFacts($po, $today);

            return $po->items->map(fn($i) => [
                'product_id'  => $i->product_id,
                'product'     => $i->product?->name,
                'unit'        => $i->product?->unit ?: 'adet',
                'category'    => $i->product?->category,
                'supplier_id' => $po->supplier_id,
                'lead_time'   => $facts['lead_time'],
                'on_time'     => $facts['on_time'],
                'price'       => $i->unit_price !== null ? (float) $i->unit_price : null,
                'received'    => (float) $i->received_qty + (float) $i->damaged_qty,
                'damaged'     => (float) $i->damaged_qty,
            ]);
        });

        $result = [];
        foreach (['product_id' => 'product', 'category' => 'category'] as $key => $scope) {
            foreach ($lines->filter(fn($l) => !empty($l[$key]))->groupBy($key) as $groupKey => $group) {
                $bySupplier = $group->groupBy('supplier_id')->map(fn($g, $sid) => [
                    'supplier_id'   => $sid,
                    'supplier'      => $suppliers[$sid]?->name,
                    'orders'        => $g->count(),
                    'avg_lead_time' => $g->whereNotNull('lead_time')->isNotEmpty() ? round($g->whereNotNull('lead_time')->avg('lead_time'), 1) : null,
                    'on_time_rate'  => $this->pct($g->where('on_time', true)->count(), $g->whereNotNull('on_time')->count()),
                    'avg_price'     => $g->whereNotNull('price')->isNotEmpty() ? round($g->whereNotNull('price')->avg('price'), 2) : null,
                    'damage_rate'   => $g->sum('received') > 0 ? round($g->sum('damaged') / $g->sum('received') * 100, 1) : null,
                ])->values();

                if ($bySupplier->count() < 2) {
                    continue;
                }
                // Kategori karşılaştırması, zaten ürün düzeyinde tek ürüne indirgeniyorsa tekrar etmesin
                if ($scope === 'category' && $group->pluck('product_id')->unique()->count() < 2) {
                    continue;
                }

                $withLead = $bySupplier->whereNotNull('avg_lead_time')->sortBy('avg_lead_time')->values();
                $insight  = null;
                $best     = null;
                if ($withLead->count() >= 2) {
                    $fast = $withLead->first();
                    $slow = $withLead->last();
                    if ($slow['avg_lead_time'] > 0 && $fast['avg_lead_time'] < $slow['avg_lead_time']) {
                        $pctFaster = round(($slow['avg_lead_time'] - $fast['avg_lead_time']) / $slow['avg_lead_time'] * 100);
                        $where     = $scope === 'product' ? 'aynı üründe' : 'aynı ürün grubunda';
                        $insight   = "{$fast['supplier']} {$where} " . TurkishSuffix::dative($slow['supplier']) . " göre ortalama %{$pctFaster} daha hızlı teslimat sağlıyor.";
                        $best      = $fast['supplier_id'];
                    }
                }

                $result[] = [
                    'scope'           => $scope,
                    'product_id'      => $scope === 'product' ? $groupKey : null,
                    'label'           => $scope === 'product' ? $group->first()['product'] : "Kategori: {$groupKey}",
                    'suppliers'       => $bySupplier,
                    'insight'         => $insight,
                    'best_supplier_id'=> $best,
                ];
            }
        }

        return $result;
    }

    private function pct(int $part, int $total): ?float
    {
        return $total > 0 ? round($part / $total * 100, 1) : null;
    }
}
