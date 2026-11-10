<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\AccountType;
use App\Enums\Accounting\JournalStatus;
use App\Enums\Accounting\NormalBalance;
use App\Models\Accounting\ChartAccount;
use App\Models\Company;
use App\Support\AppTime;
use Illuminate\Support\Facades\DB;

/**
 * Defter raporları: mizan, büyük defter, hesap ekstresi, yevmiye defteri.
 *
 * Üç ortak kural:
 *  - Yalnız deftere işlenmiş fişler sayılır. Ters kayıt da deftere işlenmiştir
 *    ve sayılır — orijinali kendisi nötrler, iki kaydın toplamı sıfırdır.
 *  - Açılış bakiyesi "başlangıç tarihinden önceki tüm hareketler" demektir.
 *    Ayrı bir devir kaydı aramıyoruz; defterin kendisi devri taşır.
 *  - Her rapor parametrelerini, veri kesit tarihini ve üretim zamanını
 *    döndürür. Aynı rapor sonradan yeniden üretilebilsin diye (doküman §4.3).
 *
 * Performans: her rapor tek bir toplu sorgu. Hesap başına sorgu açmıyoruz.
 */
class LedgerReportService
{
    /** Defter bakiyesine giren fiş durumları. */
    private const DEFTER_DURUMLARI = [
        JournalStatus::Posted->value,
        JournalStatus::Reversed->value,
    ];

    /**
     * Mizan.
     *
     * Her hesap için: açılış bakiyesi, dönem borç/alacak hareketi, kapanış
     * bakiyesi. Hareketsiz hesaplar varsayılan olarak gizlenir.
     *
     * @param  array  $filtre  from, to, include_empty, account_type, dimensions
     */
    public function trialBalance(Company $company, array $filtre = []): array
    {
        [$bas, $bit] = $this->range($company, $filtre);

        $satirlar = DB::table('chart_accounts as a')
            ->leftJoin('journal_lines as l', function ($j) {
                $j->on('l.account_id', '=', 'a.id');
            })
            // Durum ve tarih süzgeci JOIN içinde: WHERE'e konursa hareketsiz
            // hesaplar LEFT JOIN'den düşer ve mizandan kaybolur.
            ->leftJoin('journal_entries as e', function ($j) use ($bit) {
                $j->on('e.id', '=', 'l.entry_id')
                  ->whereIn('e.status', self::DEFTER_DURUMLARI)
                  ->whereDate('e.posting_date', '<=', $bit);
            })
            ->where('a.company_id', $company->id)
            ->whereNull('a.deleted_at')
            ->when(! empty($filtre['account_type']), fn ($q) => $q->where('a.account_type', $filtre['account_type']))
            ->when(! empty($filtre['dimensions']), fn ($q) => $this->applyDimensions($q, $filtre['dimensions']))
            ->groupBy('a.id', 'a.code', 'a.name', 'a.name_local', 'a.account_type', 'a.normal_balance')
            ->orderBy('a.code')
            ->select(['a.id', 'a.code', 'a.name', 'a.name_local', 'a.account_type', 'a.normal_balance'])
            // Tarih bağlanarak geçiyor; sorguya metin olarak gömülmüyor.
            ->selectRaw('COALESCE(SUM(CASE WHEN e.posting_date <  ? THEN l.debit  ELSE 0 END), 0) AS acilis_borc',   [$bas])
            ->selectRaw('COALESCE(SUM(CASE WHEN e.posting_date <  ? THEN l.credit ELSE 0 END), 0) AS acilis_alacak', [$bas])
            ->selectRaw('COALESCE(SUM(CASE WHEN e.posting_date >= ? THEN l.debit  ELSE 0 END), 0) AS donem_borc',    [$bas])
            ->selectRaw('COALESCE(SUM(CASE WHEN e.posting_date >= ? THEN l.credit ELSE 0 END), 0) AS donem_alacak',  [$bas])
            ->get();

        $bosGoster = (bool) ($filtre['include_empty'] ?? false);
        $hesaplar  = [];
        $toplam    = ['opening_debit' => 0.0, 'opening_credit' => 0.0, 'period_debit' => 0.0, 'period_credit' => 0.0,
                      'closing_debit' => 0.0, 'closing_credit' => 0.0];

        foreach ($satirlar as $s) {
            $acilis = (float) $s->acilis_borc - (float) $s->acilis_alacak;
            $donemB = (float) $s->donem_borc;
            $donemA = (float) $s->donem_alacak;
            $kapanis = $acilis + $donemB - $donemA;

            $hareketVar = $acilis != 0.0 || $donemB != 0.0 || $donemA != 0.0;
            if (! $hareketVar && ! $bosGoster) {
                continue;
            }

            $tur  = AccountType::from($s->account_type);
            $yon  = NormalBalance::from($s->normal_balance);

            $kayit = [
                'account_id'     => $s->id,
                'code'           => $s->code,
                'name'           => $s->name,
                'name_local'     => $s->name_local,
                'account_type'   => $s->account_type,
                'type_label'     => $tur->label(),
                'normal_balance' => $s->normal_balance,

                // Bakiyeler borç tarafı pozitif olacak şekilde tek sayı; ayrıca
                // mizan sütunları için borç/alacak ayrıştırılmış hali.
                'opening_balance' => round($acilis, 2),
                'opening_debit'   => round(max($acilis, 0), 2),
                'opening_credit'  => round(max(-$acilis, 0), 2),
                'period_debit'    => round($donemB, 2),
                'period_credit'   => round($donemA, 2),
                'closing_balance' => round($kapanis, 2),
                'closing_debit'   => round(max($kapanis, 0), 2),
                'closing_credit'  => round(max(-$kapanis, 0), 2),

                // Olağan yöne göre işaretli bakiye: ters bakiye negatif çıkar.
                'signed_balance'  => round($yon->signed(max($kapanis, 0), max(-$kapanis, 0)), 2),
                // Olağan yönünün tersine bakiye veren hesap uyarı ister.
                'unusual_balance' => $kapanis != 0.0 && (
                    ($yon === NormalBalance::Debit  && $kapanis < 0) ||
                    ($yon === NormalBalance::Credit && $kapanis > 0)
                ),
            ];

            foreach (['opening_debit', 'opening_credit', 'period_debit', 'period_credit', 'closing_debit', 'closing_credit'] as $k) {
                $toplam[$k] += $kayit[$k];
            }

            $hesaplar[] = $kayit;
        }

        $toplam = array_map(fn ($v) => round($v, 2), $toplam);

        return [
            'accounts' => $hesaplar,
            'totals'   => $toplam,
            // Mizanın dengeli olması defterin tutarlılık göstergesi.
            'balanced' => $this->esit($toplam['period_debit'], $toplam['period_credit'])
                       && $this->esit($toplam['closing_debit'], $toplam['closing_credit']),
            'meta'     => $this->meta($company, ['from' => $bas, 'to' => $bit] + $filtre),
        ];
    }

    /**
     * Büyük defter: hesap hesap, her hesabın hareketleri ve yürüyen bakiyesi.
     *
     * Hesap seçilmezse tüm hareketli hesaplar döner; büyük defterde bu normaldir
     * ama sayfa sayısı yüksek olacağı için limit uygulanıyor.
     */
    public function generalLedger(Company $company, array $filtre = []): array
    {
        [$bas, $bit] = $this->range($company, $filtre);

        $hesapIdleri = $this->resolveAccountIds($company, $filtre);

        // Açılış bakiyeleri tek sorguda; hesap başına sorgu açmıyoruz.
        $acilisTablosu = $this->openingBalances($company, $bas, $hesapIdleri, $filtre['dimensions'] ?? []);

        $hareketler = $this->movementQuery($company, $bas, $bit, $hesapIdleri, $filtre)
            ->orderBy('a.code')
            ->orderBy('e.posting_date')
            ->orderBy('e.journal_no')
            ->orderBy('l.line_no')
            ->limit((int) ($filtre['limit'] ?? 5000))
            ->get();

        $gruplar = [];
        foreach ($hareketler as $h) {
            $gruplar[$h->account_id][] = $h;
        }

        // Hareketsiz ama açılış bakiyesi olan hesaplar da listelensin.
        foreach ($acilisTablosu as $hesapId => $acilis) {
            if ($acilis != 0.0 && ! isset($gruplar[$hesapId])) {
                $gruplar[$hesapId] = [];
            }
        }

        $hesapBilgi = ChartAccount::whereIn('id', array_keys($gruplar))->get()->keyBy('id');

        $sonuc = [];
        foreach ($gruplar as $hesapId => $satirlar) {
            $hesap = $hesapBilgi->get($hesapId);
            if (! $hesap) {
                continue;
            }

            $bakiye = (float) ($acilisTablosu[$hesapId] ?? 0);
            $acilis = $bakiye;

            $kayitlar = [];
            foreach ($satirlar as $s) {
                $bakiye += (float) $s->debit - (float) $s->credit;
                $kayitlar[] = $this->movementRow($s, $bakiye);
            }

            $sonuc[] = [
                'account_id'      => $hesap->id,
                'code'            => $hesap->code,
                'name'            => $hesap->name,
                'account_type'    => $hesap->account_type->value,
                'normal_balance'  => $hesap->normal_balance->value,
                'opening_balance' => round($acilis, 2),
                'period_debit'    => round(array_sum(array_map(fn ($s) => (float) $s->debit, $satirlar)), 2),
                'period_credit'   => round(array_sum(array_map(fn ($s) => (float) $s->credit, $satirlar)), 2),
                'closing_balance' => round($bakiye, 2),
                'movements'       => $kayitlar,
            ];
        }

        usort($sonuc, fn ($a, $b) => strcmp($a['code'], $b['code']));

        return [
            'accounts' => $sonuc,
            'meta'     => $this->meta($company, ['from' => $bas, 'to' => $bit] + $filtre),
        ];
    }

    /**
     * Tek hesabın ekstresi: açılış, hareketler, yürüyen bakiye, kapanış.
     * Büyük defterin tek hesaplık, sayfalanabilir hâli.
     */
    public function accountStatement(Company $company, string $accountId, array $filtre = []): array
    {
        [$bas, $bit] = $this->range($company, $filtre);

        $hesap = ChartAccount::where('company_id', $company->id)->findOrFail($accountId);

        $acilis = (float) ($this->openingBalances($company, $bas, [$accountId], $filtre['dimensions'] ?? [])[$accountId] ?? 0);

        $hareketler = $this->movementQuery($company, $bas, $bit, [$accountId], $filtre)
            ->orderBy('e.posting_date')
            ->orderBy('e.journal_no')
            ->orderBy('l.line_no')
            ->get();

        $bakiye   = $acilis;
        $kayitlar = [];
        foreach ($hareketler as $s) {
            $bakiye += (float) $s->debit - (float) $s->credit;
            $kayitlar[] = $this->movementRow($s, $bakiye);
        }

        return [
            'account' => [
                'id'             => $hesap->id,
                'code'           => $hesap->code,
                'name'           => $hesap->name,
                'name_local'     => $hesap->name_local,
                'account_type'   => $hesap->account_type->value,
                'type_label'     => $hesap->account_type->label(),
                'normal_balance' => $hesap->normal_balance->value,
                'is_control'     => $hesap->is_control,
            ],
            'opening_balance' => round($acilis, 2),
            'period_debit'    => round($hareketler->sum(fn ($s) => (float) $s->debit), 2),
            'period_credit'   => round($hareketler->sum(fn ($s) => (float) $s->credit), 2),
            'closing_balance' => round($bakiye, 2),
            'movement_count'  => $hareketler->count(),
            'movements'       => $kayitlar,
            'meta'            => $this->meta($company, ['from' => $bas, 'to' => $bit, 'account_id' => $accountId] + $filtre),
        ];
    }

    /**
     * Yevmiye defteri: fişler tarih ve numara sırasıyla, satırlarıyla birlikte.
     * Yasal defter çıktısının kaynağı.
     */
    public function journalBook(Company $company, array $filtre = []): array
    {
        [$bas, $bit] = $this->range($company, $filtre);

        $fisler = DB::table('journal_entries as e')
            ->where('e.company_id', $company->id)
            ->whereIn('e.status', self::DEFTER_DURUMLARI)
            ->whereDate('e.posting_date', '>=', $bas)
            ->whereDate('e.posting_date', '<=', $bit)
            ->when(! empty($filtre['journal_type']), fn ($q) => $q->where('e.journal_type', $filtre['journal_type']))
            ->orderBy('e.posting_date')
            ->orderBy('e.journal_no')
            ->limit((int) ($filtre['limit'] ?? 2000))
            ->get(['e.id', 'e.journal_no', 'e.journal_type', 'e.posting_date', 'e.document_date',
                   'e.description', 'e.reference', 'e.currency', 'e.total_debit', 'e.total_credit',
                   'e.status', 'e.source_type', 'e.reversal_of_id']);

        $satirlar = DB::table('journal_lines as l')
            ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
            ->whereIn('l.entry_id', $fisler->pluck('id'))
            ->orderBy('l.line_no')
            ->get(['l.entry_id', 'l.line_no', 'l.debit', 'l.credit', 'l.description',
                   'l.partner_id', 'l.dimensions', 'a.code as account_code', 'a.name as account_name'])
            ->groupBy('entry_id');

        return [
            'entries' => $fisler->map(fn ($f) => [
                'id'            => $f->id,
                'journal_no'    => $f->journal_no,
                'journal_type'  => $f->journal_type,
                'posting_date'  => $f->posting_date,
                'document_date' => $f->document_date,
                'description'   => $f->description,
                'reference'     => $f->reference,
                'currency'      => $f->currency,
                'total_debit'   => round((float) $f->total_debit, 2),
                'total_credit'  => round((float) $f->total_credit, 2),
                'status'        => $f->status,
                'is_reversal'   => $f->reversal_of_id !== null,
                'source_type'   => $f->source_type,
                'lines'         => $satirlar->get($f->id, collect())->map(fn ($s) => [
                    'line_no'      => $s->line_no,
                    'account_code' => $s->account_code,
                    'account_name' => $s->account_name,
                    'description'  => $s->description,
                    'debit'        => round((float) $s->debit, 2),
                    'credit'       => round((float) $s->credit, 2),
                    'partner_id'   => $s->partner_id,
                    'dimensions'   => json_decode($s->dimensions ?? '{}', true),
                ])->values(),
            ])->values()->all(),
            'totals' => [
                'entries' => $fisler->count(),
                'debit'   => round($fisler->sum(fn ($f) => (float) $f->total_debit), 2),
                'credit'  => round($fisler->sum(fn ($f) => (float) $f->total_credit), 2),
            ],
            'meta' => $this->meta($company, ['from' => $bas, 'to' => $bit] + $filtre),
        ];
    }

    // ─── Ortak parçalar ─────────────────────────────────────────────

    /** Hareket sorgusu: iki rapor da aynı seçimi kullanıyor. */
    private function movementQuery(Company $company, string $bas, string $bit, array $hesapIdleri, array $filtre)
    {
        return DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->join('chart_accounts as a', 'a.id', '=', 'l.account_id')
            ->where('l.company_id', $company->id)
            ->whereIn('e.status', self::DEFTER_DURUMLARI)
            ->whereDate('e.posting_date', '>=', $bas)
            ->whereDate('e.posting_date', '<=', $bit)
            ->when($hesapIdleri, fn ($q) => $q->whereIn('l.account_id', $hesapIdleri))
            ->when(! empty($filtre['journal_type']), fn ($q) => $q->where('e.journal_type', $filtre['journal_type']))
            ->when(! empty($filtre['partner_id']), fn ($q) => $q->where('l.partner_id', $filtre['partner_id']))
            ->when(! empty($filtre['dimensions']), fn ($q) => $this->applyDimensions($q, $filtre['dimensions']))
            ->select([
                'l.id', 'l.account_id', 'l.line_no', 'l.debit', 'l.credit', 'l.description',
                'l.partner_id', 'l.dimensions', 'l.txn_currency', 'l.txn_debit', 'l.txn_credit', 'l.fx_rate',
                'e.id as entry_id', 'e.journal_no', 'e.journal_type', 'e.posting_date', 'e.document_date',
                'e.description as entry_description', 'e.reference', 'e.status as entry_status', 'e.reversal_of_id',
                'a.code as account_code', 'a.name as account_name',
            ]);
    }

    private function movementRow($s, float $bakiye): array
    {
        return [
            'line_id'           => $s->id,
            'entry_id'          => $s->entry_id,
            'journal_no'        => $s->journal_no,
            'journal_type'      => $s->journal_type,
            'posting_date'      => $s->posting_date,
            'document_date'     => $s->document_date,
            'account_code'      => $s->account_code,
            'account_name'      => $s->account_name,
            'description'       => $s->description ?: $s->entry_description,
            'reference'         => $s->reference,
            'debit'             => round((float) $s->debit, 2),
            'credit'            => round((float) $s->credit, 2),
            'running_balance'   => round($bakiye, 2),
            'partner_id'        => $s->partner_id,
            'dimensions'        => json_decode($s->dimensions ?? '{}', true),
            'txn_currency'      => $s->txn_currency,
            'txn_debit'         => $s->txn_debit  === null ? null : round((float) $s->txn_debit, 2),
            'txn_credit'        => $s->txn_credit === null ? null : round((float) $s->txn_credit, 2),
            'fx_rate'           => $s->fx_rate,
            'is_reversal'       => $s->reversal_of_id !== null,
        ];
    }

    /**
     * Hesapların açılış bakiyeleri, tek sorguda.
     * @return array<string, float> hesap_id => bakiye
     */
    private function openingBalances(Company $company, string $bas, array $hesapIdleri, array $boyutlar = []): array
    {
        return DB::table('journal_lines as l')
            ->join('journal_entries as e', 'e.id', '=', 'l.entry_id')
            ->where('l.company_id', $company->id)
            ->whereIn('e.status', self::DEFTER_DURUMLARI)
            ->whereDate('e.posting_date', '<', $bas)
            ->when($hesapIdleri, fn ($q) => $q->whereIn('l.account_id', $hesapIdleri))
            ->when($boyutlar, fn ($q) => $this->applyDimensions($q, $boyutlar))
            ->groupBy('l.account_id')
            ->get(['l.account_id', DB::raw('SUM(l.debit) - SUM(l.credit) AS bakiye')])
            ->mapWithKeys(fn ($s) => [$s->account_id => (float) $s->bakiye])
            ->all();
    }

    /** Hangi hesaplar raporlanacak: açık seçim, kod aralığı ya da tür. */
    private function resolveAccountIds(Company $company, array $filtre): array
    {
        if (! empty($filtre['account_ids'])) {
            return (array) $filtre['account_ids'];
        }

        $kisit = ! empty($filtre['account_type']) || ! empty($filtre['code_from']) || ! empty($filtre['code_to']);

        if (! $kisit) {
            return [];   // boş = tüm hesaplar
        }

        return ChartAccount::where('company_id', $company->id)
            ->when(! empty($filtre['account_type']), fn ($q) => $q->where('account_type', $filtre['account_type']))
            ->when(! empty($filtre['code_from']), fn ($q) => $q->where('code', '>=', $filtre['code_from']))
            ->when(! empty($filtre['code_to']),   fn ($q) => $q->where('code', '<=', $filtre['code_to']))
            ->pluck('id')
            ->all();
    }

    /**
     * Analitik boyut süzgeci (depo, maliyet merkezi, proje …).
     * dimensions jsonb olduğu için anahtar bazında karşılaştırıyoruz.
     */
    private function applyDimensions($query, array $boyutlar)
    {
        foreach ($boyutlar as $anahtar => $deger) {
            if ($deger === null || $deger === '') {
                continue;
            }
            // Anahtar adı istemciden geliyor; jsonb yoluna girmeden önce temizlenir.
            $temiz = preg_replace('/[^a-z0-9_]/i', '', (string) $anahtar);
            if ($temiz === '') {
                continue;
            }
            $query->where('l.dimensions->' . $temiz, (string) $deger);
        }

        return $query;
    }

    /**
     * Rapor tarih aralığı; verilmezse içinde bulunulan mali yıl.
     *
     * Tarihler Y-m-d biçimine zorlanıyor. Bu değerler sorgulara giriyor;
     * istemciden gelen metne olduğu gibi güvenilmez.
     */
    private function range(Company $company, array $filtre): array
    {
        $bugun = AppTime::today();

        $bas = $this->tarih($filtre['from'] ?? null)
            ?? $company->fiscalYearStart((int) $bugun->format('Y'))->toDateString();
        $bit = $this->tarih($filtre['to'] ?? null) ?? $bugun->toDateString();

        // Ters verilen aralık boş rapor üretir; sessizce düzeltiyoruz.
        return $bas <= $bit ? [$bas, $bit] : [$bit, $bas];
    }

    /** Geçerli bir tarihse Y-m-d döner, değilse null. */
    private function tarih(?string $deger): ?string
    {
        if ($deger === null || $deger === '') {
            return null;
        }

        try {
            return \Illuminate\Support\Carbon::parse($deger)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    /** Raporun kendi künyesi: hangi parametrelerle, hangi an için üretildi. */
    private function meta(Company $company, array $parametreler): array
    {
        return [
            'company_id'   => $company->id,
            'currency'     => $company->functionalCurrency(),
            'timezone'     => $company->timezone,
            'parameters'   => array_filter($parametreler, fn ($v) => $v !== null && $v !== '' && $v !== []),
            'as_of'        => $parametreler['to'] ?? null,
            'generated_at' => AppTime::now()->toIso8601String(),
        ];
    }

    private function esit(float $a, float $b): bool
    {
        return (int) round($a * 100) === (int) round($b * 100);
    }
}
