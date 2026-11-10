<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\JournalStatus;
use App\Enums\Accounting\PeriodStatus;
use App\Models\Accounting\AccountingPeriod;
use App\Models\Accounting\JournalEntry;
use App\Models\Company;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Muhasebe dönemi yönetimi.
 *
 * Dönemler mali yıl başlangıç ayına göre üretilir; takvim yılı kullanmayan
 * şirketlerde Ocak'tan başlamaz. Kapatma, açık fiş kalmadığını doğrular.
 */
class PeriodService
{
    public function __construct(private readonly AuditService $audit) {}

    /**
     * Bir mali yılın aylık dönemlerini üretir.
     *
     * Var olan dönemlere dokunmaz; yıl kısmen açılmışsa eksikleri tamamlar.
     *
     * @return int Oluşturulan dönem sayısı.
     */
    public function generateYear(Company $company, int $yil): int
    {
        $baslangic = $company->fiscalYearStart($yil);
        $sayac     = 0;

        for ($i = 0; $i < 12; $i++) {
            $ay   = Carbon::parse($baslangic)->addMonths($i);
            $bas  = $ay->copy()->startOfMonth()->toDateString();
            $bit  = $ay->copy()->endOfMonth()->toDateString();

            $varMi = AccountingPeriod::where('company_id', $company->id)
                ->where('start_date', $bas)->where('end_date', $bit)->exists();

            if ($varMi) {
                continue;
            }

            AccountingPeriod::create([
                'company_id' => $company->id,
                'name'       => $ay->format('Y-m'),
                'start_date' => $bas,
                'end_date'   => $bit,
                'status'     => PeriodStatus::Open->value,
            ]);

            $sayac++;
        }

        if ($sayac > 0) {
            $this->audit->log(
                companyId: $company->id, action: 'period.generated',
                entityType: 'AccountingPeriod', payload: ['year' => $yil, 'created' => $sayac],
            );
        }

        return $sayac;
    }

    /**
     * Dönemi kapanış moduna alır: artık yalnız kapanış türü fişler girer
     * (kur değerlemesi, amortisman, maliyet, vergi düzeltmesi).
     */
    public function startClosing(AccountingPeriod $donem): AccountingPeriod
    {
        $this->assertStatus($donem, [PeriodStatus::Open]);

        $donem->update(['status' => PeriodStatus::Closing->value]);
        $this->audit->logModel($donem, 'period.closing_started');

        return $donem->fresh();
    }

    /**
     * Dönemi kapatır.
     *
     * Tamamlanmamış fiş varsa kapatmaz: taslakta kalan bir fiş kapandıktan
     * sonra deftere giremez, sessizce kaybolur.
     */
    public function close(AccountingPeriod $donem): AccountingPeriod
    {
        $this->assertStatus($donem, [PeriodStatus::Open, PeriodStatus::Closing]);

        $acikFisler = JournalEntry::where('period_id', $donem->id)
            ->whereIn('status', [
                JournalStatus::Draft->value,
                JournalStatus::Validated->value,
                JournalStatus::PendingApproval->value,
                JournalStatus::Approved->value,
            ])
            ->count();

        if ($acikFisler > 0) {
            throw ValidationException::withMessages([
                'period' => "{$donem->name} döneminde deftere işlenmemiş $acikFisler fiş var. Kapatmadan önce işleyin ya da iptal edin.",
            ]);
        }

        $dengesiz = $this->unbalancedCount($donem);
        if ($dengesiz > 0) {
            throw ValidationException::withMessages([
                'period' => "{$donem->name} döneminde $dengesiz dengesiz fiş var. Kapatma engellendi.",
            ]);
        }

        $donem->update([
            'status'    => PeriodStatus::Closed->value,
            'closed_by' => auth()->id(),
            'closed_at' => now(),
        ]);

        $this->audit->logModel($donem, 'period.closed', $this->totals($donem));

        return $donem->fresh();
    }

    /** Kapalı dönemi gerekçeyle yeniden açar. Kilitli dönem bu yoldan açılmaz. */
    public function reopen(AccountingPeriod $donem, string $gerekce): AccountingPeriod
    {
        if ($donem->status === PeriodStatus::Locked) {
            throw ValidationException::withMessages([
                'period' => "{$donem->name} dönemi kilitli. Kilitli dönem bu işlemle açılamaz.",
            ]);
        }

        $this->assertStatus($donem, [PeriodStatus::Closed, PeriodStatus::Closing]);

        if (trim($gerekce) === '') {
            throw ValidationException::withMessages(['reason' => 'Dönemi yeniden açma gerekçesi zorunludur.']);
        }

        $donem->update([
            'status'        => PeriodStatus::Open->value,
            'reopened_by'   => auth()->id(),
            'reopened_at'   => now(),
            'reopen_reason' => $gerekce,
        ]);

        $this->audit->logModel($donem, 'period.reopened', [], $gerekce);

        return $donem->fresh();
    }

    /** Dönemi kilitler: beyan verilmiş ya da denetlenmiş dönem. */
    public function lock(AccountingPeriod $donem): AccountingPeriod
    {
        $this->assertStatus($donem, [PeriodStatus::Closed]);

        $donem->update(['status' => PeriodStatus::Locked->value]);
        $this->audit->logModel($donem, 'period.locked');

        return $donem->fresh();
    }

    /** Dönemdeki deftere işlenmiş toplamlar. */
    public function totals(AccountingPeriod $donem): array
    {
        $satir = DB::table('journal_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.entry_id')
            ->where('journal_entries.period_id', $donem->id)
            ->whereIn('journal_entries.status', [JournalStatus::Posted->value, JournalStatus::Reversed->value])
            ->selectRaw('COALESCE(SUM(journal_lines.debit),0) AS borc, COALESCE(SUM(journal_lines.credit),0) AS alacak, COUNT(DISTINCT journal_entries.id) AS fis')
            ->first();

        return [
            'entries' => (int) ($satir->fis ?? 0),
            'debit'   => (string) ($satir->borc ?? '0'),
            'credit'  => (string) ($satir->alacak ?? '0'),
        ];
    }

    /** Dengesiz fiş sayısı; normalde sıfır olmalı, kapanışta son kontrol. */
    private function unbalancedCount(AccountingPeriod $donem): int
    {
        return DB::table('journal_entries')
            ->where('period_id', $donem->id)
            ->whereIn('status', [JournalStatus::Posted->value, JournalStatus::Reversed->value])
            ->whereColumn('total_debit', '!=', 'total_credit')
            ->count();
    }

    /** @param  PeriodStatus[]  $izinli */
    private function assertStatus(AccountingPeriod $donem, array $izinli): void
    {
        if (! in_array($donem->status, $izinli, true)) {
            $adlar = implode(', ', array_map(fn (PeriodStatus $s) => $s->label(), $izinli));
            throw ValidationException::withMessages([
                'period' => "{$donem->name} dönemi {$donem->status->label()}; bu işlem için {$adlar} olmalı.",
            ]);
        }
    }
}
