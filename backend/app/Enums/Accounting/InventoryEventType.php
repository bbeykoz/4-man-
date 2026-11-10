<?php

namespace App\Enums\Accounting;

/**
 * Depo olay türleri ve muhasebe karşılıkları.
 *
 * Depo hareket tipi ile muhasebe olayı birebir aynı şey değil: aynı
 * "stock_out" hareketi satış sevkiyatı da olabilir fire de. Ekonomik niteliği
 * burada belirliyoruz (doküman §9: "Depo hareketi tek başına muhasebe fişi
 * olmamalı; ekonomik niteliği ve stok değerleme politikasıyla eşleştirilmeli").
 */
enum InventoryEventType: string
{
    case GoodsReceived      = 'GOODS_RECEIVED';
    case GoodsIssued        = 'GOODS_ISSUED';
    case WarehouseTransfer  = 'WAREHOUSE_TRANSFER';
    case CountVariance      = 'COUNT_VARIANCE';
    case Damage             = 'DAMAGE';
    case Adjustment         = 'ADJUSTMENT';
    case PurchaseReturn     = 'PURCHASE_RETURN';
    case SalesReturn        = 'SALES_RETURN';
    case OpeningBalance     = 'OPENING_BALANCE';
    case Reversal           = 'REVERSAL';

    public function label(): string
    {
        return match ($this) {
            self::GoodsReceived     => 'Mal kabul',
            self::GoodsIssued       => 'Mal çıkışı',
            self::WarehouseTransfer => 'Depolar arası transfer',
            self::CountVariance     => 'Sayım farkı',
            self::Damage            => 'Fire / hasar',
            self::Adjustment        => 'Stok düzeltmesi',
            self::PurchaseReturn    => 'Tedarikçiye iade',
            self::SalesReturn       => 'Müşteri iadesi',
            self::OpeningBalance    => 'Açılış stoğu',
            self::Reversal          => 'Stok hareketi iptali',
        };
    }

    /**
     * Fiş üretir mi.
     *
     * Aynı tüzel kişilik içinde depolar arası transferde toplam stok değeri
     * değişmez; yalnız depo analitiği değişir. Transit hesabı kullanan
     * şirketler için ileride açılabilir, şimdilik kayıt üretmiyoruz.
     */
    public function createsJournalEntry(): bool
    {
        return $this !== self::WarehouseTransfer;
    }

    /** Fiş üretmiyorsa sebebi; outbox satırında saklanır. */
    public function skipReason(): ?string
    {
        return match ($this) {
            self::WarehouseTransfer => 'Aynı tüzel kişilik içinde transfer; toplam stok değeri değişmiyor, yalnız depo analitiği değişiyor.',
            default                 => null,
        };
    }

    /** Hangi fiş türüne yazılır. */
    public function journalType(): JournalType
    {
        return JournalType::Inventory;
    }

    /**
     * Stok değerini artıran bir olay mı.
     *
     * null = yöne olayın kendi miktarı karar verir (düzeltme, sayım farkı
     * hem artı hem eksi olabilir).
     */
    public function increasesInventory(): ?bool
    {
        return match ($this) {
            self::GoodsReceived, self::SalesReturn, self::OpeningBalance => true,
            self::GoodsIssued, self::PurchaseReturn, self::Damage        => false,
            default                                                      => null,
        };
    }
}
