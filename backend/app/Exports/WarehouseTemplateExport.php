<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;

class WarehouseTemplateExport implements FromArray, WithStyles, WithColumnWidths
{
    public function array(): array
    {
        return [
            [
                'title', 'type', 'warehouse', 'product_name', 'sku', 'quantity', 'unit',
                'unit_price', 'min_stock', 'batch_number', 'expiry_date', 'priority', 'description',
            ],
            [
                'Ürün A Stok Girişi', 'stock_in', 'Ana Depo', 'Ürün A', 'SKU-001', '100', 'adet',
                '150.00', '20', 'LOT-2026-01', '2026-12-31', 'medium', 'Mevcut SKU: katalogdaki ürünle eşleşir',
            ],
            [
                'Ürün C Stok Girişi', 'stock_in', 'Ana Depo', 'Ürün C (Yeni)', 'SKU-099', '50', 'kutu',
                '75.50', '10', '', '', 'medium', 'Yeni SKU: ürün kataloğa otomatik eklenir',
            ],
            [
                'Ürün B Çıkış', 'stock_out', 'Ana Depo', 'Ürün B', 'SKU-002', '25', 'kg',
                '', '', '', '', 'high', '',
            ],
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FFD97706']],
            ],
        ];
    }

    public function columnWidths(): array
    {
        return [
            'A' => 26, 'B' => 12, 'C' => 14, 'D' => 20, 'E' => 12, 'F' => 10, 'G' => 10,
            'H' => 12, 'I' => 11, 'J' => 14, 'K' => 14, 'L' => 10, 'M' => 38,
        ];
    }
}
