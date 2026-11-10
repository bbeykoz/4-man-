<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\InventoryEventType;
use App\Models\Accounting\AccountingPeriod;
use App\Models\Accounting\InventoryAccountingEvent;
use App\Models\Company;
use App\Support\AccountRole;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Depo olaylarını fişe çevirip deftere işler.
 *
 * Kuyruk tüketicisi. Her olay tek transaction içinde işlenir; fiş yazılamazsa
 * olay "failed" ya da "exception" olur ama kuyruktan düşmez.
 *
 * Muhasebe karşılıkları (doküman §9):
 *  - Mal kabul: stok borç / faturası gelmemiş mal kabulü alacak.
 *    Fatura geldiğinde alış belgesi ara hesabı kapatır.
 *  - Mal çıkışı: satılan malın maliyeti borç / stok alacak.
 *    Gelir ayrı: satış belgesinden gelir.
 *  - Fire, sayım farkı, düzeltme: fark hesabı ile stok arasında.
 *  - Transfer: kayıt üretmez, aynı tüzel kişilikte değer değişmiyor.
 */
class InventoryPostingService
{
    public function __construct(
        private readonly AccountRoleService $roles,
        private readonly JournalService $journal,
        private readonly AuditService $audit,
    ) {}

    /**
     * Bekleyen olayları işler.
     *
     * @param  int  $limit  Tek seferde işlenecek olay sayısı.
     * @return array{processed: int, skipped: int, exception: int, failed: int}
     */
    public function processPending(?Company $company = null, int $limit = 100): array
    {
        $olaylar = InventoryAccountingEvent::query()
            ->pending()
            ->when($company, fn ($q) => $q->where('company_id', $company->id))
            ->orderBy('accounting_date')
            ->orderBy('created_at')
            ->limit($limit)
            ->get();

        $sayac = ['processed' => 0, 'skipped' => 0, 'exception' => 0, 'failed' => 0];

        foreach ($olaylar as $olay) {
            $sonuc = $this->processOne($olay);
            $sayac[$sonuc] = ($sayac[$sonuc] ?? 0) + 1;
        }

        return $sayac;
    }

    /**
     * Tek olayı işler.
     *
     * @return string processed | skipped | exception | failed
     */
    public function processOne(InventoryAccountingEvent $olay): string
    {
        if ($olay->isProcessed()) {
            return $olay->status;
        }

        $tur = $olay->event_type;

        // Muhasebe etkisi olmayan olaylar atlanıyor ama kayıtta kalıyor;
        // "neden bu depo hareketinin fişi yok" sorusunun cevabı burada.
        if (! $tur->createsJournalEntry()) {
            $olay->forceFill([
                'status'       => 'skipped',
                'skip_reason'  => $tur->skipReason(),
                'processed_at' => now(),
            ])->save();

            return 'skipped';
        }

        $company = Company::find($olay->company_id);

        if (! $company) {
            return $this->fail($olay, 'Şirket bulunamadı.');
        }

        // Net değeri sıfır olan olay fiş üretmez; iki ayrı sebebi olabilir ve
        // ikisini karıştırmak denetimde yanıltıcı olur.
        if (abs($olay->totalValue()) < 0.01) {
            $olay->forceFill([
                'status'       => 'skipped',
                'skip_reason'  => $this->zeroValueReason($olay),
                'processed_at' => now(),
            ])->save();

            return 'skipped';
        }

        // Kapalı döneme geçmiş tarihli hareket otomatik yazılmaz.
        $donem = AccountingPeriod::where('company_id', $company->id)
            ->covering($olay->accounting_date->toDateString())
            ->first();

        if (! $donem) {
            return $this->except($olay, "{$olay->accounting_date->format('d.m.Y')} tarihini kapsayan muhasebe dönemi tanımlı değil.");
        }

        if (! $donem->accepts($tur->journalType())) {
            return $this->except($olay, "{$donem->name} dönemi {$donem->status->label()}; stok fişi kabul etmiyor. Dönemi açın ya da olayı farklı tarihe taşıyın.");
        }

        try {
            return DB::transaction(function () use ($olay, $company, $tur) {
                $satirlar = $this->buildLines($company, $olay, $tur);

                if ($satirlar === []) {
                    $olay->forceFill([
                        'status'       => 'skipped',
                        'skip_reason'  => 'Olayda muhasebeye yansıyan satır yok.',
                        'processed_at' => now(),
                    ])->save();

                    return 'skipped';
                }

                $fis = $this->journal->createDraft($company, [
                    'journal_type' => $tur->journalType()->value,
                    'document_date'=> $olay->accounting_date->toDateString(),
                    'posting_date' => $olay->accounting_date->toDateString(),
                    'description'  => $this->description($olay, $tur),
                    'reference'    => $olay->source_number,
                    'source_type'  => 'INVENTORY_EVENT',
                    'source_id'    => $olay->id,
                    'memo'         => "Depo kaydı {$olay->source_number} otomatik muhasebeleştirildi.",
                ], $satirlar);

                $fis = $fis->fresh();
                $fis->load('lines.account');
                $fis->forceFill([
                    'status'       => 'approved',
                    'approved_at'  => now(),
                    'content_hash' => $fis->computeContentHash(),
                ])->save();

                $fis = $this->journal->post($fis->fresh());

                $olay->forceFill([
                    'status'           => 'processed',
                    'journal_entry_id' => $fis->id,
                    'processed_at'     => now(),
                    'attempts'         => $olay->attempts + 1,
                    'last_error'       => null,
                ])->save();

                $this->audit->log(
                    companyId: $company->id,
                    action:    'inventory.event_posted',
                    entityType:'InventoryAccountingEvent',
                    entityId:  $olay->id,
                    payload:   [
                        'event_type'    => $tur->value,
                        'record_number' => $olay->source_number,
                        'journal_no'    => $fis->journal_no,
                        'value'         => $olay->totalValue(),
                    ],
                );

                return 'processed';
            });
        } catch (ValidationException $e) {
            return $this->except($olay, collect($e->errors())->flatten()->implode(' '));
        } catch (\Throwable $e) {
            return $this->fail($olay, $e->getMessage());
        }
    }

    /**
     * Olaya göre fiş satırları.
     *
     * Her satır bir depo hareketine karşılık geliyor ve depo kimliği analitik
     * boyut olarak taşınıyor; böylece mizandan depo kırılımına inilebiliyor.
     */
    private function buildLines(Company $company, InventoryAccountingEvent $olay, InventoryEventType $tur): array
    {
        $stokHesabi = $this->roles->accountId($company, AccountRole::INVENTORY);
        $karsiHesap = $this->counterAccount($company, $tur);

        $satirlar = [];
        $toplam   = 0.0;

        foreach ($olay->payload['lines'] ?? [] as $s) {
            $deger = round((float) ($s['value'] ?? 0), 2);

            if (abs($deger) < 0.01) {
                continue;
            }

            $boyutlar = array_filter([
                'warehouse'  => $s['warehouse_id'] ?? null,
                'product'    => $s['product_id'] ?? null,
                'lot'        => $s['lot_number'] ?? null,
            ]);

            // Değer pozitifse stok artıyor (borç), negatifse azalıyor (alacak).
            $satirlar[] = [
                'account_id'  => $stokHesabi,
                'description' => $this->lineDescription($olay, $s),
                'debit'       => $deger > 0 ? $deger : 0.0,
                'credit'      => $deger < 0 ? abs($deger) : 0.0,
                'dimensions'  => $boyutlar,
            ];

            $toplam += $deger;
        }

        if ($satirlar === []) {
            return [];
        }

        // Karşı taraf tek satır: stok hareketinin toplam değeri kadar.
        $toplam = round($toplam, 2);

        $satirlar[] = [
            'account_id'  => $karsiHesap,
            'description' => $tur->label() . ' karşılığı',
            'debit'       => $toplam < 0 ? abs($toplam) : 0.0,
            'credit'      => $toplam > 0 ? $toplam : 0.0,
        ];

        return $satirlar;
    }

    /**
     * Stok hareketinin karşı hesabı.
     *
     * Mal kabulde fatura henüz gelmemiş olabilir; bu yüzden tedarikçi değil
     * "faturası gelmemiş mal kabulü" ara hesabı kullanılıyor. Alış faturası
     * kesildiğinde o hesap kapanır.
     */
    private function counterAccount(Company $company, InventoryEventType $tur): string
    {
        return match ($tur) {
            InventoryEventType::GoodsReceived,
            InventoryEventType::PurchaseReturn   => $this->roles->accountId($company, AccountRole::GRNI),

            InventoryEventType::GoodsIssued,
            InventoryEventType::SalesReturn      => $this->roles->accountId($company, AccountRole::COGS),

            InventoryEventType::Damage,
            InventoryEventType::CountVariance,
            InventoryEventType::Adjustment       => $this->roles->accountId($company, AccountRole::INVENTORY_VARIANCE),

            InventoryEventType::OpeningBalance   => $this->roles->accountId($company, AccountRole::RETAINED_EARNINGS),

            // Ters kayıtta karşı hesap orijinal olaydan gelmeli; bulunamazsa
            // fark hesabına düşüyor ve denetimde görünür kalıyor.
            InventoryEventType::Reversal         => $this->reversalCounterAccount($company),

            default => $this->roles->accountId($company, AccountRole::INVENTORY_VARIANCE),
        };
    }

    private function reversalCounterAccount(Company $company): string
    {
        return $this->roles->accountId($company, AccountRole::INVENTORY_VARIANCE);
    }

    private function description(InventoryAccountingEvent $olay, InventoryEventType $tur): string
    {
        $urun = $olay->payload['product_name'] ?? null;

        return trim(sprintf('%s — %s%s',
            $tur->label(),
            $olay->source_number ?: 'depo kaydı',
            $urun ? " ($urun)" : '',
        ));
    }

    private function lineDescription(InventoryAccountingEvent $olay, array $satir): string
    {
        $parcalar = array_filter([
            $olay->payload['product_name'] ?? null,
            isset($satir['quantity']) ? rtrim(rtrim(number_format((float) $satir['quantity'], 3, ',', '.'), '0'), ',') . ' birim' : null,
            $satir['lot_number'] ?? null ? "lot {$satir['lot_number']}" : null,
        ]);

        return mb_substr(implode(' · ', $parcalar) ?: 'Stok hareketi', 0, 255);
    }

    /**
     * Net değeri sıfır olan olayın gerçek sebebi.
     *
     * Fire gibi hareketler stoğu kovalar arasında taşıyor (available →
     * damaged): mal hâlâ şirketin, toplam stok değeri değişmiyor, bu yüzden
     * fiş gerekmiyor. Hasarlı malı değerden düşürmek ayrı bir karardır ve
     * düzeltme kaydıyla yapılır — otomatik yapmıyoruz çünkü net
     * gerçekleşebilir değeri sistem bilmiyor.
     *
     * Maliyeti sıfır olan ürün ise bambaşka bir durum: birim maliyet
     * girilmemiş, veri eksik.
     */
    private function zeroValueReason(InventoryAccountingEvent $olay): string
    {
        $satirlar = $olay->payload['lines'] ?? [];

        if ($satirlar === []) {
            return 'Olayda stok hareketi yok.';
        }

        $maliyetsiz = collect($satirlar)->every(fn (array $s) => abs((float) ($s['unit_cost'] ?? 0)) < 0.000001);

        if ($maliyetsiz) {
            return 'Hareketin maliyet değeri sıfır; ürün birim maliyeti girilmemiş olabilir.';
        }

        $kovalar = collect($satirlar)->pluck('bucket')->unique()->values()->all();

        if (count($kovalar) > 1) {
            return sprintf(
                'Stok kovalar arasında taşındı (%s); mal şirkette kaldığı için toplam stok değeri değişmiyor. '
                . 'Değer düşüklüğü yazmak için düzeltme kaydı oluşturun.',
                implode(' → ', $kovalar),
            );
        }

        return 'Hareketin net değeri sıfır; borç ve alacak birbirini götürüyor.';
    }

    /** Dönem kapalı ya da yapılandırma eksik: insan kararı bekler. */
    private function except(InventoryAccountingEvent $olay, string $mesaj): string
    {
        $olay->forceFill([
            'status'     => 'exception',
            'last_error' => mb_substr($mesaj, 0, 1000),
            'attempts'   => $olay->attempts + 1,
        ])->save();

        return 'exception';
    }

    /** Teknik hata: yeniden denenebilir. */
    private function fail(InventoryAccountingEvent $olay, string $mesaj): string
    {
        $olay->forceFill([
            'status'     => 'failed',
            'last_error' => mb_substr($mesaj, 0, 1000),
            'attempts'   => $olay->attempts + 1,
        ])->save();

        return 'failed';
    }

    /** İstisnadaki olayı yeniden kuyruğa alır; dönem açıldıktan sonra kullanılır. */
    public function retry(InventoryAccountingEvent $olay, ?string $yeniTarih = null): string
    {
        if ($olay->isProcessed()) {
            throw ValidationException::withMessages(['event' => 'Bu olay zaten işlenmiş.']);
        }

        $olay->forceFill([
            'status'          => 'pending',
            'accounting_date' => $yeniTarih ?: $olay->accounting_date->toDateString(),
            'resolved_by'     => auth()->id(),
        ])->save();

        return $this->processOne($olay->fresh());
    }
}
