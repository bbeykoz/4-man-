<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\InventoryEventType;
use App\Models\Accounting\InventoryAccountingEvent;
use App\Models\Modules\WarehouseRecord;
use App\Models\StockMovement;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Depo olaylarını muhasebe kuyruğuna yazar.
 *
 * Depo tarafından çağrılır ve stok hareketiyle aynı transaction içinde
 * çalışır: stok yazıldıysa olay da yazılmıştır, biri olmadan diğeri olmaz.
 * Fişi burada üretmiyoruz — muhasebe kurulumu eksikse ya da dönem kapalıysa
 * depo işleminin durmaması gerekiyor.
 *
 * Yayımlama asla exception atmaz. Depo modülünün çalışması muhasebeye bağlı
 * olmamalı; sorun olursa olay "failed" olarak düşer ve görünür kalır.
 */
class InventoryOutboxService
{
    /** Depo kayıt tipi → muhasebe olayı. */
    private const TIP_ESLEMESI = [
        'stock_in'    => InventoryEventType::GoodsReceived,
        'return_in'   => InventoryEventType::SalesReturn,
        'stock_out'   => InventoryEventType::GoodsIssued,
        'damage'      => InventoryEventType::Damage,
        'transfer'    => InventoryEventType::WarehouseTransfer,
        'adjustment'  => InventoryEventType::Adjustment,
        'stock_count' => InventoryEventType::CountVariance,
    ];

    /**
     * Depo kaydının stoğa işlenmesini yayımlar.
     *
     * @return InventoryAccountingEvent|null Olay yazıldıysa kaydı, yazılmadıysa null.
     */
    public function publishRecordPosted(WarehouseRecord $kayit): ?InventoryAccountingEvent
    {
        $tur = self::TIP_ESLEMESI[$kayit->type] ?? null;

        if ($tur === null) {
            return null;   // stok etkisi olmayan kayıt (inspection vb.)
        }

        return $this->publish(
            companyId: $kayit->company_id,
            eventId:   "warehouse_record:{$kayit->id}:posted",
            tur:       $tur,
            kayit:     $kayit,
            satirlar:  $this->movementLines($kayit),
        );
    }

    /** Stok geri alma; muhasebe tarafında ters kayıt üretir. */
    public function publishRecordReversed(WarehouseRecord $kayit): ?InventoryAccountingEvent
    {
        if (! isset(self::TIP_ESLEMESI[$kayit->type])) {
            return null;
        }

        return $this->publish(
            companyId: $kayit->company_id,
            eventId:   "warehouse_record:{$kayit->id}:reversed",
            tur:       InventoryEventType::Reversal,
            kayit:     $kayit,
            satirlar:  $this->movementLines($kayit, tersle: true),
            ekYuk:     ['reverses_event_id' => "warehouse_record:{$kayit->id}:posted"],
        );
    }

    /**
     * Olayı kuyruğa yazar.
     *
     * Aynı event_id ikinci kez gelirse benzersiz kısıt engelliyor ve mevcut
     * kayıt dönüyor — idempotency burada sağlanıyor, çağıranın kontrol
     * etmesine gerek yok.
     */
    private function publish(
        string $companyId,
        string $eventId,
        InventoryEventType $tur,
        WarehouseRecord $kayit,
        array $satirlar,
        array $ekYuk = [],
    ): ?InventoryAccountingEvent {
        try {
            $tarih = ($kayit->transaction_date ?? $kayit->posted_at ?? now());

            return InventoryAccountingEvent::create([
                'id'              => (string) Str::uuid(),
                'company_id'      => $companyId,
                'event_id'        => $eventId,
                'event_type'      => $tur->value,
                'source_type'     => 'WAREHOUSE_RECORD',
                'source_id'       => $kayit->id,
                'source_number'   => $kayit->record_number,
                'occurred_at'     => now(),
                'accounting_date' => $tarih instanceof \DateTimeInterface
                    ? $tarih->format('Y-m-d')
                    : (string) $tarih,
                'payload'         => array_merge([
                    'record_type'    => $kayit->type,
                    'record_number'  => $kayit->record_number,
                    'title'          => $kayit->title,
                    'product_id'     => $kayit->product_id,
                    'product_name'   => $kayit->product_name,
                    'sku'            => $kayit->sku,
                    'warehouse_id'   => $kayit->warehouse_id,
                    'to_warehouse_id'=> $kayit->to_warehouse_id ?? null,
                    'batch_number'   => $kayit->batch_number,
                    'supplier_id'    => $kayit->supplier_id ?? null,
                    'lines'          => $satirlar,
                    'total_value'    => round(array_sum(array_column($satirlar, 'value')), 2),
                ], $ekYuk),
                'status'          => 'pending',
            ]);
        } catch (UniqueConstraintViolationException) {
            // Olay zaten yayımlanmış; ikinci fiş üretilmemeli.
            return InventoryAccountingEvent::where('company_id', $companyId)
                ->where('event_id', $eventId)
                ->first();
        } catch (\Throwable $e) {
            // Depo işlemi muhasebe yüzünden durmamalı. Hata görünür kalsın diye
            // en azından kuyruğa "failed" satırı düşürmeye çalışıyoruz.
            $this->logFailure($companyId, $eventId, $tur, $kayit, $e);

            return null;
        }
    }

    /**
     * Kaydın stok hareketlerini muhasebenin anlayacağı satırlara çevirir.
     *
     * Değer = miktar × birim maliyet. Rezerve kovası arası taşımalar
     * (available → reserved) muhasebeyi ilgilendirmiyor: toplam stok değeri
     * değişmiyor, yalnız iç ayrım değişiyor.
     */
    private function movementLines(WarehouseRecord $kayit, bool $tersle = false): array
    {
        $hareketler = StockMovement::withDeletedProducts()
            ->where('record_id', $kayit->id)
            ->where('movement_type', '!=', 'reversal')
            ->get();

        $satirlar = [];

        foreach ($hareketler as $h) {
            // Rezerv kovası finansal değil operasyonel bir ayrım.
            if ($h->bucket === StockMovement::BUCKET_RESERVED) {
                continue;
            }

            $miktar  = (float) $h->quantity * ($tersle ? -1 : 1);
            $maliyet = (float) ($h->unit_cost ?? 0);

            $satirlar[] = [
                'movement_id'  => $h->id,
                'product_id'   => $h->product_id,
                'warehouse_id' => $h->warehouse_id,
                'bucket'       => $h->bucket,
                'lot_number'   => $h->lot_number,
                'quantity'     => round($miktar, 6),
                'unit_cost'    => round($maliyet, 6),
                'value'        => round($miktar * $maliyet, 2),
                'movement_type'=> $h->movement_type,
            ];
        }

        return $satirlar;
    }

    private function logFailure(string $companyId, string $eventId, InventoryEventType $tur, WarehouseRecord $kayit, \Throwable $e): void
    {
        try {
            DB::table('inventory_accounting_events')->insert([
                'id'              => (string) Str::uuid(),
                'company_id'      => $companyId,
                'event_id'        => $eventId,
                'event_type'      => $tur->value,
                'source_type'     => 'WAREHOUSE_RECORD',
                'source_id'       => $kayit->id,
                'source_number'   => $kayit->record_number,
                'occurred_at'     => now(),
                'accounting_date' => now()->toDateString(),
                'payload'         => json_encode(['error' => true], JSON_UNESCAPED_UNICODE),
                'status'          => 'failed',
                'last_error'      => mb_substr($e->getMessage(), 0, 1000),
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);
        } catch (\Throwable) {
            // Kuyruğa bile yazamıyorsak sessiz kalıyoruz; depo işlemi sürmeli.
        }
    }
}
