<?php

namespace App\Services\Accounting;

use App\Models\Accounting\BankAccount;
use App\Models\Accounting\CashCount;
use App\Support\AccountRole;
use App\Support\AppTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Günlük kasa sayımı.
 *
 * Fark varsa düzeltme fişi üretilir: sayılan tutar defter bakiyesine
 * eşitlenir, fark sayım farkı hesabına yazılır. Farkı sessizce yok saymak
 * kasayı defterle ayrıştırır.
 */
class CashCountService
{
    public function __construct(
        private readonly AccountRoleService $roles,
        private readonly JournalService $journal,
        private readonly AuditService $audit,
    ) {}

    /**
     * Sayımı kaydeder; fark varsa düzeltme fişi üretir.
     *
     * @param  array  $kupurler  Kupür dökümü: ['50' => 3, '20' => 10]
     */
    public function record(BankAccount $kasa, float $sayilan, ?string $tarih = null, array $kupurler = [], ?string $not = null): CashCount
    {
        if (! $kasa->isCash()) {
            throw ValidationException::withMessages([
                'bank_account_id' => "{$kasa->name} bir kasa hesabı değil; sayım yalnız kasada yapılır.",
            ]);
        }

        $gun = $tarih ?: AppTime::today()->toDateString();

        $mevcut = CashCount::where('bank_account_id', $kasa->id)->whereDate('count_date', $gun)->first();

        if ($mevcut) {
            throw ValidationException::withMessages([
                'count_date' => "{$kasa->name} için $gun tarihinde sayım zaten yapılmış.",
            ]);
        }

        // Kupür dökümü verildiyse toplamı sayılan tutarla tutmalı.
        if ($kupurler) {
            $kupurToplam = round(array_sum(array_map(
                fn ($adet, $deger) => (float) $deger * (int) $adet,
                $kupurler, array_keys($kupurler),
            )), 2);

            if (abs($kupurToplam - $sayilan) > 0.01) {
                throw ValidationException::withMessages([
                    'denominations' => sprintf('Kupür toplamı (%s) sayılan tutarla (%s) uyuşmuyor.',
                        number_format($kupurToplam, 2, ',', '.'), number_format($sayilan, 2, ',', '.')),
                ]);
            }
        }

        $defter = $kasa->ledgerBalance($gun);
        $fark   = round($sayilan - $defter, 2);

        return DB::transaction(function () use ($kasa, $gun, $defter, $sayilan, $fark, $kupurler, $not) {
            $sayim = CashCount::create([
                'company_id'      => $kasa->company_id,
                'bank_account_id' => $kasa->id,
                'count_date'      => $gun,
                'ledger_balance'  => $defter,
                'counted_amount'  => $sayilan,
                'difference'      => $fark,
                'denominations'   => $kupurler,
                'note'            => $not,
                'counted_by'      => auth()->id(),
            ]);

            if (abs($fark) >= 0.01) {
                $sayim->forceFill(['journal_entry_id' => $this->postDifference($kasa, $gun, $fark, $not)])->save();
            }

            $this->audit->logModel($sayim, 'cash_count.recorded', [
                'account'    => $kasa->code,
                'ledger'     => $defter,
                'counted'    => $sayilan,
                'difference' => $fark,
            ], $not);

            return $sayim->fresh();
        });
    }

    /**
     * Sayım farkı fişi.
     *
     * Fazla varsa kasa borçlanır ve fark geliri alacaklanır; eksikse tersi.
     */
    private function postDifference(BankAccount $kasa, string $gun, float $fark, ?string $not): string
    {
        $company = $kasa->company;
        $fazla   = $fark > 0;
        $mutlak  = abs($fark);

        $farkHesabi = $this->roles->accountIdOrNull($company, AccountRole::INVENTORY_VARIANCE)
            ?? $this->roles->accountId($company, AccountRole::DEFAULT_EXPENSE);

        $fis = $this->journal->createDraft($company, [
            'journal_type' => 'cash',
            'posting_date' => $gun,
            'description'  => "Kasa sayım farkı — {$kasa->name}",
            'source_type'  => 'CASH_COUNT',
            'memo'         => $not ?: 'Kasa sayımında tespit edilen fark',
        ], [
            [
                'account_id'  => $kasa->account_id,
                'description' => $fazla ? 'Kasa fazlası' : 'Kasa eksiği',
                'debit'       => $fazla ? $mutlak : 0.0,
                'credit'      => $fazla ? 0.0 : $mutlak,
            ],
            [
                'account_id'  => $farkHesabi,
                'description' => 'Sayım farkı',
                'debit'       => $fazla ? 0.0 : $mutlak,
                'credit'      => $fazla ? $mutlak : 0.0,
            ],
        ]);

        $fis = $fis->fresh();
        $fis->load('lines.account');
        $fis->forceFill(['status' => 'approved', 'approved_by' => auth()->id(),
                         'approved_at' => now(), 'content_hash' => $fis->computeContentHash()])->save();

        return $this->journal->post($fis->fresh())->id;
    }

    /** Kasa durumu: defter bakiyesi, son sayım, limit aşımı. */
    public function status(BankAccount $kasa): array
    {
        $bakiye = $kasa->ledgerBalance();
        $son    = CashCount::where('bank_account_id', $kasa->id)->orderByDesc('count_date')->first();

        return [
            'bank_account'    => ['id' => $kasa->id, 'code' => $kasa->code, 'name' => $kasa->name],
            'ledger_balance'  => $bakiye,
            'currency'        => $kasa->currency,
            'cash_limit'      => $kasa->cash_limit === null ? null : (float) $kasa->cash_limit,
            'exceeds_limit'   => $kasa->exceedsCashLimit($bakiye),
            'last_count'      => $son ? [
                'date'       => $son->count_date->toDateString(),
                'counted'    => round((float) $son->counted_amount, 2),
                'difference' => round((float) $son->difference, 2),
            ] : null,
            'days_since_count' => $son ? (int) $son->count_date->diffInDays(AppTime::today()) : null,
        ];
    }
}
