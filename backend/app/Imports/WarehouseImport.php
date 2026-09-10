<?php

namespace App\Imports;

use App\Models\Modules\WarehouseRecord;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class WarehouseImport implements ToCollection, WithHeadingRow
{
    private int $importedCount = 0;
    private array $errors = [];

    private const TYPE_MAP = [
        'stok_giris'  => 'stock_in',   'stok girişi' => 'stock_in',  'stock_in'   => 'stock_in',
        'stok_cikis'  => 'stock_out',  'stok çıkışı' => 'stock_out', 'stock_out'  => 'stock_out',
        'transfer'    => 'transfer',
        'duzeltme'    => 'adjustment', 'düzeltme'    => 'adjustment', 'adjustment' => 'adjustment',
        'denetim'     => 'inspection', 'inspection'  => 'inspection',
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
        foreach ($rows as $index => $row) {
            $rowNum = $index + 2;
            $row    = $row->toArray();

            $title = trim($this->col($row, ['title', 'baslik', 'başlık', 'ad', 'isim']) ?? '');

            if (empty($title)) {
                $this->errors[] = "{$rowNum}. satır atlandı: Başlık boş.";
                continue;
            }

            $typeRaw  = Str::lower(trim($this->col($row, ['type', 'tur', 'tür', 'tip']) ?? 'stock_in'));
            $type     = self::TYPE_MAP[$typeRaw] ?? 'stock_in';

            $priorityRaw = Str::lower(trim($this->col($row, ['priority', 'oncelik', 'öncelik']) ?? 'medium'));
            $priority    = self::PRIORITY_MAP[$priorityRaw] ?? 'medium';

            $qtyRaw  = $this->col($row, ['quantity', 'miktar', 'adet']);
            $qty     = $qtyRaw !== null ? (float) str_replace([',', ' '], ['.', ''], $qtyRaw) : 0;

            $budgetRaw = $this->col($row, ['budget', 'butce', 'bütçe']);
            $budget    = $budgetRaw !== null ? (float) str_replace([',', ' '], ['.', ''], $budgetRaw) : null;

            $productName = trim($this->col($row, ['product_name', 'urun_adi', 'ürün adı', 'urun']) ?? '');
            $sku         = trim($this->col($row, ['sku', 'barkod', 'barcode']) ?? '');
            $unit        = trim($this->col($row, ['unit', 'birim']) ?? '');
            $location    = trim($this->col($row, ['location', 'lokasyon', 'konum']) ?? '');
            $description = trim($this->col($row, ['description', 'aciklama', 'açıklama']) ?? '');

            WarehouseRecord::create([
                'company_id'   => $this->companyId,
                'created_by'   => $this->createdBy,
                'updated_by'   => $this->createdBy,
                'title'        => $title,
                'type'         => $type,
                'status'       => 'pending',
                'priority'     => $priority,
                'quantity'     => $qty,
                'budget'       => $budget,
                'product_name' => $productName ?: null,
                'sku'          => $sku ?: null,
                'unit'         => $unit ?: null,
                'location'     => $location ?: null,
                'description'  => $description ?: null,
                'meta'         => ['period_type' => $this->periodType, 'imported' => true],
            ]);

            $this->importedCount++;
        }
    }

    public function getImportedCount(): int { return $this->importedCount; }
    public function getErrors(): array      { return $this->errors; }

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
