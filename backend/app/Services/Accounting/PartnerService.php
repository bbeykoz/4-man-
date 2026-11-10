<?php

namespace App\Services\Accounting;

use App\Models\Accounting\BusinessPartner;
use App\Models\Accounting\Document;
use App\Models\Accounting\PartnerAddress;
use App\Models\Accounting\PartnerOffset;
use App\Models\Company;
use App\Support\AccountRole;
use App\Support\AppTime;
use App\Support\CountryPack;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cari hesap yönetimi: kart açma, adres, bloke, mahsup.
 *
 * Kimlik numarası biçimi ülkeye göre doğrulanıyor; aynı vergi numarasının iki
 * kez açılması veritabanı indeksiyle engelleniyor çünkü mükerrer cari
 * bakiyeyi ikiye böler ve mutabakatı bozar.
 */
class PartnerService
{
    public function __construct(
        private readonly PartnerLedgerService $ledger,
        private readonly AccountRoleService $roles,
        private readonly JournalService $journal,
        private readonly AuditService $audit,
    ) {}

    public function create(Company $company, array $data): BusinessPartner
    {
        $ulke = strtoupper($data['country_code'] ?? $company->country_code);

        $this->assertIdentifiers($ulke, $data);
        $this->assertNotDuplicate($company, $data);

        $cari = BusinessPartner::create([
            'company_id'   => $company->id,
            'code'         => $data['code'] ?? $this->nextCode($company),
            'country_code' => $ulke,
            'created_by'   => auth()->id(),
        ] + $this->fillable($data));

        $this->audit->logModel($cari, 'partner.created', [
            'code' => $cari->code, 'name' => $cari->legal_name,
            'roles' => array_filter(['customer' => $cari->is_customer, 'supplier' => $cari->is_supplier]),
        ]);

        return $cari;
    }

    public function update(BusinessPartner $cari, array $data): BusinessPartner
    {
        $ulke = strtoupper($data['country_code'] ?? $cari->country_code);

        $this->assertIdentifiers($ulke, $data);
        $this->assertNotDuplicate($cari->company, $data, $cari->id);

        // Rolü kapatmak, o rolde hareketi olan caride bakiyeyi görünmez yapar.
        foreach (['is_customer' => 'müşteri', 'is_supplier' => 'tedarikçi'] as $alan => $etiket) {
            if (array_key_exists($alan, $data) && ! $data[$alan] && $cari->{$alan} && $this->hasMovements($cari)) {
                throw ValidationException::withMessages([
                    $alan => "{$cari->displayName()} carisinin hareketi var; $etiket rolü kapatılamaz. Kartı pasife alın.",
                ]);
            }
        }

        $eski = $cari->only(['legal_name', 'vat_number', 'is_customer', 'is_supplier', 'credit_limit']);

        $cari->update($this->fillable($data) + ['country_code' => $ulke]);

        $this->audit->logModel($cari, 'partner.updated', ['before' => $eski, 'after' => $cari->only(array_keys($eski))]);

        return $cari->fresh();
    }

    /** Bloke: yeni belge kesilemez, mevcut bakiye tahsil edilmeye devam eder. */
    public function block(BusinessPartner $cari, string $gerekce): BusinessPartner
    {
        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'Bloke gerekçesi zorunludur.']);
        }

        $cari->update(['is_blocked' => true, 'block_reason' => $gerekce]);
        $this->audit->logModel($cari, 'partner.blocked', ['code' => $cari->code], $gerekce);

        return $cari->fresh();
    }

    public function unblock(BusinessPartner $cari): BusinessPartner
    {
        $cari->update(['is_blocked' => false, 'block_reason' => null]);
        $this->audit->logModel($cari, 'partner.unblocked', ['code' => $cari->code]);

        return $cari->fresh();
    }

    public function delete(BusinessPartner $cari): void
    {
        if ($this->hasMovements($cari)) {
            throw ValidationException::withMessages([
                'partner' => "{$cari->displayName()} carisinin defter hareketi var; silinemez. Pasife alın.",
            ]);
        }

        if ($cari->documents()->exists()) {
            throw ValidationException::withMessages([
                'partner' => "{$cari->displayName()} carisine ait belge var; silinemez.",
            ]);
        }

        $this->audit->logModel($cari, 'partner.deleted', ['code' => $cari->code]);
        $cari->delete();
    }

    // ─── Adresler ───────────────────────────────────────────────────

    public function addAddress(BusinessPartner $cari, array $data): PartnerAddress
    {
        $adres = $cari->addresses()->create([
            'company_id'   => $cari->company_id,
            'country_code' => strtoupper($data['country_code'] ?? $cari->country_code),
        ] + array_intersect_key($data, array_flip([
            'type', 'label', 'line1', 'line2', 'city', 'postal_code', 'region',
            'contact_person', 'phone', 'is_default',
        ])));

        if ($adres->is_default) {
            $cari->addresses()->where('type', $adres->type)->whereKeyNot($adres->id)->update(['is_default' => false]);
        }

        return $adres;
    }

    public function deleteAddress(PartnerAddress $adres): void
    {
        $adres->delete();
    }

    // ─── Mahsup ─────────────────────────────────────────────────────

    /**
     * Mahsup kaydı: carinin alacağı ile borcunu karşılıklı kapatır.
     *
     * Muhasebe etkisi: alacak kontrol hesabı alacaklanır, borç kontrol hesabı
     * borçlanır. Nakit hareketi yoktur; iki bakiye birbirini götürür.
     */
    public function offset(BusinessPartner $cari, float $tutar, string $gerekce, ?string $tarih = null): PartnerOffset
    {
        if ($tutar <= 0) {
            throw ValidationException::withMessages(['amount' => 'Mahsup tutarı sıfırdan büyük olmalı.']);
        }

        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'Mahsup gerekçesi zorunludur.']);
        }

        $oneri = $this->ledger->offsetProposal($cari);

        if ($tutar > $oneri['offsettable'] + 0.01) {
            throw ValidationException::withMessages([
                'amount' => sprintf(
                    'Mahsup edilebilir tutar en fazla %s. Alacak %s, borç %s.',
                    number_format($oneri['offsettable'], 2, ',', '.'),
                    number_format($oneri['receivable_total'], 2, ',', '.'),
                    number_format($oneri['payable_total'], 2, ',', '.'),
                ),
            ]);
        }

        $company = $cari->company;
        $gun     = $tarih ?: AppTime::today()->toDateString();

        return DB::transaction(function () use ($cari, $company, $tutar, $gerekce, $gun) {
            $fis = $this->journal->createDraft($company, [
                'journal_type' => 'general',
                'posting_date' => $gun,
                'description'  => "Cari mahsup — {$cari->displayName()}",
                'source_type'  => 'PARTNER_OFFSET',
                'memo'         => $gerekce,
            ], [
                // Tedarikçi borcu kapanır (borç), müşteri alacağı kapanır (alacak).
                ['account_id' => $this->roles->accountId($company, AccountRole::AP_CONTROL),
                 'debit' => $tutar, 'partner_id' => $cari->id, 'description' => 'Mahsup — tedarikçi borcu'],
                ['account_id' => $this->roles->accountId($company, AccountRole::AR_CONTROL),
                 'credit' => $tutar, 'partner_id' => $cari->id, 'description' => 'Mahsup — müşteri alacağı'],
            ]);

            $fis = $fis->fresh();
            $fis->load('lines.account');
            $fis->forceFill(['status' => 'approved', 'approved_by' => auth()->id(),
                             'approved_at' => now(), 'content_hash' => $fis->computeContentHash()])->save();
            $fis = $this->journal->post($fis->fresh());

            $mahsup = PartnerOffset::create([
                'company_id'       => $company->id,
                'partner_id'       => $cari->id,
                'offset_date'      => $gun,
                'amount'           => $tutar,
                'currency'         => $company->functionalCurrency(),
                'journal_entry_id' => $fis->id,
                'reason'           => $gerekce,
                'created_by'       => auth()->id(),
            ]);

            // Kapatılan belgeleri işaretle; en eski vadeden başlanır.
            $oneri = $this->ledger->offsetProposal($cari);
            foreach (['receivables', 'payables'] as $taraf) {
                $kalan = $tutar;
                foreach ($oneri[$taraf] as $belge) {
                    if ($kalan <= 0) {
                        break;
                    }
                    $uygulanan = round(min($belge['outstanding'], $kalan), 2);
                    $kalan     = round($kalan - $uygulanan, 2);

                    $mahsup->lines()->create([
                        'document_id'     => $belge['document_id'],
                        'applied_amount'  => $uygulanan,
                    ]);

                    $this->applySettlement($belge['document_id'], $uygulanan);
                }
            }

            $this->audit->logModel($mahsup, 'partner.offset', [
                'partner'    => $cari->code,
                'amount'     => $tutar,
                'journal_no' => $fis->journal_no,
            ], $gerekce);

            return $mahsup->fresh('lines');
        });
    }

    /** Belgenin kapatılan tutarını artırır ve durumunu günceller. */
    private function applySettlement(string $belgeId, float $tutar): void
    {
        $belge = Document::find($belgeId);

        if (! $belge) {
            return;
        }

        $yeni = round((float) $belge->settled_amount + $tutar, 2);
        $brut = round((float) $belge->gross_amount, 2);

        $belge->forceFill([
            'settled_amount' => $yeni,
            'status'         => $yeni >= $brut - 0.01 ? 'settled' : 'partially_settled',
        ])->save();
    }

    // ─── İç yardımcılar ─────────────────────────────────────────────

    private function hasMovements(BusinessPartner $cari): bool
    {
        return DB::table('journal_lines')->where('partner_id', $cari->id)->exists();
    }

    /** Ülkeye göre kimlik ve KDV numarası biçimi. */
    private function assertIdentifiers(string $ulke, array $data): void
    {
        $hatalar = [];

        if (array_key_exists('registration_number', $data)
            && ! CountryPack::validRegistrationNumber($ulke, $data['registration_number'])) {
            $etiket = CountryPack::setting($ulke, 'registration_label', 'Sicil numarası');
            $hatalar['registration_number'] = "$etiket biçimi $ulke için geçersiz.";
        }

        // Yabancı caride KDV numarası kendi ülkesinin biçiminde olur; yalnız
        // tanımlı ülkelerde kontrol ediyoruz, diğerlerinde serbest.
        if (array_key_exists('vat_number', $data)
            && in_array($ulke, CountryPack::codes(), true)
            && ! CountryPack::validVatNumber($ulke, $data['vat_number'])) {
            $hatalar['vat_number'] = "KDV numarası biçimi $ulke için geçersiz.";
        }

        if ($hatalar) {
            throw ValidationException::withMessages($hatalar);
        }
    }

    /** Aynı vergi/sicil numarasıyla ikinci cari açılmasın. */
    private function assertNotDuplicate(Company $company, array $data, ?string $haricId = null): void
    {
        foreach (['vat_number' => 'KDV numarası', 'registration_number' => 'Sicil numarası'] as $alan => $etiket) {
            if (empty($data[$alan])) {
                continue;
            }

            $mevcut = BusinessPartner::where('company_id', $company->id)
                ->where($alan, $data[$alan])
                ->when($haricId, fn ($q) => $q->whereKeyNot($haricId))
                ->first();

            if ($mevcut) {
                throw ValidationException::withMessages([
                    $alan => "$etiket zaten {$mevcut->code} — {$mevcut->legal_name} carisinde kayıtlı.",
                ]);
            }
        }
    }

    private function nextCode(Company $company): string
    {
        $son = BusinessPartner::withTrashed()
            ->where('company_id', $company->id)
            ->where('code', 'like', 'C%')
            ->orderByDesc('code')
            ->value('code');

        $sira = $son ? ((int) substr($son, 1)) + 1 : 1;

        return sprintf('C%05d', $sira);
    }

    private function fillable(array $data): array
    {
        return array_intersect_key($data, array_flip([
            'code', 'legal_name', 'trade_name', 'is_customer', 'is_supplier',
            'registration_number', 'vat_number', 'vat_registered',
            'email', 'phone', 'website', 'contact_person',
            'currency', 'payment_terms', 'payment_days', 'credit_limit', 'discount_rate',
            'receivable_account_id', 'payable_account_id',
            'default_revenue_account_id', 'default_expense_account_id', 'default_tax_code_id',
            'is_active', 'notes', 'meta',
        ]));
    }
}
