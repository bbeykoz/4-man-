<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\DocumentStatus;
use App\Enums\Accounting\DocumentType;
use App\Models\Accounting\Document;
use App\Models\Accounting\DocumentSeries;
use App\Models\Accounting\JournalEntry;
use App\Models\Company;
use App\Support\AppTime;
use App\Support\CountryPack;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Belge yaşam döngüsü: taslak, kesme (numara atama), deftere işleme, iptal,
 * iade/düzeltme belgesi.
 *
 * Numara kesme anında atanır. Taslağa numara vermek, iptal edilen taslaklar
 * yüzünden numara atlamasına yol açar; mevzuat atlamasız sıra istiyor.
 */
class DocumentService
{
    public function __construct(
        private readonly TaxEngine $tax,
        private readonly SequenceService $sequences,
        private readonly DocumentPostingService $posting,
        private readonly JournalService $journal,
        private readonly AccountRoleService $roles,
        private readonly AuditService $audit,
    ) {}

    // ─── Oluşturma ──────────────────────────────────────────────────

    public function createDraft(Company $company, array $data, array $lines): Document
    {
        $tur = DocumentType::from($data['doc_type']);

        if ($eksik = $this->roles->missingRequired($company)) {
            throw ValidationException::withMessages([
                'account_role' => 'Belge kesmeden önce şu hesap rolleri eşlenmeli: '
                    . implode(', ', array_map(fn ($r) => \App\Support\AccountRole::label($r), $eksik)),
            ]);
        }

        return DB::transaction(function () use ($company, $data, $lines, $tur) {
            $belge = Document::create($this->header($company, $tur, $data) + [
                'status'     => DocumentStatus::Draft->value,
                'created_by' => auth()->id(),
            ]);

            $this->replaceLines($belge, $lines);
            $this->audit->logModel($belge, 'document.created', ['type' => $tur->value, 'lines' => count($lines)]);

            return $belge->fresh('lines');
        });
    }

    public function updateDraft(Document $belge, array $data, ?array $lines = null): Document
    {
        if (! $belge->isEditable()) {
            throw ValidationException::withMessages([
                'status' => "{$belge->status->label()} durumundaki belge düzenlenemez.",
            ]);
        }

        return DB::transaction(function () use ($belge, $data, $lines) {
            $belge->update(array_filter(
                $this->header($belge->company, $belge->doc_type, $data, kismi: true),
                fn ($v) => $v !== null,
            ));

            if ($lines !== null) {
                $this->replaceLines($belge->fresh(), $lines);
            }

            $this->audit->logModel($belge, 'document.updated');

            return $belge->fresh('lines');
        });
    }

    // ─── Kesme ──────────────────────────────────────────────────────

    /**
     * Belgeyi keser: numarayı atar ve durumu "kesildi" yapar.
     *
     * Numara atandıktan sonra belge silinemez; iptal edilse bile numara
     * kayıtta kalır, böylece sıra atlamaz.
     */
    public function issue(Document $belge, ?string $seriId = null): Document
    {
        if ($belge->status !== DocumentStatus::Draft) {
            throw ValidationException::withMessages([
                'status' => "{$belge->status->label()} durumundaki belge yeniden kesilemez.",
            ]);
        }

        $this->assertValid($belge);

        return DB::transaction(function () use ($belge, $seriId) {
            $seri = $this->resolveSeries($belge, $seriId);

            if (! $seri->allowsUser(auth()->id())) {
                throw ValidationException::withMessages([
                    'series_id' => "{$seri->name} serisinden belge kesme yetkiniz yok.",
                ]);
            }

            // Yıllık sıfırlanmayan seride sayaç yılı sabit tutulur; böylece
            // sıra yıldan yıla devam eder.
            $yil = $seri->reset_yearly ? (int) $belge->issue_date->format('Y') : 0;

            $numara = $this->sequences->next(
                companyId: $belge->company_id,
                key:       $seri->sequenceKey(),
                prefix:    $seri->numberPrefix(),
                year:      $yil,
                padding:   $seri->padding,
            );

            $belge->forceFill([
                'series_id' => $seri->id,
                'number'    => $numara,
                'status'    => DocumentStatus::Issued->value,
            ])->save();

            $this->audit->logModel($belge, 'document.issued', ['number' => $numara, 'series' => $seri->code]);

            return $belge->fresh('lines');
        });
    }

    /**
     * Belgeyi deftere işler: fiş üretir, post eder, iki kaydı bağlar.
     *
     * Fiş ve belge aynı transaction'da yazılır; biri başarısız olursa diğeri
     * de geri alınır, yetim fiş kalmaz.
     */
    public function post(Document $belge, ?string $postingDate = null): Document
    {
        if (! in_array($belge->status, [DocumentStatus::Issued, DocumentStatus::Draft], true)) {
            throw ValidationException::withMessages([
                'status' => "{$belge->status->label()} durumundaki belge deftere işlenemez.",
            ]);
        }

        if (! $belge->doc_type->createsJournalEntry()) {
            throw ValidationException::withMessages([
                'doc_type' => "{$belge->doc_type->label()} muhasebe kaydı üretmez.",
            ]);
        }

        return DB::transaction(function () use ($belge, $postingDate) {
            // Henüz kesilmemişse önce kes: numarasız belge deftere girmemeli.
            if ($belge->status === DocumentStatus::Draft) {
                $belge = $this->issue($belge);
            }

            $belge->load(['lines.taxCode', 'company']);

            $satirlar = $this->posting->buildLines($belge);

            $fis = $this->journal->createDraft($belge->company, [
                'journal_type'  => $belge->doc_type->journalType()->value,
                'document_date' => $belge->issue_date->toDateString(),
                // Deftere giriş tarihi vergiyi doğuran olayın tarihidir, belge
                // tarihi değil. Aksi halde vergi tarihi farklı olan bir belge
                // KDV defterinde bir aya, muhasebe hesabında başka aya düşer
                // ve beyan mutabakatı tutmaz.
                'posting_date'  => $postingDate ?: $belge->taxPointDate(),
                'description'   => "{$belge->doc_type->label()} {$belge->number}" .
                                   ($belge->partner_name ? " — {$belge->partner_name}" : ''),
                'reference'     => $belge->number,
                'source_type'   => 'DOCUMENT',
                'source_id'     => $belge->id,
            ], $satirlar);

            // Belge zaten onaylı bir ticari kayıt; fişi ayrıca onaya sokmuyoruz.
            // İnsan onayı belgenin kesilmesi aşamasında verilmiş oluyor.
            $fis = $fis->fresh();
            $fis->load('lines.account');
            $fis->forceFill([
                'document_id'  => $belge->id,
                'status'       => 'approved',
                'approved_by'  => auth()->id(),
                'approved_at'  => now(),
                'content_hash' => $fis->computeContentHash(),
            ])->save();

            $fis = $this->journal->post($fis->fresh());

            $belge->forceFill([
                'status'           => DocumentStatus::Posted->value,
                'journal_entry_id' => $fis->id,
                'posted_at'        => now(),
                'posted_by'        => auth()->id(),
            ])->save();

            $this->audit->logModel($belge, 'document.posted', [
                'number'     => $belge->number,
                'journal_no' => $fis->journal_no,
                'gross'      => (string) $belge->gross_amount,
            ]);

            return $belge->fresh(['lines', 'journalEntry']);
        });
    }

    /**
     * İptal.
     *
     * Deftere işlenmemiş belge doğrudan iptal edilir; numarası kullanılmış
     * sayılır ve yeniden verilmez. Deftere işlenmişse iade belgesi gerekir.
     */
    public function cancel(Document $belge, string $gerekce): Document
    {
        if ($belge->status->affectsLedger()) {
            throw ValidationException::withMessages([
                'status' => "Deftere işlenmiş belge iptal edilemez ({$belge->number}). İade belgesi düzenleyin.",
            ]);
        }

        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'İptal gerekçesi zorunludur.']);
        }

        $belge->update([
            'status'            => DocumentStatus::Cancelled->value,
            'correction_reason' => $gerekce,
        ]);

        $this->audit->logModel($belge, 'document.cancelled', ['number' => $belge->number], $gerekce);

        return $belge->fresh();
    }

    /**
     * İade / düzeltme belgesi üretir.
     *
     * Orijinal belge silinmez. Satırlar kopyalanır, tutarlar istenirse kısmi
     * verilir ve iki belge çift yönlü bağlanır.
     *
     * @param  array|null  $satirlar  Kısmi iade için; null ise tamamı.
     */
    public function createCorrection(Document $orijinal, string $gerekce, ?array $satirlar = null, ?string $tarih = null): Document
    {
        if (! $orijinal->status->affectsLedger()) {
            throw ValidationException::withMessages([
                'document' => 'Yalnızca deftere işlenmiş belgeye iade düzenlenir. Taslak belgeyi iptal edin.',
            ]);
        }

        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'İade gerekçesi zorunludur.']);
        }

        $iadeTuru = match ($orijinal->doc_type) {
            DocumentType::SalesInvoice    => DocumentType::SalesCreditNote,
            DocumentType::PurchaseInvoice => DocumentType::PurchaseCreditNote,
            default => throw ValidationException::withMessages([
                'doc_type' => "{$orijinal->doc_type->label()} için iade belgesi tanımlı değil.",
            ]),
        };

        $kaynak = $satirlar ?? $orijinal->lines->map(fn ($s) => [
            'product_id'    => $s->product_id,
            'item_code'     => $s->item_code,
            'description'   => $s->description,
            'quantity'      => (float) $s->quantity,
            'unit'          => $s->unit,
            'unit_price'    => (float) $s->unit_price,
            'discount_rate' => (float) $s->discount_rate,
            'tax_code_id'   => $s->tax_code_id,
            'account_id'    => $s->account_id,
            'dimensions'    => $s->dimensions,
        ])->all();

        return DB::transaction(function () use ($orijinal, $iadeTuru, $kaynak, $gerekce, $tarih) {
            $iade = $this->createDraft($orijinal->company, [
                'doc_type'      => $iadeTuru->value,
                'issue_date'    => $tarih ?: AppTime::today()->toDateString(),
                'partner_id'    => $orijinal->partner_id,
                'partner_name'  => $orijinal->partner_name,
                'partner_vat_number' => $orijinal->partner_vat_number,
                'partner_registration_number' => $orijinal->partner_registration_number,
                'partner_address' => $orijinal->partner_address,
                'currency'      => $orijinal->currency,
                'exchange_rate' => (float) $orijinal->exchange_rate,
                'reference'     => $orijinal->number,
                'notes'         => $gerekce,
            ], $kaynak);

            $iade->forceFill([
                'corrects_document_id' => $orijinal->id,
                'correction_reason'    => $gerekce,
            ])->save();

            $this->audit->logModel($iade, 'document.correction_created', [
                'corrects' => $orijinal->number, 'type' => $iadeTuru->value,
            ], $gerekce);

            return $iade->fresh('lines');
        });
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /** Başlık alanları; kur ve para birimi şirkete göre tamamlanır. */
    private function header(Company $company, DocumentType $tur, array $data, bool $kismi = false): array
    {
        $paraBirimi = $data['currency'] ?? $company->functionalCurrency();
        $yabanci    = $paraBirimi !== $company->functionalCurrency();

        $alanlar = [
            'company_id'   => $company->id,
            'doc_type'     => $tur->value,
            'issue_date'   => $data['issue_date']  ?? AppTime::today()->toDateString(),
            'tax_date'     => $data['tax_date']    ?? null,
            'supply_date'  => $data['supply_date'] ?? null,
            'due_date'     => $data['due_date']    ?? null,
            'partner_id'   => $data['partner_id']  ?? null,
            'partner_name' => $data['partner_name'] ?? null,
            'partner_vat_number'          => $data['partner_vat_number'] ?? null,
            'partner_registration_number' => $data['partner_registration_number'] ?? null,
            'partner_address'             => $data['partner_address'] ?? null,
            'currency'      => $paraBirimi,
            'exchange_rate' => $yabanci ? ($data['exchange_rate'] ?? null) : 1,
            'exchange_rate_date'   => $data['exchange_rate_date'] ?? null,
            'exchange_rate_source' => $data['exchange_rate_source'] ?? null,
            'reference'     => $data['reference'] ?? null,
            'notes'         => $data['notes'] ?? null,
            'payment_terms' => $data['payment_terms'] ?? null,
            'source_type'   => $data['source_type'] ?? 'MANUAL',
            'source_id'     => $data['source_id'] ?? null,
            'meta'          => $data['meta'] ?? [],
        ];

        if ($kismi) {
            // Güncellemede yalnız gönderilen alanlar değişsin.
            return array_intersect_key($alanlar, $data) + ['exchange_rate' => $alanlar['exchange_rate']];
        }

        if ($yabanci && empty($alanlar['exchange_rate'])) {
            throw ValidationException::withMessages([
                'exchange_rate' => "Belge $paraBirimi cinsinden; defter para birimi {$company->functionalCurrency()}. Kur zorunlu.",
            ]);
        }

        return $alanlar;
    }

    /**
     * Satırları yeniden yazar ve vergiyi hesaplar.
     *
     * Vergi satır bazında hesaplanıp yuvarlanır; belge toplamı satırların
     * toplamıdır. Belge toplamından tek seferde hesaplamak satır toplamıyla
     * tutmayan bir vergi üretir.
     */
    private function replaceLines(Document $belge, array $satirlar): void
    {
        $belge->lines()->delete();

        $vergiTarihi = $belge->taxPointDate();
        $yon         = $belge->doc_type->direction();

        $net = $tax = $brut = $iskonto = $indirilemez = 0.0;
        $sira = 0;

        foreach ($satirlar as $girdi) {
            $sira++;

            $miktar = (float) ($girdi['quantity'] ?? 1);
            $fiyat  = (float) ($girdi['unit_price'] ?? 0);
            $tutar  = round($miktar * $fiyat, 2);

            $iskontoOrani  = (float) ($girdi['discount_rate'] ?? 0);
            $iskontoTutari = isset($girdi['discount_amount'])
                ? (float) $girdi['discount_amount']
                : round($tutar * $iskontoOrani / 100, 2);

            $satirNet = round($tutar - $iskontoTutari, 2);

            $vergiKodu   = null;
            $satirVergi  = 0.0;
            $satirOran   = 0.0;
            $satirIndirilemez = 0.0;

            if (! empty($girdi['tax_code_id']) || ! empty($girdi['tax_code'])) {
                $vergiKodu = ! empty($girdi['tax_code_id'])
                    ? \App\Models\Accounting\TaxCode::where('company_id', $belge->company_id)->findOrFail($girdi['tax_code_id'])
                    : $this->tax->resolve($belge->company, $vergiTarihi, $girdi['tax_code'], null, $yon);

                if (! $vergiKodu->isEffectiveOn($vergiTarihi)) {
                    throw ValidationException::withMessages([
                        "lines.$sira" => "Satır $sira: {$vergiKodu->code} vergi kodu $vergiTarihi tarihinde geçerli değil.",
                    ]);
                }

                $hesap = $this->tax->calculate($vergiKodu, $satirNet, (bool) ($girdi['tax_included'] ?? false));

                // KDV dahil girildiyse net tutar da değişir.
                $satirNet         = $hesap['base'];
                $satirVergi       = $hesap['tax'];
                $satirOran        = $hesap['rate'];
                $satirIndirilemez = $hesap['non_deductible'];
            }

            $belge->lines()->create([
                'company_id'            => $belge->company_id,
                'line_no'               => $girdi['line_no'] ?? $sira,
                'product_id'            => $girdi['product_id'] ?? null,
                'item_code'             => $girdi['item_code'] ?? null,
                'description'           => $girdi['description'] ?? 'Kalem',
                'quantity'              => $miktar,
                'unit'                  => $girdi['unit'] ?? null,
                'unit_price'            => $fiyat,
                'discount_rate'         => $iskontoOrani,
                'discount_amount'       => $iskontoTutari,
                'net_amount'            => $satirNet,
                'tax_code_id'           => $vergiKodu?->id,
                'tax_rate'              => $satirOran,
                'tax_amount'            => $satirVergi,
                'non_deductible_amount' => $satirIndirilemez,
                'gross_amount'          => round($satirNet + $satirVergi, 2),
                'account_id'            => $girdi['account_id'] ?? null,
                'dimensions'            => $girdi['dimensions'] ?? [],
            ]);

            $net         += $satirNet;
            $tax         += $satirVergi;
            $brut        += $satirNet + $satirVergi;
            $iskonto     += $iskontoTutari;
            $indirilemez += $satirIndirilemez;
        }

        $kur = (float) $belge->exchange_rate;

        $belge->forceFill([
            'net_amount'      => round($net, 2),
            'tax_amount'      => round($tax, 2),
            'gross_amount'    => round($brut, 2),
            'discount_amount' => round($iskonto, 2),
            'net_amount_fc'   => round($net * $kur, 2),
            'tax_amount_fc'   => round($tax * $kur, 2),
            'gross_amount_fc' => round($brut * $kur, 2),
        ])->save();

        unset($indirilemez);
    }

    /** Kesmeden önceki zorunlu alan ve iş kuralı kontrolleri. */
    private function assertValid(Document $belge): void
    {
        $hatalar = [];

        if ($belge->lines()->count() === 0) {
            $hatalar['lines'] = 'Belge en az bir satır içermelidir.';
        }

        if ((float) $belge->gross_amount == 0.0 && ! $belge->doc_type->isCorrection()) {
            $hatalar['gross_amount'] = 'Belge toplamı sıfır olamaz.';
        }

        // Vergi belgelerinde karşı taraf kimliği zorunlu.
        if ($belge->doc_type->isTaxDocument() && blank($belge->partner_name)) {
            $hatalar['partner_name'] = 'Vergi belgesinde karşı tarafın unvanı zorunludur.';
        }

        if ($belge->doc_type->isCorrection() && ! $belge->corrects_document_id) {
            $hatalar['corrects_document_id'] = 'Düzeltme belgesi bir orijinal belgeye bağlanmalıdır.';
        }

        // Fatura düzenleme süresi: Bulgaristan'da vergiyi doğuran olaydan
        // itibaren 5 gün (ЗДДС md. 113). Engellemiyoruz, uyarıyoruz —
        // geç fatura geçersiz değil, cezalı.
        if ($belge->supply_date && $belge->doc_type->isTaxDocument()) {
            $sinir = (int) CountryPack::setting($belge->company->country_code, 'invoice_deadline_days', 0);

            if ($sinir > 0) {
                $gecen = Carbon::parse($belge->supply_date)->diffInDays(Carbon::parse($belge->issue_date), false);

                if ($gecen > $sinir) {
                    $this->audit->logModel($belge, 'document.late_invoice', [
                        'supply_date' => $belge->supply_date->toDateString(),
                        'issue_date'  => $belge->issue_date->toDateString(),
                        'days'        => $gecen,
                        'limit'       => $sinir,
                    ]);
                }
            }
        }

        if ($hatalar) {
            throw ValidationException::withMessages($hatalar);
        }
    }

    /** Belgenin serisini bulur; verilmezse türün varsayılanı. */
    private function resolveSeries(Document $belge, ?string $seriId): DocumentSeries
    {
        if ($seriId) {
            return DocumentSeries::where('company_id', $belge->company_id)->findOrFail($seriId);
        }

        if ($belge->series_id) {
            return DocumentSeries::findOrFail($belge->series_id);
        }

        $seri = DocumentSeries::where('company_id', $belge->company_id)
            ->forType($belge->doc_type->value)
            ->active()
            ->orderByDesc('is_default')
            ->first();

        if (! $seri) {
            throw ValidationException::withMessages([
                'series_id' => "{$belge->doc_type->label()} için tanımlı numara serisi yok.",
            ]);
        }

        return $seri;
    }
}
