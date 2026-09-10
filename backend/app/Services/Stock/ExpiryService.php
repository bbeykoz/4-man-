<?php

namespace App\Services\Stock;

use App\Exceptions\StockException;
use App\Models\Modules\WarehouseRecord;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * SKT ve FEFO yönetimi: lot bazında kalan gün, kayıp riski (FEFO tüketim simülasyonu),
 * ve öneri (başka depoya transfer / öncelikli sevk / hasara ayırma).
 * Aksiyonlar "Bekliyor" durumunda depo kaydı açar; stok ancak kullanıcı onayıyla değişir.
 */
class ExpiryService
{
    public function __construct(private readonly StockMetricsService $metrics) {}

    /** @return array{lots: Collection, products: Collection, summary: array} */
    public function analyze(string $companyId, ?string $warehouseId = null, int $horizonDays = 90): array
    {
        $today = Carbon::today();

        // SKT'li, stokta olan lotlar (kullanılabilir + karantina)
        $lotRows = StockMovement::where('company_id', $companyId)
            ->when($warehouseId, fn($q) => $q->where('warehouse_id', $warehouseId))
            ->whereIn('bucket', [StockMovement::BUCKET_AVAILABLE, StockMovement::BUCKET_QUARANTINE])
            ->whereNotNull('expiry_date')
            ->groupBy('product_id', 'warehouse_id', 'lot_number', 'expiry_date', 'bucket')
            ->havingRaw('SUM(quantity) > 0.0005')
            ->get(['product_id', 'warehouse_id', 'lot_number', 'expiry_date', 'bucket', DB::raw('SUM(quantity) as qty')]);

        if ($lotRows->isEmpty()) {
            return ['lots' => collect(), 'products' => collect(), 'summary' => $this->summary(collect())];
        }

        $productIds = $lotRows->pluck('product_id')->unique()->values()->all();
        $products   = WarehouseProduct::whereIn('id', $productIds)->get()->keyBy('id');
        $warehouses = Warehouse::forCompany($companyId)->get()->keyBy('id');

        // Depo bazında tüketim ve FEFO lotları (transfer önerisi için tüm aktif depolar)
        $perWarehouse = $warehouses->filter->is_active->mapWithKeys(fn(Warehouse $w) => [
            $w->id => $this->metrics->forProducts($companyId, $w->id, $productIds),
        ]);

        // Her depo-ürün için kullanılabilir lotların kayıp riski
        $lossByLot = [];
        foreach ($perWarehouse as $wId => $metrics) {
            foreach ($metrics as $pId => $m) {
                foreach ($this->simulate($m['lots'], (float) $m['daily_consumption'], $today) as $key => $loss) {
                    $lossByLot["{$wId}|{$pId}|{$key}"] = $loss;
                }
            }
        }

        $levels = config('stock.expiry_levels');
        $lots = $lotRows->map(function ($row) use ($today, $products, $warehouses, $perWarehouse, $lossByLot, $levels) {
            $product  = $products[$row->product_id];
            $expiry   = substr((string) $row->expiry_date, 0, 10);
            $days     = (int) $today->diffInDays(Carbon::parse($expiry), false);
            $qty      = round((float) $row->qty, 3);
            $isQuar   = $row->bucket === StockMovement::BUCKET_QUARANTINE;
            $daily    = (float) ($perWarehouse[$row->warehouse_id][$row->product_id]['daily_consumption'] ?? 0);
            $loss     = $days < 0 ? $qty : ($isQuar ? ($days <= $levels['critical'] ? $qty : 0) : ($lossByLot["{$row->warehouse_id}|{$row->product_id}|{$row->lot_number}|{$expiry}"] ?? 0));
            $level    = match (true) {
                $days < 0                      => 'expired',
                $days <= $levels['critical']   => 'critical',
                $days <= $levels['warning']    => 'warning',
                $days <= $levels['watch']      => 'watch',
                default                        => 'ok',
            };

            $lot = [
                'product_id'     => $product->id,
                'name'           => $product->name,
                'sku'            => $product->sku,
                'unit'           => $product->unit ?: 'adet',
                'warehouse_id'   => $row->warehouse_id,
                'warehouse_name' => $warehouses[$row->warehouse_id]?->name,
                'lot_number'     => $row->lot_number,
                'expiry_date'    => $expiry,
                'days_to_expiry' => $days,
                'level'          => $level,
                'bucket'         => $row->bucket,
                'quantity'       => $qty,
                'daily_consumption' => round($daily, 3),
                'loss_qty'       => round($loss, 3),
                'loss_value'     => $product->unit_price !== null ? round($loss * (float) $product->unit_price, 2) : null,
            ];

            return [...$lot, ...$this->action($lot, $perWarehouse, $warehouses)];
        })
            ->filter(fn($l) => $l['level'] !== 'ok' || $l['loss_qty'] > 0)
            ->sortBy([['days_to_expiry', 'asc'], ['name', 'asc']])
            ->values();

        return [
            'lots'     => $lots,
            'products' => $this->productHeadlines($lots),
            'summary'  => $this->summary($lots),
        ];
    }

    /** Öneriden "Bekliyor" durumunda transfer / hasar kaydı (onay Depolama listesinden). */
    public function createAction(User $user, array $data): WarehouseRecord
    {
        $product = WarehouseProduct::forCompany($user->company_id)->findOrFail($data['product_id']);
        $source  = Warehouse::forCompany($user->company_id)->findOrFail($data['warehouse_id']);
        $target  = $data['type'] === 'transfer'
            ? Warehouse::forCompany($user->company_id)->active()->find($data['to_warehouse_id'] ?? null)
            : null;

        if ($data['type'] === 'transfer' && (!$target || $target->id === $source->id)) {
            throw new StockException('Geçerli bir hedef depo seçin.');
        }

        $label = $data['type'] === 'transfer' ? "{$target->name} deposuna transfer" : 'hasara ayırma';

        return WarehouseRecord::create([
            'company_id'       => $user->company_id,
            'created_by'       => $user->id,
            'updated_by'       => $user->id,
            'title'            => "SKT: {$product->name}" . ($data['lot_number'] ? " ({$data['lot_number']})" : '') . " — {$label}",
            'description'      => $data['note'] ?? 'SKT / FEFO önerisinden oluşturuldu.',
            'type'             => $data['type'] === 'transfer' ? 'transfer' : 'damage',
            'status'           => 'pending',
            'priority'         => 'high',
            'product_id'       => $product->id,
            'product_name'     => $product->name,
            'sku'              => $product->sku,
            'quantity'         => $data['quantity'],
            'unit'             => $product->unit,
            'warehouse_id'     => $source->id,
            'to_warehouse_id'  => $target?->id,
            'batch_number'     => $data['lot_number'] ?? null,
            'expiry_date'      => $data['expiry_date'] ?? null,
            'transaction_date' => now()->toDateString(),
            'meta'             => ['source' => 'expiry_action'],
        ]);
    }

    // ─── Hesaplar ───────────────────────────────────────────────────

    /**
     * FEFO tüketim simülasyonu: lot sırası geldiğinde SKT'si geçecekse tüketilemeyen kısım kayıptır.
     * @return array<string, float> "lot|expiry" => kayıp miktarı
     */
    private function simulate(array $lots, float $daily, Carbon $today): array
    {
        $cursor = 0.0;
        $result = [];

        foreach ($lots as $lot) {
            $qty = (float) $lot['qty'];
            if (!$lot['expiry_date']) {
                $cursor += $daily > 0 ? $qty / $daily : 0;
                continue;
            }

            $days = (int) $today->diffInDays(Carbon::parse($lot['expiry_date']), false);
            $key  = "{$lot['lot_number']}|{$lot['expiry_date']}";

            if ($daily <= 0) {
                $result[$key] = $days <= (int) config('stock.expiry_levels.watch', 90) ? $qty : 0;
                continue;
            }

            $consumable   = max(0, ($days - $cursor) * $daily);
            $result[$key] = max(0, $qty - $consumable);
            $cursor      += $qty / $daily;
        }

        return $result;
    }

    /** Lot için öneri: hasar / transfer / öncelikli sevk / FEFO sırasında. */
    private function action(array $lot, Collection $perWarehouse, Collection $warehouses): array
    {
        if ($lot['level'] === 'expired') {
            return [
                'recommendation' => 'SKT geçmiş: hasara ayır, sevk etme',
                'action'         => ['type' => 'damage', 'quantity' => $lot['quantity']],
            ];
        }
        if ($lot['bucket'] === StockMovement::BUCKET_QUARANTINE) {
            return ['recommendation' => 'Karantinada: QC\'yi hızlandır', 'action' => null];
        }
        if ($lot['loss_qty'] <= 0) {
            return ['recommendation' => 'FEFO sırasında tüketilecek', 'action' => null];
        }

        // Başka depoda SKT'den önce ne kadar tüketilebilir?
        $best = null;
        foreach ($perWarehouse as $wId => $metrics) {
            if ($wId === $lot['warehouse_id']) {
                continue;
            }
            $m     = $metrics[$lot['product_id']] ?? null;
            $daily = (float) ($m['daily_consumption'] ?? 0);
            if ($daily <= 0) {
                continue;
            }
            // Hedefte bu lottan önce tüketilecek (SKT'si daha erken) stok
            $ahead = collect($m['lots'] ?? [])
                ->filter(fn($l) => $l['expiry_date'] && $l['expiry_date'] <= $lot['expiry_date'])
                ->sum('qty');
            $absorb = max(0, floor($daily * max(0, $lot['days_to_expiry']) - $ahead));
            if ($absorb >= 1 && (!$best || $absorb > $best['absorb'])) {
                $best = ['warehouse_id' => $wId, 'absorb' => $absorb];
            }
        }

        if ($best) {
            $qty  = min(floor($lot['loss_qty']), $best['absorb']);
            $name = $warehouses[$best['warehouse_id']]?->name;
            if ($qty >= 1) {
                return [
                    'recommendation' => "{$this->fmt($qty)} {$lot['unit']} {$name} deposuna transfer et (orada SKT'den önce tüketilir)",
                    'action'         => ['type' => 'transfer', 'quantity' => $qty, 'to_warehouse_id' => $best['warehouse_id'], 'to_warehouse_name' => $name],
                ];
            }
        }

        return [
            'recommendation' => "Öncelikli sevk / indirim kampanyası: {$this->fmt($lot['loss_qty'])} {$lot['unit']} kayıp riski",
            'action'         => null,
        ];
    }

    /** Belgedeki gibi ürün cümlesi: "126 adet … SKT'si 23 gün içinde doluyor … 48 adet için kayıp riski". */
    private function productHeadlines(Collection $lots): Collection
    {
        $critical = (int) config('stock.expiry_levels.critical', 30);

        return $lots->where('bucket', StockMovement::BUCKET_AVAILABLE)
            ->groupBy('product_id')
            ->map(function (Collection $rows) use ($critical) {
                $first    = $rows->first();
                $soon     = $rows->filter(fn($r) => $r['days_to_expiry'] >= 0 && $r['days_to_expiry'] <= $critical);
                $expired  = $rows->filter(fn($r) => $r['days_to_expiry'] < 0)->sum('quantity');
                $loss     = $rows->sum('loss_qty');
                $unit     = $first['unit'];
                $parts    = [];

                if ($expired > 0) {
                    $parts[] = "{$this->fmt($expired)} {$unit} {$first['name']} ürününün SKT'si geçmiş.";
                }
                if ($soon->isNotEmpty()) {
                    $parts[] = "{$this->fmt($soon->sum('quantity'))} {$unit} {$first['name']} ürününün SKT'si {$soon->max('days_to_expiry')} gün içinde doluyor.";
                }
                if ($loss - $expired > 0) {
                    $parts[] = "Mevcut tüketim hızında yaklaşık {$this->fmt($loss - $expired)} {$unit} için kayıp riski bulunuyor.";
                }

                return [
                    'product_id' => $first['product_id'],
                    'name'       => $first['name'],
                    'loss_qty'   => round($loss, 3),
                    'loss_value' => round($rows->sum('loss_value'), 2),
                    'headline'   => implode(' ', $parts),
                ];
            })
            ->filter(fn($p) => $p['headline'] !== '')
            ->sortByDesc('loss_value')
            ->values();
    }

    private function summary(Collection $lots): array
    {
        $available = $lots->where('bucket', StockMovement::BUCKET_AVAILABLE);

        return [
            'expired_qty'    => round($lots->where('level', 'expired')->sum('quantity'), 3),
            'critical_lots'  => $lots->where('level', 'critical')->count(),
            'warning_lots'   => $lots->where('level', 'warning')->count(),
            'watch_lots'     => $lots->where('level', 'watch')->count(),
            'expired_lots'   => $lots->where('level', 'expired')->count(),
            'loss_qty'       => round($available->sum('loss_qty'), 3),
            'loss_value'     => round($lots->sum('loss_value'), 2),
            'action_count'   => $lots->whereNotNull('action')->count(),
        ];
    }

    private function fmt(float $n): string
    {
        return rtrim(rtrim(number_format($n, 1, ',', '.'), '0'), ',');
    }
}
