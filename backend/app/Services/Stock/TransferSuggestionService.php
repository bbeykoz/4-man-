<?php

namespace App\Services\Stock;

use App\Exceptions\StockException;
use App\Models\Modules\WarehouseRecord;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use App\Support\TurkishSuffix;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Depolar arası akıllı transfer: her depo için hedef stok (tüketim × (tedarik + gözden geçirme) + güvenlik payı)
 * hesaplanır; açığı olan depo, fazlası olan depodan karşılanır. Onaylanmamış transferler hesaba katılır.
 * Öneri sadece öneridir; transfer emri "Bekliyor" kayıt olarak açılır ve kullanıcı onaylar.
 */
class TransferSuggestionService
{
    public function __construct(
        private readonly StockMetricsService $metrics,
        private readonly StockRiskService $risk,
    ) {}

    /** @return array{suggestions: Collection, summary: array, message: ?string} */
    public function suggestions(string $companyId): array
    {
        $warehouses = Warehouse::forCompany($companyId)->active()->orderByDesc('is_default')->orderBy('name')->get();
        if ($warehouses->count() < 2) {
            return [
                'suggestions' => collect(),
                'summary'     => $this->summary(collect()),
                'message'     => 'Transfer önerisi için en az iki aktif depo gerekir.',
            ];
        }

        $products = WarehouseProduct::forCompany($companyId)->active()->with('defaultSupplier:id,default_lead_time_days')->get()->keyBy('id');
        $ids      = $products->keys()->all();
        $review   = (int) config('stock.review_period_days', 7);

        $perWarehouse = $warehouses->mapWithKeys(fn(Warehouse $w) => [$w->id => $this->metrics->forProducts($companyId, $w->id, $ids)]);
        $pending      = $this->pendingTransfers($companyId);
        $companyRisk  = $this->risk->assessCompany($companyId)->keyBy('product_id');

        $suggestions = collect();
        foreach ($products as $product) {
            $horizon = max(1, ($product->lead_time_days ?? $product->defaultSupplier?->default_lead_time_days ?? (int) config('stock.default_lead_time_days', 7)) + $review);

            $states = $warehouses->map(function (Warehouse $w) use ($perWarehouse, $product, $pending, $horizon) {
                $m        = $perWarehouse[$w->id][$product->id];
                $incoming = $pending['in'][$product->id][$w->id] ?? 0;
                $outgoing = $pending['out'][$product->id][$w->id] ?? 0;

                return [
                    'warehouse' => $w,
                    'available' => (float) $m['available'] - $outgoing,
                    'incoming'  => (float) $m['on_order'] + $incoming,
                    'daily'     => (float) $m['daily_consumption'],
                ];
            });

            $totalDaily = $states->sum('daily');
            $safety     = (float) ($product->safety_stock ?? 0);

            $states = $states->map(function ($s) use ($horizon, $totalDaily, $safety) {
                $safetyShare = $totalDaily > 0 ? $safety * $s['daily'] / $totalDaily : 0;
                $target      = $s['daily'] * $horizon + $safetyShare;

                return [...$s,
                    'safety'  => $safetyShare,
                    'target'  => $target,
                    'need'    => $s['daily'] > 0 ? max(0, $target - $s['available'] - $s['incoming']) : 0,
                    'excess'  => max(0, $s['available'] - $target),
                    'cover'   => $s['daily'] > 0 ? $s['available'] / $s['daily'] : null,
                ];
            })->values()->all();

            // En acil açık (en az gün) önce; en çok fazlası olan kaynak önce
            usort($states, fn($a, $b) => ($a['cover'] ?? INF) <=> ($b['cover'] ?? INF));
            foreach ($states as $di => $dest) {
                if ($dest['need'] < 1) {
                    continue;
                }
                $sources = array_filter($states, fn($s) => $s['excess'] >= 1 && $s['warehouse']->id !== $dest['warehouse']->id);
                uasort($sources, fn($a, $b) => $b['excess'] <=> $a['excess']);

                foreach ($sources as $si => $src) {
                    $qty = floor(min($states[$di]['need'], $states[$si]['excess']));
                    if ($qty < 1) {
                        continue;
                    }

                    $suggestions->push($this->suggestion($product, $states[$si], $states[$di], $qty, $horizon, $companyRisk[$product->id] ?? null));

                    $states[$di]['need']      -= $qty;
                    $states[$di]['available'] += $qty;
                    $states[$si]['excess']    -= $qty;
                    $states[$si]['available'] -= $qty;
                    if ($states[$di]['need'] < 1) {
                        break;
                    }
                }
            }
        }

        $suggestions = $suggestions->sortBy('dest_cover_days')->values();

        return ['suggestions' => $suggestions, 'summary' => $this->summary($suggestions), 'message' => null];
    }

    /**
     * Seçilen önerilerden "Bekliyor" transfer kayıtları.
     * @param array<int, array{product_id: string, from_warehouse_id: string, to_warehouse_id: string, quantity: float, reason?: string}> $lines
     */
    public function createOrders(User $user, array $lines): Collection
    {
        $companyId  = $user->company_id;
        $warehouses = Warehouse::forCompany($companyId)->active()->get()->keyBy('id');
        $products   = WarehouseProduct::forCompany($companyId)->whereIn('id', array_column($lines, 'product_id'))->get()->keyBy('id');

        return DB::transaction(fn() => collect($lines)->map(function ($line) use ($user, $warehouses, $products) {
            $product = $products[$line['product_id']] ?? throw new StockException('Ürün bulunamadı.');
            $from    = $warehouses[$line['from_warehouse_id']] ?? throw new StockException('Kaynak depo bulunamadı veya pasif.');
            $to      = $warehouses[$line['to_warehouse_id']] ?? throw new StockException('Hedef depo bulunamadı veya pasif.');
            if ($from->id === $to->id) {
                throw new StockException('Kaynak ve hedef depo aynı olamaz.');
            }

            return WarehouseRecord::create([
                'company_id'       => $user->company_id,
                'created_by'       => $user->id,
                'updated_by'       => $user->id,
                'title'            => "Transfer önerisi: {$product->name} {$from->name} → {$to->name}",
                'description'      => $line['reason'] ?? 'Depolar arası transfer önerisinden oluşturuldu.',
                'type'             => 'transfer',
                'status'           => 'pending',
                'priority'         => 'high',
                'product_id'       => $product->id,
                'product_name'     => $product->name,
                'sku'              => $product->sku,
                'quantity'         => $line['quantity'],
                'unit'             => $product->unit,
                'warehouse_id'     => $from->id,
                'to_warehouse_id'  => $to->id,
                'transaction_date' => now()->toDateString(),
                'meta'             => ['source' => 'transfer_suggestion'],
            ]);
        }));
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /** Onaylanmamış transfer kayıtları: kaynaktan çıkacak / hedefe girecek miktar. */
    private function pendingTransfers(string $companyId): array
    {
        $rows = WarehouseRecord::where('company_id', $companyId)
            ->where('type', 'transfer')
            ->whereIn('status', ['draft', 'pending', 'in_progress'])
            ->whereNull('posted_at')
            ->whereNotNull('product_id')
            ->get(['product_id', 'warehouse_id', 'to_warehouse_id', 'quantity']);

        $in = $out = [];
        foreach ($rows as $r) {
            if ($r->warehouse_id) {
                $out[$r->product_id][$r->warehouse_id] = ($out[$r->product_id][$r->warehouse_id] ?? 0) + (float) $r->quantity;
            }
            if ($r->to_warehouse_id) {
                $in[$r->product_id][$r->to_warehouse_id] = ($in[$r->product_id][$r->to_warehouse_id] ?? 0) + (float) $r->quantity;
            }
        }

        return ['in' => $in, 'out' => $out];
    }

    private function suggestion(WarehouseProduct $product, array $src, array $dest, float $qty, int $horizon, ?array $companyRisk): array
    {
        $unit     = $product->unit ?: 'adet';
        $destName = $dest['warehouse']->name;
        $srcName  = $src['warehouse']->name;

        $gapDays = $dest['daily'] > 0 ? max(0, $horizon - ($dest['available'] + $dest['incoming']) / $dest['daily']) : 0;
        $reasons = [];
        if ($dest['safety'] > 0 && $dest['available'] <= $dest['safety']) {
            $reasons[] = TurkishSuffix::locative($destName) . ' güvenlik stoğu altına düşüş';
        } else {
            $reasons[] = TurkishSuffix::locative($destName) . ' ' . round($gapDays) . ' günlük açık riski';
        }
        $reasons[] = $src['daily'] > 0
            ? TurkishSuffix::locative($srcName) . ' fazla stok (' . round($src['available'] / $src['daily']) . ' günlük)'
            : TurkishSuffix::locative($srcName) . ' tüketim yok';

        // Şirket toplamında sipariş gerekmiyorsa bu transfer satın almanın yerini tutar
        $companySufficient = $companyRisk !== null && ($companyRisk['suggested_order_qty'] ?? 0) <= 0;

        return [
            'product_id'         => $product->id,
            'name'               => $product->name,
            'sku'                => $product->sku,
            'unit'               => $unit,
            'from_warehouse_id'  => $src['warehouse']->id,
            'from_warehouse'     => $srcName,
            'to_warehouse_id'    => $dest['warehouse']->id,
            'to_warehouse'       => $destName,
            'source_stock'       => round($src['available'], 3),
            'source_daily'       => round($src['daily'], 3),
            'dest_stock'         => round($dest['available'], 3),
            'dest_daily'         => round($dest['daily'], 3),
            'dest_cover_days'    => $dest['cover'] !== null ? round($dest['cover'], 1) : null,
            'dest_need'          => round($dest['need'], 3),
            'quantity'           => $qty,
            'value'              => $product->unit_price !== null ? round($qty * (float) $product->unit_price, 2) : null,
            'replaces_purchase'  => $companySufficient,
            'reason'             => implode('; ', $reasons) . '.',
        ];
    }

    private function summary(Collection $suggestions): array
    {
        return [
            'count'              => $suggestions->count(),
            'total_qty'          => round($suggestions->sum('quantity'), 3),
            'total_value'        => round($suggestions->sum('value'), 2),
            'replaces_purchase'  => $suggestions->where('replaces_purchase', true)->count(),
            'products'           => $suggestions->pluck('product_id')->unique()->count(),
        ];
    }
}
