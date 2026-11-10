<?php

namespace App\Console\Commands;

use App\Enums\Accounting\DocumentType;
use App\Models\Accounting\Document;
use App\Models\Accounting\TaxCode;
use App\Models\Company;
use App\Models\Modules\AccountingRecord;
use App\Services\Accounting\AuditService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Eski düz muhasebe kayıtlarını (accounting_records) belge katmanına taşır.
 *
 * Taşınan belgeler TASLAK olarak oluşturulur, deftere işlenmez. Geçmiş
 * kayıtların muhasebe etkisi bilinmiyor; bunları otomatik fişe çevirmek
 * uydurma bir defter üretirdi. İnsan gözden geçirip post eder.
 *
 * Komut tekrar çalıştırılabilir: taşınmış kayıt ikinci kez taşınmaz
 * (source_type=LEGACY_RECORD + source_id eşleşmesi).
 */
class MigrateAccountingRecords extends Command
{
    protected $signature = 'accounting:migrate-records
                            {--company= : Yalnız bu şirket (UUID)}
                            {--dry-run : Hiçbir şey yazma, ne olacağını göster}
                            {--limit=0 : En fazla bu kadar kayıt taşı}';

    protected $description = 'accounting_records tablosundaki kayıtları belge katmanına taslak olarak taşır';

    /** Eski tür → yeni belge türü. */
    private const TUR_ESLEMESI = [
        'invoice' => 'auto',          // tedarikçi doluysa alış, değilse satış
        'expense' => DocumentType::Expense->value,
        'other'   => DocumentType::Expense->value,
        // payment ve receipt belge değil tahsilat/ödeme; Faz 6'ya bırakılıyor.
    ];

    public function handle(AuditService $audit): int
    {
        $kuru   = (bool) $this->option('dry-run');
        $limit  = (int) $this->option('limit');

        $sirketler = Company::query()
            ->when($this->option('company'), fn ($q) => $q->whereKey($this->option('company')))
            ->get();

        if ($sirketler->isEmpty()) {
            $this->error('Şirket bulunamadı.');
            return self::FAILURE;
        }

        $toplam = ['tasinan' => 0, 'atlanan' => 0, 'hatali' => 0];

        foreach ($sirketler as $sirket) {
            $this->line("\n<info>{$sirket->name}</info> ({$sirket->country_code})");

            $tasinmis = Document::where('company_id', $sirket->id)
                ->where('source_type', 'LEGACY_RECORD')
                ->pluck('source_id')
                ->flip();

            $kayitlar = AccountingRecord::where('company_id', $sirket->id)
                ->when($limit > 0, fn ($q) => $q->limit($limit))
                ->orderBy('created_at')
                ->get();

            if ($kayitlar->isEmpty()) {
                $this->line('  taşınacak kayıt yok');
                continue;
            }

            $sayac = ['tasinan' => 0, 'atlanan' => 0, 'hatali' => 0];

            foreach ($kayitlar as $kayit) {
                if ($tasinmis->has($kayit->id)) {
                    $sayac['atlanan']++;
                    continue;
                }

                $tur = $this->belgeTuru($kayit);

                if ($tur === null) {
                    $sayac['atlanan']++;
                    continue;
                }

                try {
                    if (! $kuru) {
                        DB::transaction(fn () => $this->tasi($sirket, $kayit, $tur));
                    }
                    $sayac['tasinan']++;
                } catch (\Throwable $e) {
                    $sayac['hatali']++;
                    $this->warn("  {$kayit->record_number}: " . mb_substr($e->getMessage(), 0, 120));
                }
            }

            $this->line(sprintf('  taşınan %d, atlanan %d, hatalı %d',
                $sayac['tasinan'], $sayac['atlanan'], $sayac['hatali']));

            if (! $kuru && $sayac['tasinan'] > 0) {
                $audit->log(
                    companyId: $sirket->id, action: 'document.legacy_migrated',
                    entityType: 'Document', payload: $sayac,
                );
            }

            foreach ($sayac as $k => $v) {
                $toplam[$k] += $v;
            }
        }

        $this->newLine();
        $this->info(sprintf('%s Toplam: taşınan %d, atlanan %d, hatalı %d',
            $kuru ? '[KURU ÇALIŞMA]' : '', $toplam['tasinan'], $toplam['atlanan'], $toplam['hatali']));

        if ($kuru) {
            $this->comment('Hiçbir şey yazılmadı. Gerçek taşıma için --dry-run olmadan çalıştırın.');
        } else {
            $this->comment('Belgeler TASLAK olarak oluşturuldu; deftere işlenmedi. Gözden geçirip post edin.');
        }

        return self::SUCCESS;
    }

    /** Eski kaydın hangi belge türüne karşılık geldiği. */
    private function belgeTuru(AccountingRecord $kayit): ?string
    {
        $tip = $kayit->type instanceof \BackedEnum ? $kayit->type->value : (string) $kayit->type;

        $hedef = self::TUR_ESLEMESI[$tip] ?? null;

        if ($hedef === null) {
            return null;
        }

        if ($hedef !== 'auto') {
            return $hedef;
        }

        // Tedarikçi adı varsa alış faturası; yoksa satış.
        return filled($kayit->vendor)
            ? DocumentType::PurchaseInvoice->value
            : DocumentType::SalesInvoice->value;
    }

    /**
     * Tek kaydı belgeye çevirir.
     *
     * DocumentService kullanmıyoruz: o servis vergiyi yeniden hesaplar ve
     * onaylı vergi kodu ister. Geçmiş kayıtta tutar zaten kesinleşmiş; olduğu
     * gibi taşınmalı, yeniden hesaplanmamalı.
     */
    private function tasi(Company $sirket, AccountingRecord $kayit, string $tur): void
    {
        $turEnum = DocumentType::from($tur);

        $brut = (float) $kayit->amount;
        $kdv  = (float) ($kayit->vat_amount ?? 0);
        $oran = (float) ($kayit->vat_rate ?? 0);

        // Eski kayıtta KDV tutarı boşsa orandan türet; dahil/hariç bilgisi var.
        if ($kdv == 0.0 && $oran > 0) {
            $kdv = $kayit->vat_included
                ? round($brut - $brut / (1 + $oran / 100), 2)
                : round($brut * $oran / 100, 2);
        }

        $net = $kayit->vat_included || $kdv == 0.0
            ? round($brut - $kdv, 2)
            : round($brut, 2);

        $toplam = round($net + $kdv, 2);

        $vergiKodu = $oran > 0
            ? TaxCode::where('company_id', $sirket->id)
                ->where('rate', $oran)
                ->effectiveOn(($kayit->transaction_date ?? $kayit->created_at)->toDateString())
                ->value('id')
            : null;

        $belge = Document::create([
            'company_id'   => $sirket->id,
            'doc_type'     => $tur,
            'number'       => null,                    // taslak; kesilince numara alır
            'issue_date'   => ($kayit->transaction_date ?? $kayit->created_at)->toDateString(),
            'due_date'     => $kayit->due_date?->toDateString(),
            'partner_name' => $kayit->vendor,
            'currency'     => $kayit->currency ?: $sirket->functionalCurrency(),
            'exchange_rate'=> (float) ($kayit->exchange_rate ?: 1),
            'net_amount'   => $net,
            'tax_amount'   => $kdv,
            'gross_amount' => $toplam,
            'net_amount_fc'   => round($net * (float) ($kayit->exchange_rate ?: 1), 2),
            'tax_amount_fc'   => round($kdv * (float) ($kayit->exchange_rate ?: 1), 2),
            'gross_amount_fc' => round($toplam * (float) ($kayit->exchange_rate ?: 1), 2),
            'status'       => 'draft',
            'source_type'  => 'LEGACY_RECORD',
            'source_id'    => $kayit->id,
            'reference'    => $kayit->reference_number ?: $kayit->record_number,
            'notes'        => trim(($kayit->title ?? '') . "\n" . ($kayit->description ?? '')),
            'created_by'   => $kayit->created_by,
            'meta'         => [
                'legacy_record_number' => $kayit->record_number,
                'legacy_type'          => $kayit->type instanceof \BackedEnum ? $kayit->type->value : $kayit->type,
                'legacy_status'        => $kayit->status instanceof \BackedEnum ? $kayit->status->value : $kayit->status,
                'legacy_category'      => $kayit->category,
                'legacy_payment_method'=> $kayit->payment_method,
                'legacy_paid_at'       => $kayit->paid_at?->toDateString(),
            ],
        ]);

        $belge->lines()->create([
            'company_id'  => $sirket->id,
            'line_no'     => 1,
            'description' => mb_substr($kayit->title ?: ($turEnum->label()), 0, 255),
            'quantity'    => 1,
            'unit_price'  => $net,
            'net_amount'  => $net,
            'tax_code_id' => $vergiKodu,
            'tax_rate'    => $oran,
            'tax_amount'  => $kdv,
            'gross_amount'=> $toplam,
        ]);
    }
}
