<?php

namespace App\Imports;

use App\Models\Modules\AccountingRecord;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class AccountingImport implements ToCollection, WithHeadingRow
{
    private int $importedCount = 0;
    private array $errors = [];

    private const TYPE_MAP = [
        'fatura'    => 'invoice',    'invoice'    => 'invoice',
        'gider'     => 'expense',    'expense'    => 'expense',
        'odeme'     => 'payment',    'ödeme'      => 'payment',    'payment'    => 'payment',
        'makbuz'    => 'receipt',    'receipt'    => 'receipt',
        'diger'     => 'other',      'diğer'      => 'other',      'other'      => 'other',
        'gelir'     => 'income',     'income'     => 'income',
        'borc'      => 'payable',    'borç'       => 'payable',    'payable'    => 'payable',
        'alacak'    => 'receivable', 'receivable' => 'receivable',
    ];

    private const PAYMENT_METHOD_MAP = [
        'nakit'           => 'cash',          'cash'          => 'cash',
        'kart'            => 'card',           'card'          => 'card',
        'kredi_karti'     => 'card',           'kredi kartı'   => 'card',
        'banka'           => 'bank_transfer',  'havale'        => 'bank_transfer',
        'eft'             => 'bank_transfer',  'bank_transfer' => 'bank_transfer',
        'banka_transferi' => 'bank_transfer',
        'cek'             => 'check',          'çek'           => 'check',           'check' => 'check',
        'diger'           => 'other',          'diğer'         => 'other',           'other' => 'other',
    ];

    private const PRIORITY_MAP = [
        'dusuk'  => 'low',    'düşük'  => 'low',    'low'    => 'low',
        'orta'   => 'medium', 'medium' => 'medium',
        'yuksek' => 'high',   'yüksek' => 'high',   'high'   => 'high',
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

            $typeRaw    = Str::lower(trim($this->col($row, ['type', 'tur', 'tür', 'tip']) ?? 'expense'));
            $type       = self::TYPE_MAP[$typeRaw] ?? 'expense';

            $priorityRaw = Str::lower(trim($this->col($row, ['priority', 'oncelik', 'öncelik']) ?? 'medium'));
            $priority    = self::PRIORITY_MAP[$priorityRaw] ?? 'medium';

            $amountRaw   = $this->col($row, ['amount', 'tutar', 'miktar']);
            $amount      = $amountRaw !== null ? (float) str_replace([',', ' '], ['.', ''], $amountRaw) : 0;

            $currency    = Str::upper(trim($this->col($row, ['currency', 'para_birimi', 'para birimi']) ?? 'TRY'));
            $vendor      = trim($this->col($row, ['vendor', 'tedarikci', 'tedarikçi', 'musteri', 'müşteri']) ?? '');
            $refNum      = trim($this->col($row, ['reference_number', 'referans_no', 'referans no', 'ref']) ?? '');
            $description = trim($this->col($row, ['description', 'aciklama', 'açıklama', 'notlar']) ?? '');
            $dueDateRaw  = $this->col($row, ['due_date', 'bitis_tarihi', 'bitiş tarihi']) ;
            $dueDate     = $this->parseDate($dueDateRaw);

            $transactionDateRaw = $this->col($row, ['transaction_date', 'islem_tarihi', 'işlem tarihi', 'tarih', 'date']);
            $transactionDate    = $this->parseDate($transactionDateRaw);

            $vatRateRaw  = $this->col($row, ['vat_rate', 'kdv_orani', 'kdv oranı', 'kdv']);
            $vatRate     = $vatRateRaw !== null ? (float) $vatRateRaw : 0;

            $vatIncludedRaw = $this->col($row, ['vat_included', 'kdv_dahil', 'kdv dahil']);
            $vatIncluded    = in_array(Str::lower(trim((string)($vatIncludedRaw ?? ''))), ['1', 'true', 'evet', 'yes', 'dahil'], true);

            $vatAmount = $vatIncluded
                ? round($amount - ($amount / (1 + $vatRate / 100)), 2)
                : round($amount * $vatRate / 100, 2);

            $paymentMethodRaw = Str::lower(trim($this->col($row, ['payment_method', 'odeme_yontemi', 'ödeme yöntemi', 'odeme', 'ödeme']) ?? ''));
            $paymentMethod    = self::PAYMENT_METHOD_MAP[$paymentMethodRaw] ?? null;

            $exchangeRateRaw = $this->col($row, ['exchange_rate', 'doviz_kuru', 'döviz kuru', 'kur']);
            $exchangeRate    = $exchangeRateRaw !== null ? (float) $exchangeRateRaw : 1;

            $isRecurringRaw = $this->col($row, ['is_recurring', 'tekrarlayan', 'recurring']);
            $isRecurring    = in_array(Str::lower(trim((string)($isRecurringRaw ?? ''))), ['1', 'true', 'evet', 'yes'], true);

            $recurringFrequency = Str::lower(trim($this->col($row, ['recurring_frequency', 'tekrar_sikligi', 'sıklık', 'frequency']) ?? ''));
            if (!in_array($recurringFrequency, ['weekly', 'monthly', 'yearly'])) {
                $recurringFrequency = null;
            }

            $recurringEndDateRaw = $this->col($row, ['recurring_end_date', 'tekrar_bitis', 'tekrar bitiş']);
            $recurringEndDate    = $this->parseDate($recurringEndDateRaw);

            AccountingRecord::create([
                'company_id'          => $this->companyId,
                'created_by'          => $this->createdBy,
                'updated_by'          => $this->createdBy,
                'title'               => $title,
                'type'                => $type,
                'status'              => 'pending',
                'priority'            => $priority,
                'amount'              => $amount,
                'currency'            => in_array($currency, ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'JPY']) ? $currency : 'TRY',
                'vendor'              => $vendor ?: null,
                'reference_number'    => $refNum ?: null,
                'description'         => $description ?: null,
                'due_date'            => $dueDate,
                'transaction_date'    => $transactionDate,
                'vat_rate'            => $vatRate,
                'vat_included'        => $vatIncluded,
                'vat_amount'          => $vatAmount,
                'payment_method'      => $paymentMethod,
                'exchange_rate'       => $exchangeRate,
                'is_recurring'        => $isRecurring,
                'recurring_frequency' => $recurringFrequency,
                'recurring_end_date'  => $recurringEndDate,
                'meta'                => ['period_type' => $this->periodType, 'imported' => true],
            ]);

            $this->importedCount++;
        }
    }

    public function getImportedCount(): int   { return $this->importedCount; }
    public function getErrors(): array        { return $this->errors; }

    private function col(array $row, array $keys): mixed
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $row) && $row[$key] !== null && $row[$key] !== '') {
                return $row[$key];
            }
        }
        return null;
    }

    private function parseDate(mixed $raw): ?string
    {
        if (empty($raw)) return null;

        // Excel serial date
        if (is_numeric($raw)) {
            try {
                return \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float)$raw)->format('Y-m-d');
            } catch (\Throwable) {}
        }

        $clean = trim((string) $raw);
        foreach (['Y-m-d', 'd.m.Y', 'd/m/Y', 'm/d/Y', 'Y.m.d'] as $fmt) {
            $dt = \DateTime::createFromFormat($fmt, $clean);
            if ($dt && $dt->format($fmt) === $clean) {
                return $dt->format('Y-m-d');
            }
        }

        return null;
    }
}
