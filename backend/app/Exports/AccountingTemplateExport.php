<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;

class AccountingTemplateExport implements FromArray, WithStyles, WithColumnWidths
{
    public function array(): array
    {
        return [
            // Headers
            [
                'title',
                'type',
                'amount',
                'currency',
                'vat_rate',
                'vat_included',
                'payment_method',
                'exchange_rate',
                'transaction_date',
                'due_date',
                'vendor',
                'reference_number',
                'is_recurring',
                'recurring_frequency',
                'recurring_end_date',
                'priority',
                'description',
            ],
            // Örnek satır 1 — aylık gider
            [
                'Ofis Kira Ödemesi',
                'expense',
                '5000',
                'TRY',
                '20',
                'hayır',
                'banka',
                '1',
                date('Y-m-d'),
                date('Y-m-d', strtotime('+30 days')),
                'Mülk Sahibi A.Ş.',
                'INV-2024-001',
                'evet',
                'monthly',
                '',
                'high',
                'Aylık ofis kirası',
            ],
            // Örnek satır 2 — müşteri faturası
            [
                'Müşteri Faturası',
                'invoice',
                '12500',
                'TRY',
                '20',
                'evet',
                'kart',
                '1',
                date('Y-m-d'),
                date('Y-m-d', strtotime('+15 days')),
                'Müşteri Ltd. Şti.',
                'FAT-2024-042',
                'hayır',
                '',
                '',
                'medium',
                '',
            ],
            // Örnek satır 3 — dövizli gelir
            [
                'İhracat Geliri',
                'income',
                '5000',
                'USD',
                '0',
                'hayır',
                'banka_transferi',
                '32.50',
                date('Y-m-d'),
                '',
                'Yabancı Müşteri Inc.',
                'EXP-2024-007',
                'hayır',
                '',
                '',
                'high',
                'USD/TRY kuru üzerinden',
            ],
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF2563EB']],
            ],
        ];
    }

    public function columnWidths(): array
    {
        return [
            'A' => 30, // title
            'B' => 15, // type
            'C' => 12, // amount
            'D' => 10, // currency
            'E' => 12, // vat_rate
            'F' => 14, // vat_included
            'G' => 18, // payment_method
            'H' => 14, // exchange_rate
            'I' => 18, // transaction_date
            'J' => 15, // due_date
            'K' => 25, // vendor
            'L' => 20, // reference_number
            'M' => 14, // is_recurring
            'N' => 20, // recurring_frequency
            'O' => 18, // recurring_end_date
            'P' => 12, // priority
            'Q' => 35, // description
        ];
    }
}
