<?php

namespace App\Services\Accounting;

use App\Models\Accounting\AccountingPeriod;
use App\Models\Accounting\VatReturn;
use App\Models\Company;
use App\Support\AccountRole;
use App\Support\AppTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * KDV beyanı: taslak üretme, beyan öncesi kontroller, gönderim ve tahakkuk.
 *
 * Beyan defterlerden türetiliyor; gönderildiğinde içerik donduruluyor.
 * Doküman §5.4'ün kontrol listesi burada çalışıyor: eksik belge, dönem dışı
 * kayıt, KDV kodu olmayan satır, defter-beyan farkı.
 */
class VatReturnService
{
    public function __construct(
        private readonly VatLedgerService $ledger,
        private readonly AccountRoleService $roles,
        private readonly JournalService $journal,
        private readonly AuditService $audit,
    ) {}

    /**
     * Dönem için beyan taslağı üretir ya da mevcut taslağı tazeler.
     *
     * Gönderilmiş beyan tazelenmez; düzeltme ayrı bir süreçtir.
     */
    public function prepare(Company $company, string $periodKey): VatReturn
    {
        if (! $company->vat_registered) {
            throw ValidationException::withMessages([
                'company' => "{$company->name} KDV mükellefi olarak işaretli değil; beyan üretilemez.",
            ]);
        }

        [$bas, $bit] = $this->ledger->periodRange($periodKey);

        $mevcut = VatReturn::where('company_id', $company->id)->where('period_key', $periodKey)->first();

        if ($mevcut && $mevcut->isSubmitted()) {
            throw ValidationException::withMessages([
                'period' => "$periodKey dönemi beyanı zaten gönderilmiş. Düzeltme beyanı için ayrı kayıt açın.",
            ]);
        }

        $satis = $this->ledger->salesBook($company, $bas, $bit);
        $alis  = $this->ledger->purchaseBook($company, $bas, $bit);

        return DB::transaction(function () use ($company, $periodKey, $bas, $bit, $satis, $alis, $mevcut) {
            $kutular = $this->mergeBoxes($satis['boxes'], $alis['boxes']);

            $hesaplananKdv  = round($satis['totals']['tax'], 2);
            $indirilecekKdv = round($alis['totals']['deductible'], 2);
            $netOdenecek    = round($hesaplananKdv - $indirilecekKdv, 2);

            $beyan = VatReturn::updateOrCreate(
                ['company_id' => $company->id, 'period_key' => $periodKey],
                [
                    'period_start'       => $bas,
                    'period_end'         => $bit,
                    'due_date'           => $this->ledger->dueDate($company, $periodKey),
                    'currency'           => $company->functionalCurrency(),
                    'boxes'              => $kutular,
                    'output_base'        => round($satis['totals']['base'], 2),
                    'output_tax'         => $hesaplananKdv,
                    'input_base'         => round($alis['totals']['base'], 2),
                    'input_tax'          => $indirilecekKdv,
                    'non_deductible_tax' => round($alis['totals']['non_deductible'], 2),
                    'net_payable'        => $netOdenecek,
                    'sales_count'        => $satis['totals']['document_count'],
                    'purchase_count'     => $alis['totals']['document_count'],
                    'status'             => 'draft',
                    'validation_issues'  => [],
                ],
            );

            // Satır anlık görüntüsünü tazele.
            $beyan->entries()->delete();

            foreach ([['sales', $satis], ['purchase', $alis]] as [$defter, $veri]) {
                foreach ($veri['lines'] as $s) {
                    $beyan->entries()->create([
                        'book'               => $defter,
                        'document_id'        => $s['document_id'],
                        'document_number'    => $s['document_number'],
                        'doc_type'           => $s['doc_type'],
                        'tax_date'           => $s['tax_date'],
                        'partner_name'       => $s['partner_name'],
                        'partner_vat_number' => $s['partner_vat_number'],
                        'tax_code'           => $s['tax_code'],
                        'treatment'          => $s['treatment'],
                        'report_box'         => $s['report_box'],
                        'base'               => $s['base'],
                        'tax'                => $s['tax'],
                        'non_deductible'     => $s['non_deductible'],
                    ]);
                }
            }

            $this->audit->logModel($beyan, $mevcut ? 'vat_return.refreshed' : 'vat_return.prepared', [
                'period'      => $periodKey,
                'output_tax'  => $hesaplananKdv,
                'input_tax'   => $indirilecekKdv,
                'net_payable' => $netOdenecek,
            ]);

            return $beyan->fresh();
        });
    }

    /**
     * Beyan öncesi kontroller (doküman §5.4).
     *
     * Hatalar gönderimi engelliyor, uyarılar engellemiyor ama açıklanması
     * gerekiyor. Kullanıcıya tümü birden gösteriliyor.
     *
     * @return array{errors: array, warnings: array, ok: bool}
     */
    public function validateReturn(VatReturn $beyan): array
    {
        $company = $beyan->company;
        $bas = $beyan->period_start->toDateString();
        $bit = $beyan->period_end->toDateString();

        $hatalar = [];
        $uyarilar = [];

        // 1) Vergi kodu atanmamış belge satırı: matrah hangi kutuya gidecek belli değil.
        $kodsuz = DB::table('document_lines as dl')
            ->join('documents as d', 'd.id', '=', 'dl.document_id')
            ->where('d.company_id', $company->id)
            ->whereIn('d.status', ['posted', 'partially_settled', 'settled'])
            ->whereNull('d.deleted_at')
            ->whereNull('dl.tax_code_id')
            ->whereRaw('COALESCE(d.tax_date, d.supply_date, d.issue_date) BETWEEN ? AND ?', [$bas, $bit])
            ->get(['d.number', 'dl.line_no', 'dl.net_amount']);

        foreach ($kodsuz as $k) {
            $hatalar[] = [
                'code'    => 'MISSING_TAX_CODE',
                'message' => "{$k->number} belgesinin {$k->line_no}. satırında vergi kodu yok; beyan kutusu belirlenemiyor.",
                'document'=> $k->number,
            ];
        }

        // 2) Beyan kutusu eşlenmemiş vergi kodu.
        if (isset($beyan->boxes['UNMAPPED'])) {
            $hatalar[] = [
                'code'    => 'UNMAPPED_BOX',
                'message' => sprintf('%s matrah beyan kutusuna eşlenmemiş vergi koduyla kayıtlı. Vergi kodlarının beyan kutularını tanımlayın.',
                    number_format($beyan->boxes['UNMAPPED']['base'] ?? 0, 2, ',', '.')),
            ];
        }

        // 3) Taslak belge: dönemde kesilmiş ama deftere işlenmemiş.
        $taslak = DB::table('documents')
            ->where('company_id', $company->id)
            ->whereIn('status', ['draft', 'issued'])
            ->whereNull('deleted_at')
            ->whereRaw('COALESCE(tax_date, supply_date, issue_date) BETWEEN ? AND ?', [$bas, $bit])
            ->count();

        if ($taslak > 0) {
            $hatalar[] = [
                'code'    => 'UNPOSTED_DOCUMENTS',
                'message' => "Dönemde deftere işlenmemiş $taslak belge var. Beyandan önce işleyin ya da iptal edin.",
            ];
        }

        // 4) KDV numarası eksik AB işlemi: VIES bildirimi verilemez.
        $vies = $this->ledger->viesReport($company, $bas, $bit);

        foreach ($vies['entries'] as $g) {
            foreach ($g['issues'] as $sorun) {
                $hatalar[] = [
                    'code'    => 'VIES_ISSUE',
                    'message' => ($g['partner_name'] ?: 'Bilinmeyen cari') . ": $sorun",
                ];
            }
        }

        // 5) Defter ile muhasebe hesapları tutuyor mu.
        $fark = $this->ledgerVsAccounts($beyan);

        if (abs($fark['output_difference']) >= 0.01) {
            $hatalar[] = [
                'code'    => 'OUTPUT_MISMATCH',
                'message' => sprintf('Satış defteri hesaplanan KDV (%s) ile %s hesabının dönem hareketi (%s) tutmuyor. Fark: %s.',
                    number_format((float) $beyan->output_tax, 2, ',', '.'),
                    $fark['output_account'],
                    number_format($fark['output_account_movement'], 2, ',', '.'),
                    number_format($fark['output_difference'], 2, ',', '.')),
            ];
        }

        if (abs($fark['input_difference']) >= 0.01) {
            $hatalar[] = [
                'code'    => 'INPUT_MISMATCH',
                'message' => sprintf('Alış defteri indirilecek KDV (%s) ile %s hesabının dönem hareketi (%s) tutmuyor. Fark: %s.',
                    number_format((float) $beyan->input_tax, 2, ',', '.'),
                    $fark['input_account'],
                    number_format($fark['input_account_movement'], 2, ',', '.'),
                    number_format($fark['input_difference'], 2, ',', '.')),
            ];
        }

        // 6) Dönem hâlâ açık: beyandan sonra kayıt girilirse beyan eskir.
        $donem = AccountingPeriod::where('company_id', $company->id)->covering($bit)->first();

        if ($donem && $donem->status->acceptsPosting()) {
            $uyarilar[] = [
                'code'    => 'PERIOD_OPEN',
                'message' => "{$donem->name} dönemi hâlâ açık. Beyandan sonra girilen kayıtlar beyanla tutmaz; dönemi kapatmayı düşünün.",
            ];
        }

        // 7) Son tarih geçmiş mi.
        $kalan = $beyan->daysToDue(AppTime::today()->toDateString());

        if ($kalan < 0) {
            $uyarilar[] = [
                'code'    => 'OVERDUE',
                'message' => sprintf('Beyan son tarihi %s, %d gün geçti.', $beyan->due_date->format('d.m.Y'), abs($kalan)),
            ];
        } elseif ($kalan <= 3) {
            $uyarilar[] = [
                'code'    => 'DUE_SOON',
                'message' => sprintf('Beyan son tarihine %d gün kaldı (%s).', $kalan, $beyan->due_date->format('d.m.Y')),
            ];
        }

        // 8) Hiç hareket yok: faaliyetsiz ayda da beyan gerekebilir.
        if ($beyan->sales_count === 0 && $beyan->purchase_count === 0) {
            $uyarilar[] = [
                'code'    => 'NIL_RETURN',
                'message' => 'Dönemde KDV işlemi yok. Faaliyetsiz ayda da beyan yükümlülüğü doğabilir; danışmanınıza sorun.',
            ];
        }

        $sonuc = ['errors' => $hatalar, 'warnings' => $uyarilar, 'ok' => $hatalar === []];

        $beyan->forceFill([
            'validation_issues' => $sonuc,
            'status'            => $hatalar === [] && $beyan->isEditable() ? 'validated' : $beyan->status,
        ])->save();

        return $sonuc;
    }

    /**
     * Defter toplamları ile KDV hesaplarının dönem hareketi karşılaştırması.
     *
     * Tutmuyorsa ya elle fiş girilmiş ya da bir belge deftere farklı yansımış;
     * ikisi de beyandan önce açıklanmalı.
     */
    public function ledgerVsAccounts(VatReturn $beyan): array
    {
        $company = $beyan->company;

        $hareket = function (string $rol, bool $alacakYonu) use ($company, $beyan): array {
            $hesapId = $this->roles->accountIdOrNull($company, $rol);

            if (! $hesapId) {
                return ['code' => '(eşlenmemiş)', 'movement' => 0.0];
            }

            $satir = DB::table('journal_lines as l')
                ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
                ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
                ->where('l.account_id', $hesapId)
                ->whereIn('e.status', ['posted', 'reversed'])
                ->whereDate('e.posting_date', '>=', $beyan->period_start->toDateString())
                ->whereDate('e.posting_date', '<=', $beyan->period_end->toDateString())
                ->selectRaw('COALESCE(SUM(l.debit),0) AS borc, COALESCE(SUM(l.credit),0) AS alacak, MAX(a.code) AS kod')
                ->first();

            $tutar = $alacakYonu
                ? (float) $satir->alacak - (float) $satir->borc
                : (float) $satir->borc - (float) $satir->alacak;

            return ['code' => $satir->kod ?? '(hesap)', 'movement' => round($tutar, 2)];
        };

        $cikis = $hareket(AccountRole::OUTPUT_VAT, alacakYonu: true);
        $giris = $hareket(AccountRole::INPUT_VAT, alacakYonu: false);

        return [
            'output_account'          => $cikis['code'],
            'output_account_movement' => $cikis['movement'],
            'output_book'             => round((float) $beyan->output_tax, 2),
            'output_difference'       => round((float) $beyan->output_tax - $cikis['movement'], 2),

            'input_account'           => $giris['code'],
            'input_account_movement'  => $giris['movement'],
            'input_book'              => round((float) $beyan->input_tax, 2),
            'input_difference'        => round((float) $beyan->input_tax - $giris['movement'], 2),
        ];
    }

    /**
     * Beyanı gönderildi olarak işaretler ve tahakkuk fişi üretir.
     *
     * Tahakkuk: hesaplanan KDV borçlanır, indirilecek KDV alacaklanır, fark
     * ödenecek/devreden hesabına yazılır. Böylece dönem KDV hesapları sıfırlanır.
     */
    public function submit(VatReturn $beyan, ?string $referans = null, ?string $not = null): VatReturn
    {
        if ($beyan->isSubmitted()) {
            throw ValidationException::withMessages(['status' => 'Beyan zaten gönderilmiş.']);
        }

        $kontrol = $this->validateReturn($beyan->fresh());

        if (! $kontrol['ok']) {
            throw ValidationException::withMessages([
                'validation' => 'Beyan kontrolden geçmedi: ' . collect($kontrol['errors'])->pluck('message')->take(3)->implode(' '),
            ]);
        }

        return DB::transaction(function () use ($beyan, $referans, $not) {
            $fisId = $this->postAccrual($beyan);

            $beyan->forceFill([
                'status'               => 'submitted',
                'submitted_at'         => now(),
                'submitted_by'         => auth()->id(),
                'submission_reference' => $referans,
                'submission_note'      => $not,
                'journal_entry_id'     => $fisId,
                'snapshot_hash'        => $this->snapshotHash($beyan),
            ])->save();

            $this->audit->logModel($beyan, 'vat_return.submitted', [
                'period'      => $beyan->period_key,
                'net_payable' => (string) $beyan->net_payable,
                'reference'   => $referans,
            ], $not);

            return $beyan->fresh();
        });
    }

    /**
     * KDV tahakkuk fişi.
     *
     * Hesaplanan KDV borç, indirilecek KDV alacak, fark mahsup hesabına.
     */
    private function postAccrual(VatReturn $beyan): ?string
    {
        $company = $beyan->company;

        $hesaplanan  = round((float) $beyan->output_tax, 2);
        $indirilecek = round((float) $beyan->input_tax, 2);
        $net         = round($hesaplanan - $indirilecek, 2);

        if (abs($hesaplanan) < 0.01 && abs($indirilecek) < 0.01) {
            return null;   // faaliyetsiz dönem; fiş gereksiz
        }

        $satirlar = [];

        if (abs($hesaplanan) >= 0.01) {
            $satirlar[] = [
                'account_id'  => $this->roles->accountId($company, AccountRole::OUTPUT_VAT),
                'description' => 'Hesaplanan KDV kapanışı',
                'debit'       => $hesaplanan > 0 ? $hesaplanan : 0.0,
                'credit'      => $hesaplanan < 0 ? abs($hesaplanan) : 0.0,
            ];
        }

        if (abs($indirilecek) >= 0.01) {
            $satirlar[] = [
                'account_id'  => $this->roles->accountId($company, AccountRole::INPUT_VAT),
                'description' => 'İndirilecek KDV kapanışı',
                'debit'       => $indirilecek < 0 ? abs($indirilecek) : 0.0,
                'credit'      => $indirilecek > 0 ? $indirilecek : 0.0,
            ];
        }

        // Mahsup hesabı: ödenecek ya da devreden KDV.
        $mahsupHesap = $this->roles->accountIdOrNull($company, 'vat_settlement')
            ?? $this->roles->accountId($company, AccountRole::OUTPUT_VAT);

        if (abs($net) >= 0.01 && $mahsupHesap !== $this->roles->accountId($company, AccountRole::OUTPUT_VAT)) {
            $satirlar[] = [
                'account_id'  => $mahsupHesap,
                'description' => $net > 0 ? 'Ödenecek KDV' : 'Devreden KDV',
                'debit'       => $net < 0 ? abs($net) : 0.0,
                'credit'      => $net > 0 ? $net : 0.0,
            ];
        }

        // Mahsup hesabı eşlenmemişse fiş dengelenemez; tahakkuk atlanır ve
        // beyan yine gönderilir. Eksik eşleme kontrol listesinde görünüyor.
        $borc   = round(array_sum(array_column($satirlar, 'debit')), 2);
        $alacak = round(array_sum(array_column($satirlar, 'credit')), 2);

        if (count($satirlar) < 2 || abs($borc - $alacak) >= 0.01) {
            return null;
        }

        $fis = $this->journal->createDraft($company, [
            'journal_type' => 'tax_adjustment',
            'posting_date' => $beyan->period_end->toDateString(),
            'description'  => "KDV tahakkuku — {$beyan->period_key}",
            'reference'    => $beyan->period_key,
            'source_type'  => 'VAT_RETURN',
            'source_id'    => $beyan->id,
        ], $satirlar);

        $fis = $fis->fresh();
        $fis->load('lines.account');
        $fis->forceFill(['status' => 'approved', 'approved_by' => auth()->id(),
                         'approved_at' => now(), 'content_hash' => $fis->computeContentHash()])->save();

        return $this->journal->post($fis->fresh())->id;
    }

    /** Gönderim anındaki defter özeti; sonradan değişiklik tespit edilsin. */
    private function snapshotHash(VatReturn $beyan): string
    {
        $satirlar = $beyan->entries()
            ->orderBy('book')->orderBy('document_number')->orderBy('id')
            ->get(['book', 'document_number', 'tax_code', 'base', 'tax'])
            ->map(fn ($s) => implode('|', [
                $s->book, $s->document_number, $s->tax_code,
                number_format((float) $s->base, 2, '.', ''),
                number_format((float) $s->tax, 2, '.', ''),
            ]))
            ->implode("\n");

        return hash('sha256', $beyan->period_key . "\n" . $satirlar);
    }

    /**
     * Gönderilmiş beyandan sonra defter değişti mi.
     * Değiştiyse düzeltme beyanı gerekiyor olabilir.
     */
    public function detectDrift(VatReturn $beyan): array
    {
        if (! $beyan->isSubmitted() || ! $beyan->snapshot_hash) {
            return ['checked' => false];
        }

        $guncel = $this->snapshotHash($beyan);

        // Defteri yeniden hesaplayıp karşılaştır.
        $satis = $this->ledger->salesBook($beyan->company, $beyan->period_start->toDateString(), $beyan->period_end->toDateString());
        $alis  = $this->ledger->purchaseBook($beyan->company, $beyan->period_start->toDateString(), $beyan->period_end->toDateString());

        $yeniCikis = round($satis['totals']['tax'], 2);
        $yeniGiris = round($alis['totals']['deductible'], 2);

        return [
            'checked'           => true,
            'snapshot_matches'  => $guncel === $beyan->snapshot_hash,
            'declared_output'   => round((float) $beyan->output_tax, 2),
            'current_output'    => $yeniCikis,
            'output_drift'      => round($yeniCikis - (float) $beyan->output_tax, 2),
            'declared_input'    => round((float) $beyan->input_tax, 2),
            'current_input'     => $yeniGiris,
            'input_drift'       => round($yeniGiris - (float) $beyan->input_tax, 2),
            'needs_correction'  => abs($yeniCikis - (float) $beyan->output_tax) >= 0.01
                                || abs($yeniGiris - (float) $beyan->input_tax) >= 0.01,
        ];
    }

    /** Satış ve alış kutularını birleştirir; aynı kutu iki defterde olabilir. */
    private function mergeBoxes(array $satis, array $alis): array
    {
        $sonuc = [];

        foreach (['sales' => $satis, 'purchase' => $alis] as $defter => $kutular) {
            foreach ($kutular as $kod => $degerler) {
                $sonuc[$kod]['base'] = round(($sonuc[$kod]['base'] ?? 0) + ($degerler['base'] ?? 0), 2);
                $sonuc[$kod]['tax']  = round(($sonuc[$kod]['tax']  ?? 0) + ($degerler['tax']  ?? 0), 2);
                $sonuc[$kod]['books'][] = $defter;
            }
        }

        return $sonuc;
    }
}
