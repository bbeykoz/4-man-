<?php

namespace App\Services\Stock;

use App\Models\Modules\WarehouseRecord;
use App\Models\StockAnomaly;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use App\Services\NotificationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Stok hareketlerinde sapma tespiti. Her dedektör istatistiksel bir kuralla aday üretir;
 * adaylar parmak iziyle saklanır (tekrar taramada çoğalmaz, "normal" denen tekrar açılmaz).
 * Anomaliler sadece uyarıdır; stok verisini değiştirmez.
 */
class AnomalyService
{
    public const TYPE_LABELS = [
        'outflow_spike'       => 'Olağandışı çıkış',
        'large_movement'      => 'Büyük tek kayıt',
        'damage_spike'        => 'Hasar artışı',
        'return_spike'        => 'İade artışı',
        'count_variance'      => 'Sayım farkı',
        'frequent_adjustment' => 'Sık stok düzeltmesi',
        'user_reversals'      => 'Sık iptal (kullanıcı)',
        'user_adjustments'    => 'Sık düzeltme (kullanıcı)',
        'off_hours'           => 'Mesai dışı işlem',
    ];

    private array $cfg;
    private Carbon $today;

    public function __construct(private readonly NotificationService $notifications)
    {
        $this->cfg   = config('stock.anomaly');
        $this->today = Carbon::today();
    }

    /** Tüm dedektörleri çalıştırır, sonuçları saklar, yeni ve önemli olanları bildirir. */
    public function scan(string $companyId): array
    {
        $this->today = Carbon::today();
        $ctx = [
            'products'   => WarehouseProduct::withTrashed()->where('company_id', $companyId)->get(['id', 'name', 'unit'])->keyBy('id'),
            'warehouses' => Warehouse::withTrashed()->where('company_id', $companyId)->pluck('name', 'id'),
            'users'      => User::where('company_id', $companyId)->pluck('name', 'id'),
        ];

        $candidates = collect()
            ->merge($this->outflowSpikes($companyId, $ctx))
            ->merge($this->largeMovements($companyId, $ctx))
            ->merge($this->bucketSpikes($companyId, $ctx, 'damage', 'damage_spike', 'hasar'))
            ->merge($this->bucketSpikes($companyId, $ctx, 'return_in', 'return_spike', 'iade girişi'))
            ->merge($this->countVariances($companyId, $ctx))
            ->merge($this->frequentAdjustments($companyId, $ctx))
            ->merge($this->userBehaviour($companyId, $ctx))
            ->merge($this->offHours($companyId, $ctx));

        $new = collect();
        foreach ($candidates as $c) {
            $existing = StockAnomaly::where('company_id', $companyId)->where('fingerprint', $c['fingerprint'])->first();
            if ($existing) {
                $existing->update(collect($c)->only(['severity', 'message', 'metrics'])->all());
                continue;
            }
            $new->push(StockAnomaly::create([...$c, 'company_id' => $companyId, 'status' => StockAnomaly::STATUS_OPEN]));
        }

        $this->notify($companyId, $new);

        return [
            'detected' => $candidates->count(),
            'new'      => $new->count(),
            'open'     => StockAnomaly::forCompany($companyId)->where('status', StockAnomaly::STATUS_OPEN)->count(),
        ];
    }

    // ─── Dedektörler ────────────────────────────────────────────────

    /** Günlük çıkış, ürünün o depodaki 90 günlük ortalamasından ve dalgalanmasından belirgin yüksek. */
    private function outflowSpikes(string $companyId, array $ctx): Collection
    {
        $scan     = (int) $this->cfg['scan_days'];
        $baseline = (int) $this->cfg['baseline_days'];
        $since    = $this->today->copy()->subDays($scan + $baseline);

        $rows = $this->outflowQuery($companyId)
            ->where('stock_movements.occurred_at', '>=', $since)
            ->groupBy('stock_movements.product_id', 'stock_movements.warehouse_id', DB::raw('DATE(stock_movements.occurred_at)'))
            ->get([
                'stock_movements.product_id', 'stock_movements.warehouse_id',
                DB::raw('DATE(stock_movements.occurred_at) as day'),
                DB::raw('-SUM(stock_movements.quantity) as qty'),
            ]);

        $first = StockMovement::where('company_id', $companyId)
            ->groupBy('product_id', 'warehouse_id')
            ->get(['product_id', 'warehouse_id', DB::raw('MIN(occurred_at) as first_at')])
            ->mapWithKeys(fn($r) => ["{$r->product_id}|{$r->warehouse_id}" => Carbon::parse($r->first_at)->startOfDay()]);

        $out = collect();
        foreach ($rows->groupBy(fn($r) => "{$r->product_id}|{$r->warehouse_id}") as $key => $series) {
            [$productId, $warehouseId] = explode('|', $key);
            $byDay     = $series->mapWithKeys(fn($r) => [substr((string) $r->day, 0, 10) => (float) $r->qty]);
            $firstDay  = $first[$key] ?? $this->today;

            for ($i = 0; $i < $scan; $i++) {
                $day = $this->today->copy()->subDays($i);
                $qty = $byDay[$day->toDateString()] ?? 0.0;
                if ($qty < $this->cfg['spike_min_qty']) {
                    continue;
                }

                $values = [];
                for ($b = 1; $b <= $baseline; $b++) {
                    $bd = $day->copy()->subDays($b);
                    if ($bd->lt($firstDay)) {
                        break;
                    }
                    $values[] = $byDay[$bd->toDateString()] ?? 0.0;
                }
                if (count($values) < 14) {
                    continue; // karşılaştırma için yeterli geçmiş yok
                }

                $mean = array_sum($values) / count($values);
                $std  = sqrt(array_sum(array_map(fn($v) => ($v - $mean) ** 2, $values)) / count($values));

                if ($mean > 0 && ($qty < $mean * $this->cfg['spike_min_ratio'] || $qty < $mean + $this->cfg['spike_min_sigma'] * $std)) {
                    continue;
                }

                $ratio    = $mean > 0 ? $qty / $mean : 10;
                $product  = $ctx['products'][$productId];
                $unit     = $product->unit ?: 'adet';
                $when     = $i === 0 ? 'Bugünkü çıkış' : $day->format('d.m.Y') . ' tarihli çıkış';
                $where    = $ctx['warehouses'][$warehouseId] ?? '';
                $message  = $mean > 0
                    ? "{$product->name} ({$where}): {$when}, {$baseline} günlük ortalamanın %" . round(($ratio - 1) * 100) . " üzerinde ({$this->fmt($qty)} {$unit}, günlük ortalama {$this->fmt($mean)})."
                    : "{$product->name} ({$where}): {$baseline} gündür çıkış yokken {$when} {$this->fmt($qty)} {$unit}.";

                $out->push($this->candidate('outflow_spike', "{$productId}|{$warehouseId}|{$day->toDateString()}", $this->severity($ratio, 30), $message, $day, [
                    'product_id' => $productId, 'warehouse_id' => $warehouseId,
                ], ['qty' => $qty, 'mean' => round($mean, 3), 'std' => round($std, 3), 'ratio' => round($ratio, 2)]));
            }
        }

        return $out;
    }

    /** Tek kayıt, ürünün tipik (medyan) çıkış kaydından çok büyük: yanlış giriş şüphesi. */
    private function largeMovements(string $companyId, array $ctx): Collection
    {
        $scanStart = $this->today->copy()->subDays($this->cfg['scan_days'] - 1);
        $since     = $scanStart->copy()->subDays($this->cfg['baseline_days']);

        $records = WarehouseRecord::where('company_id', $companyId)
            ->whereIn('type', ['stock_out', 'damage'])
            ->whereNotNull('posted_at')->whereNull('reversed_at')->whereNotNull('product_id')
            ->where('transaction_date', '>=', $since)
            ->get(['id', 'record_number', 'type', 'product_id', 'warehouse_id', 'quantity', 'transaction_date', 'created_by']);

        $out = collect();
        // Tipik kayıt büyüklüğü depo ve hareket tipine göre ayrı: depoların tüketimi farklı olabilir
        foreach ($records->groupBy(fn($r) => "{$r->product_id}|{$r->warehouse_id}|{$r->type}") as $group) {
            $productId = $group->first()->product_id;
            foreach ($group->filter(fn($r) => $r->transaction_date && $r->transaction_date->gte($scanStart)) as $r) {
                $history = $group->where('id', '!=', $r->id)->pluck('quantity')->map(fn($q) => (float) $q)->sort()->values();
                if ($history->count() < 5) {
                    continue;
                }
                $median = (float) $history->median();
                $qty    = (float) $r->quantity;
                if ($median <= 0 || $qty < $this->cfg['large_record_min_qty'] || $qty < $median * $this->cfg['large_record_ratio']) {
                    continue;
                }

                $product = $ctx['products'][$productId];
                $ratio   = $qty / $median;
                $out->push($this->candidate('large_movement', $r->id, $this->severity($ratio, 20), sprintf(
                    '%s: %s %s %s, bu ürünün tipik kaydının %s katı (medyan %s). Yanlış giriş olabilir.',
                    $r->record_number, $product->name, $this->fmt($qty), $product->unit ?: 'adet',
                    $this->fmt($ratio), $this->fmt($median)
                ), $r->transaction_date, [
                    'product_id' => $productId, 'warehouse_id' => $r->warehouse_id, 'user_id' => $r->created_by, 'record_id' => $r->id,
                ], ['qty' => $qty, 'median' => $median, 'ratio' => round($ratio, 2)]));
            }
        }

        return $out;
    }

    /** Hasar / iade miktarı son 30 günde önceki dönemin 30 günlük ortalamasının belirgin üstünde. */
    private function bucketSpikes(string $companyId, array $ctx, string $movementType, string $type, string $label): Collection
    {
        $recentStart = $this->today->copy()->subDays(29);
        $prevStart   = $recentStart->copy()->subDays(90);
        $bucket      = $movementType === 'damage' ? StockMovement::BUCKET_DAMAGED : null;

        $rows = StockMovement::where('stock_movements.company_id', $companyId)
            ->join('warehouse_records', 'warehouse_records.id', '=', 'stock_movements.record_id')
            ->whereNull('warehouse_records.reversed_at')
            ->where('stock_movements.movement_type', $movementType)
            ->where('stock_movements.quantity', '>', 0)
            ->when($bucket, fn($q) => $q->where('stock_movements.bucket', $bucket))
            ->where('stock_movements.occurred_at', '>=', $prevStart)
            ->groupBy('stock_movements.product_id')
            ->get([
                'stock_movements.product_id',
                DB::raw("SUM(CASE WHEN stock_movements.occurred_at >= '{$recentStart->toDateString()}' THEN stock_movements.quantity ELSE 0 END) as recent"),
                DB::raw("SUM(CASE WHEN stock_movements.occurred_at < '{$recentStart->toDateString()}' THEN stock_movements.quantity ELSE 0 END) as previous"),
            ]);

        $week = $this->today->format('o-\WW');
        $out  = collect();
        foreach ($rows as $r) {
            $recent = (float) $r->recent;
            $avg30  = (float) $r->previous / 3;
            if ($recent < $this->cfg['damage_min_qty'] || ($avg30 > 0 && $recent < $avg30 * $this->cfg['damage_min_ratio'])) {
                continue;
            }
            if ($avg30 <= 0 && $recent < $this->cfg['damage_min_qty'] * 2) {
                continue;
            }

            $product = $ctx['products'][$r->product_id];
            $unit    = $product->unit ?: 'adet';
            $ratio   = $avg30 > 0 ? $recent / $avg30 : 5;
            $message = $avg30 > 0
                ? "{$product->name}: son 30 günde {$this->fmt($recent)} {$unit} {$label}, önceki dönemin 30 günlük ortalamasının " . $this->fmt($ratio) . ' katı.'
                : "{$product->name}: önceki 90 günde hiç yokken son 30 günde {$this->fmt($recent)} {$unit} {$label}.";

            $out->push($this->candidate($type, "{$r->product_id}|{$week}", $this->severity($ratio, 30), $message, $this->today,
                ['product_id' => $r->product_id], ['recent' => $recent, 'avg_30' => round($avg30, 3), 'ratio' => round($ratio, 2)]));
        }

        return $out;
    }

    /** Sayımda sistem ile sayılan arasında büyük fark. */
    private function countVariances(string $companyId, array $ctx): Collection
    {
        $records = WarehouseRecord::where('company_id', $companyId)
            ->where('type', 'stock_count')
            ->whereNotNull('posted_at')->whereNull('reversed_at')->whereNotNull('system_quantity')
            ->where('posted_at', '>=', $this->today->copy()->subDays($this->cfg['scan_days'] - 1))
            ->get(['id', 'record_number', 'product_id', 'warehouse_id', 'quantity', 'system_quantity', 'posted_at', 'updated_by']);

        return $records->map(function ($r) use ($ctx) {
            $system  = (float) $r->system_quantity;
            $counted = (float) $r->quantity;
            $diff    = $counted - $system;
            $pct     = abs($diff) / max($system, 1) * 100;
            if (abs($diff) < $this->cfg['count_variance_min'] || $pct < $this->cfg['count_variance_pct']) {
                return null;
            }

            $product = $ctx['products'][$r->product_id] ?? null;
            $unit    = $product?->unit ?: 'adet';

            return $this->candidate('count_variance', $r->id, (int) min(100, 30 + $pct), sprintf(
                '%s: %s sayım farkı %%%s (%s %s sayıldı, sistemde %s). Kayıp/kaçak veya kayıt hatası olabilir.',
                $r->record_number, $product?->name, round($pct), $this->fmt($counted), $unit, $this->fmt($system)
            ), Carbon::parse($r->posted_at), [
                'product_id' => $r->product_id, 'warehouse_id' => $r->warehouse_id, 'user_id' => $r->updated_by, 'record_id' => $r->id,
            ], ['counted' => $counted, 'system' => $system, 'diff' => $diff, 'pct' => round($pct, 1)]);
        })->filter()->values();
    }

    /** Aynı ürüne 30 günde sık azalış düzeltmesi. */
    private function frequentAdjustments(string $companyId, array $ctx): Collection
    {
        $rows = WarehouseRecord::where('company_id', $companyId)
            ->where('type', 'adjustment')->where('direction', 'decrease')
            ->whereNotNull('posted_at')->whereNull('reversed_at')
            ->where('posted_at', '>=', $this->today->copy()->subDays(29))
            ->groupBy('product_id')
            ->havingRaw('COUNT(*) >= ?', [$this->cfg['frequent_adjustments']])
            ->get(['product_id', DB::raw('COUNT(*) as n'), DB::raw('SUM(quantity) as qty')]);

        $week = $this->today->format('o-\WW');

        return $rows->map(function ($r) use ($ctx, $week) {
            $product = $ctx['products'][$r->product_id];

            return $this->candidate('frequent_adjustment', "{$r->product_id}|{$week}", (int) min(100, 50 + 5 * ($r->n - $this->cfg['frequent_adjustments'])),
                "{$product->name}: son 30 günde {$r->n} kez azalış düzeltmesi (toplam {$this->fmt((float) $r->qty)} " . ($product->unit ?: 'adet') . '). Kayıp nedeni incelenmeli.',
                $this->today, ['product_id' => $r->product_id], ['count' => (int) $r->n, 'qty' => (float) $r->qty]);
        })->values();
    }

    /** Kullanıcı bazında sık iptal (işlenmiş kaydı geri alma) ve sık azalış düzeltmesi. */
    private function userBehaviour(string $companyId, array $ctx): Collection
    {
        $since = $this->today->copy()->subDays(29);
        $week  = $this->today->format('o-\WW');

        $reversals = StockMovement::where('company_id', $companyId)
            ->where('movement_type', 'reversal')->where('created_at', '>=', $since)->whereNotNull('created_by')
            ->groupBy('created_by')
            ->get(['created_by', DB::raw('COUNT(DISTINCT record_id) as n')])
            ->pluck('n', 'created_by');

        $adjustments = WarehouseRecord::where('company_id', $companyId)
            ->where('type', 'adjustment')->where('direction', 'decrease')
            ->whereNotNull('posted_at')->where('posted_at', '>=', $since)
            ->groupBy('created_by')
            ->get(['created_by', DB::raw('COUNT(*) as n')])
            ->pluck('n', 'created_by');

        $out = collect();
        foreach (['user_reversals' => [$reversals, 'işlenmiş kaydı iptal etti'], 'user_adjustments' => [$adjustments, 'azalış düzeltmesi yaptı']] as $type => [$counts, $verb]) {
            foreach ($counts as $userId => $n) {
                $n      = (int) $n;
                $others = $counts->except($userId)->map(fn($v) => (int) $v)->values();
                // Kıyaslanacak kullanıcı yoksa daha yüksek eşik
                $minEvents = $others->isEmpty() ? $this->cfg['user_min_events'] * 2 : $this->cfg['user_min_events'];
                if ($n < $minEvents) {
                    continue;
                }
                $mean   = $others->isEmpty() ? 0 : $others->avg();
                $std    = $others->count() > 1 ? sqrt($others->map(fn($v) => ($v - $mean) ** 2)->sum() / $others->count()) : 0;
                if ($others->isNotEmpty() && $n < max($mean * 3, $mean + $this->cfg['user_sigma'] * $std)) {
                    continue;
                }

                $name  = $ctx['users'][$userId] ?? 'Kullanıcı';
                $ratio = $mean > 0 ? $n / $mean : 4;
                $out->push($this->candidate($type, "{$userId}|{$week}", $this->severity($ratio, 30),
                    "{$name}: son 30 günde {$n} kez {$verb}" . ($others->isNotEmpty() ? ' (diğer kullanıcılar ortalama ' . $this->fmt($mean) . ').' : '.'),
                    $this->today, ['user_id' => $userId], ['count' => $n, 'others_mean' => round($mean, 2)]));
            }
        }

        return $out;
    }

    /** Mesai dışında stoğa işlenen kayıtlar (kullanıcı bazında). */
    private function offHours(string $companyId, array $ctx): Collection
    {
        [$startHour, $endHour] = $this->cfg['business_hours'];
        $tz = $this->cfg['business_timezone'];

        $rows = StockMovement::where('company_id', $companyId)
            ->whereNotNull('record_id')->whereNotNull('created_by')
            ->where('created_at', '>=', $this->today->copy()->subDays($this->cfg['scan_days']))
            ->groupBy('record_id', 'created_by')
            ->get(['record_id', 'created_by', DB::raw('MIN(created_at) as at')]);

        $week = $this->today->format('o-\WW');

        return $rows
            ->filter(function ($r) use ($tz, $startHour, $endHour) {
                $hour = Carbon::parse($r->at, 'UTC')->setTimezone($tz)->hour;
                return $hour < $startHour || $hour >= $endHour;
            })
            ->groupBy('created_by')
            ->filter(fn($g) => $g->count() >= $this->cfg['user_min_events'])
            ->map(fn($g, $userId) => $this->candidate('off_hours', "{$userId}|{$week}", (int) min(100, 45 + 5 * $g->count()),
                ($ctx['users'][$userId] ?? 'Kullanıcı') . ": son {$this->cfg['scan_days']} günde {$g->count()} kayıt mesai dışında ({$startHour}:00 öncesi / {$endHour}:00 sonrası) stoğa işlendi.",
                $this->today, ['user_id' => $userId], ['count' => $g->count(), 'records' => $g->pluck('record_id')->take(10)->values()]))
            ->values();
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    private function outflowQuery(string $companyId)
    {
        return StockMovement::where('stock_movements.company_id', $companyId)
            ->join('warehouse_records', 'warehouse_records.id', '=', 'stock_movements.record_id')
            ->whereNull('warehouse_records.reversed_at')
            ->where('stock_movements.movement_type', 'stock_out')
            ->where('stock_movements.bucket', StockMovement::BUCKET_AVAILABLE);
    }

    private function candidate(string $type, string $key, int $severity, string $message, Carbon $day, array $refs, array $metrics): array
    {
        return [
            'type'         => $type,
            'fingerprint'  => "{$type}|{$key}",
            'severity'     => max(0, min(100, $severity)),
            'message'      => mb_substr($message, 0, 500),
            'detected_for' => $day->toDateString(),
            'metrics'      => $metrics,
            'product_id'   => $refs['product_id'] ?? null,
            'warehouse_id' => $refs['warehouse_id'] ?? null,
            'user_id'      => $refs['user_id'] ?? null,
            'record_id'    => $refs['record_id'] ?? null,
        ];
    }

    /** Oran büyüdükçe artan önem: taban + 20·log2(oran). */
    private function severity(float $ratio, int $base): int
    {
        return (int) round($base + 20 * log(max($ratio, 1), 2));
    }

    /** Yeni ve önemli anomalileri depo yetkililerine bildirir. */
    private function notify(string $companyId, Collection $new): void
    {
        $important = $new->where('severity', '>=', $this->cfg['notify_min_severity']);
        if ($important->isEmpty()) {
            return;
        }

        $recipients = User::where('company_id', $companyId)->where('status', 'active')->get()
            ->filter(fn(User $u) => $u->hasPermission('warehouse.records.edit'));

        $title = $important->count() === 1
            ? 'Stok anomalisi: ' . self::TYPE_LABELS[$important->first()->type]
            : "{$important->count()} yeni stok anomalisi";
        $body  = $important->first()->message . ($important->count() > 1 ? ' (+' . ($important->count() - 1) . ' diğer)' : '');

        foreach ($recipients as $user) {
            $this->notifications->send($user, $title, $body, 'warning', '/modules/warehouse', ['source' => 'stock_anomaly']);
        }
    }

    private function fmt(float $n): string
    {
        return rtrim(rtrim(number_format($n, 1, ',', '.'), '0'), ',');
    }
}
