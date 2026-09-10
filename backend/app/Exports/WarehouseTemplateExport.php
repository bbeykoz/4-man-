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
            ['title', 'type', 'quantity', 'unit', 'budget', 'product_name', 'sku', 'location', 'priority', 'description'],
            ['Ürün A Stok Girişi', 'stock_in', '100', 'adet', '5000', 'Ürün A', 'SKU-001', 'Raf-A1', 'medium', 'Aylık stok girişi'],
            ['Ürün B Çıkış', 'stock_out', '25', 'kg', '', 'Ürün B', 'SKU-002', 'Raf-B2', 'high', ''],
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
            'A' => 30, 'B' => 15, 'C' => 12, 'D' => 10,
            'E' => 12, 'F' => 25, 'G' => 15, 'H' => 20,
            'I' => 12, 'J' => 35,
        ];
    }
}
