<?php

namespace App\Imports;

use App\Models\Modules\WarehouseRecord;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

/**
 * Excel'deki "Depo" ve "SKU" sütunlarını gerçek depo/ürün kataloğuyla eşleştirir:
 * Depo adı/koduyla warehouse_id, SKU ile mevcut ürünün product_id'si bulunur;
 * SKU (veya ürün adı) katalogda yoksa ürün otomatik olarak eklenir.
 */
class WarehouseImport implements ToCollection, WithHeadingRow
{
    private int $importedCount = 0;
    private int $createdProductCount = 0;
    private array $errors = [];

    /** Aynı dosyada tekrar eden SKU/ürün adları için tek sorguda bul/oluştur. */
    private array $productCache = [];
    /** Aynı dosyada tekrar eden depo adları/kodları için tek sorguda bul. */
    private array $warehouseCache = [];

    private const TYPE_MAP = [
        'stok_giris'  => 'stock_in',    'stok girişi' => 'stock_in',    'stock_in'    => 'stock_in',
        'stok_cikis'  => 'stock_out',   'stok çıkışı' => 'stock_out',   'stock_out'   => 'stock_out',
        'transfer'    => 'transfer',
        'duzeltme'    => 'adjustment',  'düzeltme'    => 'adjustment',  'adjustment'  => 'adjustment',
        'denetim'     => 'inspection',  'inspection'  => 'inspection',
        'sayim'       => 'stock_count', 'stok sayımı' => 'stock_count', 'stock_count' => 'stock_count',
        'hasar'       => 'damage',      'damage'      => 'damage',
        'iade_giris'  => 'return_in',   'iade girişi' => 'return_in',   'return_in'   => 'return_in',
    ];

    private const PRIORITY_MAP = [
        'dusuk'  => 'low',    'düşük'  => 'low',    'low'      => 'low',
        'orta'   => 'medium', 'medium' => 'medium',
        'yuksek' => 'high',   'yüksek' => 'high',   'high'     => 'high',
        'kritik' => 'critical','critical' => 'critical',
    ];

    public function __construct(
        private readonly string $companyId,
        private readonly string $createdBy,
        private readonly string $periodType,
    ) {}

    public function collection(Collection $rows): void
    {
        $defaultWarehouseId = Warehouse::defaultFor($this->companyId)?->id;

        foreach ($rows as $index => $row) {
            $rowNum = $index + 2;
            $row    = $row->toArray();

            $sku         = trim((string) ($this->col($row, ['sku', 'barkod', 'barcode', 'stok_kodu']) ?? ''));
            $productName = trim((string) ($this->col($row, ['product_name', 'urun_adi', 'urun']) ?? ''));
            $title       = trim((string) ($this->col($row, ['title', 'baslik']) ?? ''));

            if ($title === '' && $productName === '' && $sku === '') {
                $this->errors[] = "{$rowNum}. satır atlandı: Başlık, ürün adı veya SKU gerekli.";
                continue;
            }

            $typeRaw = Str::lower(trim((string) ($this->col($row, ['type', 'tur', 'tip']) ?? 'stock_in')));
            $type    = self::TYPE_MAP[$typeRaw] ?? 'stock_in';

            $priorityRaw = Str::lower(trim((string) ($this->col($row, ['priority', 'oncelik']) ?? 'medium')));
            $priority    = self::PRIORITY_MAP[$priorityRaw] ?? 'medium';

            $qtyRaw = $this->col($row, ['quantity', 'miktar', 'adet']);
            $qty    = $qtyRaw !== null ? (float) str_replace([',', ' '], ['.', ''], (string) $qtyRaw) : 0;

            $unit         = trim((string) ($this->col($row, ['unit', 'birim']) ?? ''));
            $unitPriceRaw = $this->col($row, ['unit_price', 'birim_fiyat']);
            $unitPrice    = ($unitPriceRaw !== null && $unitPriceRaw !== '')
                ? (float) str_replace([',', ' '], ['.', ''], (string) $unitPriceRaw) : null;
            $minStockRaw  = $this->col($row, ['min_stock', 'min_stok', 'kritik_stok']);
            $minStock     = ($minStockRaw !== null && $minStockRaw !== '')
                ? (float) str_replace([',', ' '], ['.', ''], (string) $minStockRaw) : null;

            $warehouseName = trim((string) ($this->col($row, ['warehouse', 'depo', 'depo_adi', 'depo_kodu']) ?? ''));
            $location      = trim((string) ($this->col($row, ['location', 'lokasyon', 'konum', 'raf']) ?? ''));
            $batchNumber   = trim((string) ($this->col($row, ['batch_number', 'parti_no', 'lot', 'lot_no']) ?? ''));
            $expiryRaw     = $this->col($row, ['expiry_date', 'son_kullanma_tarihi', 'skt']);
            $description   = trim((string) ($this->col($row, ['description', 'aciklama']) ?? ''));

            // Depo: belirtilmişse ada/koda göre bul; eşleşmezse satırı atla (sessizce yanlış depoya yazmamak için).
            $warehouseId = $defaultWarehouseId;
            if ($warehouseName !== '') {
                $warehouseId = $this->resolveWarehouse($warehouseName);
                if (!$warehouseId) {
                    $this->errors[] = "{$rowNum}. satır atlandı: \"{$warehouseName}\" adında/kodunda depo bulunamadı.";
                    continue;
                }
            }

            // Ürün: SKU/ad katalogda varsa eşleştirilir; yoksa otomatik olarak katalogA eklenir.
            $productId = null;
            if ($sku !== '' || $productName !== '') {
                $product = $this->resolveProduct($sku, $productName, $unit, $unitPrice, $minStock);
                if ($product) {
                    $productId   = $product->id;
                    $sku         = $sku !== '' ? $sku : (string) $product->sku;
                    $productName = $productName !== '' ? $productName : $product->name;
                    $unit        = $unit !== '' ? $unit : (string) $product->unit;
                }
            }

            if ($title === '') {
                $title = $productName !== '' ? $productName : "SKU {$sku}";
            }

            WarehouseRecord::create([
                'company_id'   => $this->companyId,
                'created_by'   => $this->createdBy,
                'updated_by'   => $this->createdBy,
                'title'        => $title,
                'type'         => $type,
                'status'       => 'pending',
                'priority'     => $priority,
                'quantity'     => $qty,
                'product_id'   => $productId,
                'product_name' => $productName !== '' ? $productName : null,
                'sku'          => $sku !== '' ? $sku : null,
                'unit'         => $unit !== '' ? $unit : null,
                'warehouse_id' => $warehouseId,
                'location'     => $location !== '' ? $location : null,
                'batch_number' => $batchNumber !== '' ? $batchNumber : null,
                'expiry_date'  => $this->parseDate($expiryRaw),
                'description'  => $description !== '' ? $description : null,
                'qc_status'    => WarehouseRecord::QC_PENDING,
                'meta'         => ['period_type' => $this->periodType, 'imported' => true],
            ]);

            $this->importedCount++;
        }
    }

    /** Depo adı veya koduyla (şirkete ait, büyük/küçük harf duyarsız) eşleşen deponun id'sini döner. */
    private function resolveWarehouse(string $term): ?string
    {
        $key = Str::lower($term);
        if (array_key_exists($key, $this->warehouseCache)) {
            return $this->warehouseCache[$key];
        }

        $warehouse = Warehouse::where('company_id', $this->companyId)
            ->where(fn($q) => $q->whereRaw('LOWER(name) = ?', [$key])->orWhereRaw('LOWER(code) = ?', [$key]))
            ->first();

        return $this->warehouseCache[$key] = $warehouse?->id;
    }

    /** SKU'ya (yoksa ürün adına) göre kataloğu arar; bulunamazsa yeni ürün olarak ekler. */
    private function resolveProduct(string $sku, string $name, string $unit, ?float $unitPrice, ?float $minStock): ?WarehouseProduct
    {
        $cacheKey = $sku !== '' ? 'sku:' . Str::lower($sku) : 'name:' . Str::lower($name);
        if (array_key_exists($cacheKey, $this->productCache)) {
            return $this->productCache[$cacheKey];
        }

        $product = null;
        if ($sku !== '') {
            $product = WarehouseProduct::where('company_id', $this->companyId)->where('sku', $sku)->first();
        }
        if (!$product && $name !== '') {
            $product = WarehouseProduct::where('company_id', $this->companyId)->where('name', $name)->first();
        }

        if (!$product) {
            $product = WarehouseProduct::create([
                'company_id' => $this->companyId,
                'name'       => $name !== '' ? $name : $sku,
                'sku'        => $sku !== '' ? $sku : null,
                'unit'       => $unit !== '' ? $unit : 'adet',
                'unit_price' => $unitPrice,
                'min_stock'  => $minStock ?? 0,
                'is_active'  => true,
            ]);
            $this->createdProductCount++;
        }

        return $this->productCache[$cacheKey] = $product;
    }

    /** Excel tarih hücresi seri sayı, DateTime veya metin olarak gelebilir; hepsini Y-m-d'ye çevirir. */
    private function parseDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }
        if (is_numeric($value)) {
            try {
                return ExcelDate::excelToDateTimeObject((float) $value)->format('Y-m-d');
            } catch (\Throwable) {
                return null;
            }
        }
        try {
            return Carbon::parse((string) $value)->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    public function getImportedCount(): int { return $this->importedCount; }
    public function getCreatedProductCount(): int { return $this->createdProductCount; }
    public function getErrors(): array { return $this->errors; }

    private function col(array $row, array $keys): mixed
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $row) && $row[$key] !== null && $row[$key] !== '') {
                return $row[$key];
            }
        }
        return null;
    }
}
