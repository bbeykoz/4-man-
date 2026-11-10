<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\JournalStatus;
use App\Enums\Accounting\JournalType;
use App\Models\Accounting\AccountingPeriod;
use App\Models\Accounting\JournalEntry;
use App\Models\Company;
use App\Support\AppTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Fiş yaşam döngüsü: oluştur, doğrula, onaya gönder, onayla, deftere işle,
 * ters kayıt.
 *
 * Post işlemi tek transaction'da yapılır: numara, başlık, satırlar, dönem
 * bağlantısı ve denetim kaydı birlikte yazılır. Herhangi biri başarısız
 * olursa numara da dahil her şey geri alınır.
 */
class JournalService
{
    public function __construct(
        private readonly JournalValidator $validator,
        private readonly SequenceService $sequences,
        private readonly AuditService $audit,
    ) {}

    // ─── Oluşturma ve düzenleme ─────────────────────────────────────

    /**
     * Taslak fiş oluşturur.
     *
     * @param  array  $data   Başlık alanları.
     * @param  array  $lines  Satırlar; line_no verilmezse sırayla atanır.
     */
    public function createDraft(Company $company, array $data, array $lines): JournalEntry
    {
        return DB::transaction(function () use ($company, $data, $lines) {
            $postingDate = $data['posting_date'] ?? $data['document_date'] ?? AppTime::today()->toDateString();

            $fis = JournalEntry::create([
                'company_id'    => $company->id,
                'journal_type'  => $data['journal_type'] ?? JournalType::General->value,
                'document_date' => $data['document_date'] ?? $postingDate,
                'posting_date'  => $postingDate,
                'period_id'     => $this->resolvePeriod($company->id, $postingDate)?->id,
                'currency'      => $company->functionalCurrency(),
                'source_type'   => $data['source_type'] ?? 'MANUAL',
                'source_id'     => $data['source_id'] ?? null,
                'status'        => JournalStatus::Draft->value,
                'description'   => $data['description'],
                'reference'     => $data['reference'] ?? null,
                'memo'          => $data['memo'] ?? null,
                'created_by'    => auth()->id(),
                'meta'          => $data['meta'] ?? [],
            ]);

            $this->replaceLines($fis, $lines);
            $this->audit->logModel($fis, 'journal.created', ['lines' => count($lines)]);

            return $fis->fresh('lines');
        });
    }

    /** Taslak başlık ve satırlarını değiştirir. Posted fişte çalışmaz. */
    public function updateDraft(JournalEntry $fis, array $data, ?array $lines = null): JournalEntry
    {
        $this->assertEditable($fis);

        return DB::transaction(function () use ($fis, $data, $lines) {
            $oncekiHash = $fis->computeContentHash();

            $postingDate = $data['posting_date'] ?? $fis->posting_date->toDateString();

            $fis->update(array_filter([
                'journal_type'  => $data['journal_type']  ?? null,
                'document_date' => $data['document_date'] ?? null,
                'posting_date'  => $data['posting_date']  ?? null,
                'description'   => $data['description']   ?? null,
                'reference'     => $data['reference']     ?? null,
                'memo'          => $data['memo']          ?? null,
            ], fn ($v) => $v !== null) + [
                'period_id' => $this->resolvePeriod($fis->company_id, $postingDate)?->id,
                // Satır değişince önceki onay geçersizdir.
                'status'    => JournalStatus::Draft->value,
            ]);

            if ($lines !== null) {
                $this->replaceLines($fis, $lines);
            }

            $fis->refresh()->load('lines');
            $this->audit->logModel($fis, 'journal.updated', [], null);
            $this->audit->log(
                companyId: $fis->company_id, action: 'journal.content_changed',
                entityType: 'JournalEntry', entityId: $fis->id,
                beforeHash: $oncekiHash, afterHash: $fis->computeContentHash(),
            );

            return $fis;
        });
    }

    // ─── Durum geçişleri ────────────────────────────────────────────

    /** Doğrular; hata varsa ValidationException atar. */
    public function validateEntry(JournalEntry $fis): JournalEntry
    {
        $this->throwIfInvalid($this->validator->validate($fis));

        $this->transition($fis, JournalStatus::Validated, [
            'validated_by' => auth()->id(),
        ]);

        return $fis->fresh();
    }

    public function submitForApproval(JournalEntry $fis): JournalEntry
    {
        $this->throwIfInvalid($this->validator->validate($fis));
        $this->transition($fis, JournalStatus::PendingApproval);

        return $fis->fresh();
    }

    /**
     * Onaylar ve içerik parmak izini sabitler.
     *
     * Görev ayrılığı: fişi hazırlayan kendi fişini onaylayamaz.
     */
    public function approve(JournalEntry $fis): JournalEntry
    {
        if ($fis->created_by && $fis->created_by === auth()->id()) {
            throw ValidationException::withMessages([
                'approve' => 'Kendi hazırladığınız fişi onaylayamazsınız. Görev ayrılığı gereği başka bir yetkili onaylamalı.',
            ]);
        }

        $this->throwIfInvalid($this->validator->validate($fis));

        $this->transition($fis, JournalStatus::Approved, [
            'approved_by'  => auth()->id(),
            'approved_at'  => now(),
            'content_hash' => $fis->computeContentHash(),
        ]);

        return $fis->fresh();
    }

    /** Onayı geri alır; fiş taslağa döner ve parmak izi düşer. */
    public function returnToDraft(JournalEntry $fis, string $gerekce): JournalEntry
    {
        $this->transition($fis, JournalStatus::Draft, [
            'approved_by'  => null,
            'approved_at'  => null,
            'content_hash' => null,
        ], $gerekce);

        return $fis->fresh();
    }

    /**
     * Deftere işler.
     *
     * Burada numara atanıyor. Onay ile post arasında satırlar değiştiyse
     * parmak izi tutmaz ve işlem reddedilir.
     */
    public function post(JournalEntry $fis): JournalEntry
    {
        return DB::transaction(function () use ($fis) {
            // Eşzamanlı iki post denemesinde biri beklesin.
            $fis = JournalEntry::whereKey($fis->id)->lockForUpdate()->firstOrFail();
            $fis->load('lines.account');

            $this->throwIfInvalid($this->validator->canPost($fis));

            if ($fis->content_hash && $fis->content_hash !== $fis->computeContentHash()) {
                throw ValidationException::withMessages([
                    'post' => 'Fiş onaylandıktan sonra değişmiş. Yeniden onaylanması gerekiyor.',
                ]);
            }

            $donem = $this->resolvePeriod($fis->company_id, $fis->posting_date->toDateString());

            $yil    = (int) $fis->posting_date->format('Y');
            $numara = $this->sequences->next(
                companyId: $fis->company_id,
                key:       'journal:' . $fis->journal_type->value,
                prefix:    $fis->journal_type->prefix(),
                year:      $yil,
            );

            $fis->forceFill([
                'journal_no'   => $numara,
                'period_id'    => $donem?->id,
                'status'       => JournalStatus::Posted->value,
                'posted_by'    => auth()->id(),
                'posted_at'    => now(),
                'total_debit'  => $fis->lines->sum(fn ($s) => (float) $s->debit),
                'total_credit' => $fis->lines->sum(fn ($s) => (float) $s->credit),
                'content_hash' => $fis->computeContentHash(),
            ])->save();

            $this->audit->log(
                companyId:  $fis->company_id,
                action:     'journal.posted',
                entityType: 'JournalEntry',
                entityId:   $fis->id,
                afterHash:  $fis->content_hash,
                payload:    [
                    'journal_no'   => $numara,
                    'posting_date' => $fis->posting_date->toDateString(),
                    'total'        => (string) $fis->total_debit,
                    'currency'     => $fis->currency,
                    'line_count'   => $fis->lines->count(),
                ],
            );

            return $fis->fresh('lines');
        });
    }

    /**
     * Ters kayıt üretir ve hemen deftere işler.
     *
     * Orijinal fiş silinmez; borç/alacak yönü ters yeni bir fiş yazılır ve iki
     * kayıt çift yönlü bağlanır.
     */
    public function reverse(JournalEntry $fis, string $gerekce, ?string $postingDate = null): JournalEntry
    {
        if ($fis->status !== JournalStatus::Posted) {
            throw ValidationException::withMessages([
                'reverse' => 'Yalnızca deftere işlenmiş fişler ters kayıtla kapatılabilir.',
            ]);
        }

        if ($fis->reversed_by_id) {
            throw ValidationException::withMessages([
                'reverse' => "Bu fiş zaten ters kayıtla kapatılmış ({$fis->reversedBy?->journal_no}).",
            ]);
        }

        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'Ters kayıt gerekçesi zorunludur.']);
        }

        return DB::transaction(function () use ($fis, $gerekce, $postingDate) {
            $fis->load('lines');

            // Ters kaydın tarihi: verilmezse bugün. Orijinalin dönemi kapandıysa
            // geçmişe yazmak dönem kontrolüne takılır, bu doğru davranış.
            $tarih = $postingDate ?: AppTime::today()->toDateString();

            $ters = JournalEntry::create([
                'company_id'     => $fis->company_id,
                'journal_type'   => JournalType::Reversal->value,
                'document_date'  => $tarih,
                'posting_date'   => $tarih,
                'period_id'      => $this->resolvePeriod($fis->company_id, $tarih)?->id,
                'currency'       => $fis->currency,
                'source_type'    => $fis->source_type,
                'source_id'      => $fis->source_id,
                'status'         => JournalStatus::Draft->value,
                'description'    => "Ters kayıt: {$fis->journal_no} — {$fis->description}",
                'reference'      => $fis->journal_no,
                'reversal_of_id' => $fis->id,
                'memo'           => $gerekce,
                'created_by'     => auth()->id(),
            ]);

            // Borç ve alacak yer değiştirir; işlem para birimi tutarları da.
            $this->replaceLines($ters, $fis->lines->map(fn ($s) => [
                'account_id'     => $s->account_id,
                'description'    => $s->description,
                'debit'          => $s->credit,
                'credit'         => $s->debit,
                'txn_currency'   => $s->txn_currency,
                'txn_debit'      => $s->txn_credit,
                'txn_credit'     => $s->txn_debit,
                'fx_rate'        => $s->fx_rate,
                'fx_rate_date'   => $s->fx_rate_date?->toDateString(),
                'fx_rate_source' => $s->fx_rate_source,
                'partner_id'     => $s->partner_id,
                'tax_code_id'    => $s->tax_code_id,
                // Vergi tutarları işaretiyle birlikte ters çevrilir; beyan
                // defteri ters kaydı düzeltme olarak görsün.
                'tax_base'       => $s->tax_base   === null ? null : -(float) $s->tax_base,
                'tax_amount'     => $s->tax_amount === null ? null : -(float) $s->tax_amount,
                'tax_rate'       => $s->tax_rate,
                'non_deductible_amount' => $s->non_deductible_amount === null ? null : -(float) $s->non_deductible_amount,
                'dimensions'     => $s->dimensions,
            ])->all());

            $ters->refresh()->load('lines.account');

            // Ters kayıt onay beklemez: içeriği orijinalden türetiliyor ve
            // gerekçesi kayıtlı. Onay zorunlu olsaydı hatalı kayıt defterde kalırdı.
            $ters->forceFill([
                'status'       => JournalStatus::Approved->value,
                'approved_by'  => auth()->id(),
                'approved_at'  => now(),
                'content_hash' => $ters->computeContentHash(),
            ])->save();

            $ters = $this->post($ters);

            // Orijinali kapat. Trigger bu geçişe (posted → reversed) izin veriyor.
            $fis->forceFill([
                'status'         => JournalStatus::Reversed->value,
                'reversed_by_id' => $ters->id,
                'reversed_at'    => now(),
            ])->save();

            $this->audit->log(
                companyId:  $fis->company_id,
                action:     'journal.reversed',
                entityType: 'JournalEntry',
                entityId:   $fis->id,
                payload:    ['reversal_journal_no' => $ters->journal_no],
                reason:     $gerekce,
            );

            return $ters->fresh('lines');
        });
    }

    /** Taslağı iptal eder. Deftere işlenmiş fişte çalışmaz. */
    public function cancel(JournalEntry $fis, string $gerekce): JournalEntry
    {
        $this->transition($fis, JournalStatus::Cancelled, [], $gerekce);

        return $fis->fresh();
    }

    // ─── Yardımcılar ────────────────────────────────────────────────

    /** Satırları tümüyle değiştirir; taslakta satır düzenleme bu şekilde yapılır. */
    private function replaceLines(JournalEntry $fis, array $lines): void
    {
        $fis->lines()->delete();

        $sira = 0;
        foreach ($lines as $satir) {
            $fis->lines()->create([
                'company_id'     => $fis->company_id,
                'line_no'        => $satir['line_no'] ?? ++$sira,
                'account_id'     => $satir['account_id'],
                'description'    => $satir['description']    ?? null,
                'debit'          => $satir['debit']          ?? 0,
                'credit'         => $satir['credit']         ?? 0,
                'txn_currency'   => $satir['txn_currency']   ?? null,
                'txn_debit'      => $satir['txn_debit']      ?? null,
                'txn_credit'     => $satir['txn_credit']     ?? null,
                'fx_rate'        => $satir['fx_rate']        ?? null,
                'fx_rate_date'   => $satir['fx_rate_date']   ?? null,
                'fx_rate_source' => $satir['fx_rate_source'] ?? null,
                'partner_id'     => $satir['partner_id']     ?? null,
                'tax_code_id'    => $satir['tax_code_id']    ?? null,
                'tax_base'       => $satir['tax_base']       ?? null,
                'tax_amount'     => $satir['tax_amount']     ?? null,
                'tax_rate'       => $satir['tax_rate']       ?? null,
                'non_deductible_amount' => $satir['non_deductible_amount'] ?? null,
                'dimensions'     => $satir['dimensions']     ?? [],
            ]);
        }

        $fis->forceFill([
            'total_debit'  => collect($lines)->sum(fn ($s) => (float) ($s['debit']  ?? 0)),
            'total_credit' => collect($lines)->sum(fn ($s) => (float) ($s['credit'] ?? 0)),
        ])->save();
    }

    private function resolvePeriod(string $companyId, string $tarih): ?AccountingPeriod
    {
        return AccountingPeriod::query()
            ->where('company_id', $companyId)
            ->covering($tarih)
            ->first();
    }

    private function assertEditable(JournalEntry $fis): void
    {
        if (! $fis->isEditable()) {
            throw ValidationException::withMessages([
                'status' => "{$fis->status->label()} durumundaki fiş düzenlenemez.",
            ]);
        }
    }

    /** Durum makinesine uygun geçiş; uygunsuzsa anlaşılır hata. */
    private function transition(JournalEntry $fis, JournalStatus $hedef, array $alanlar = [], ?string $gerekce = null): void
    {
        if (! $fis->status->canTransitionTo($hedef)) {
            throw ValidationException::withMessages([
                'status' => "{$fis->status->label()} → {$hedef->label()} geçişi yapılamaz.",
            ]);
        }

        $onceki = $fis->status;

        $fis->forceFill($alanlar + ['status' => $hedef->value])->save();

        $this->audit->log(
            companyId:  $fis->company_id,
            action:     'journal.status_changed',
            entityType: 'JournalEntry',
            entityId:   $fis->id,
            payload:    ['from' => $onceki->value, 'to' => $hedef->value],
            reason:     $gerekce,
        );
    }

    /** @param array<int, array{field: string, message: string}> $hatalar */
    private function throwIfInvalid(array $hatalar): void
    {
        if (! $hatalar) {
            return;
        }

        $gruplu = [];
        foreach ($hatalar as $h) {
            $gruplu[$h['field']][] = $h['message'];
        }

        throw ValidationException::withMessages($gruplu);
    }
}
