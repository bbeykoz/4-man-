<?php

namespace App\Services\Accounting;

use App\Models\Accounting\AccountingSequence;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Yasal numara üreteci.
 *
 * Numara post anında atanır ve atlamamalıdır. Sayaç satırı FOR UPDATE ile
 * kilitlenerek artırılıyor; iki eşzamanlı post aynı numarayı alamaz.
 *
 * Çağıran zaten bir transaction içinde olmalı — numara alınıp post başarısız
 * olursa numara boşa gitmesin diye aynı transaction'da geri alınır.
 */
class SequenceService
{
    /**
     * Sıradaki numarayı üretir: ön ek + yıl + sıra. Örnek: YEV-2026-00001.
     *
     * @param  string  $key     Sayaç anahtarı, örn. "journal:sales".
     * @param  string  $prefix  Numara ön eki.
     */
    public function next(string $companyId, string $key, string $prefix, int $year, int $padding = 5): string
    {
        $sayac = $this->lockOrCreate($companyId, $key, $prefix, $year, $padding);

        $sira = $sayac->next_value;

        DB::table('accounting_sequences')
            ->where('id', $sayac->id)
            ->update(['next_value' => $sira + 1, 'updated_at' => now()]);

        return sprintf('%s-%d-%0' . $sayac->padding . 'd', $sayac->prefix, $year, $sira);
    }

    /**
     * Sayaç satırını kilitler; yoksa oluşturur.
     *
     * Yarış durumu: iki istek aynı anda ilk numarayı isterse ikisi de satırı
     * bulamaz ve ikisi de eklemeye çalışır. Benzersiz kısıt birini reddeder;
     * o istek satırı yeniden okur.
     */
    private function lockOrCreate(string $companyId, string $key, string $prefix, int $year, int $padding): AccountingSequence
    {
        $sorgu = fn () => AccountingSequence::query()
            ->where('company_id', $companyId)
            ->where('key', $key)
            ->where('year', $year)
            ->lockForUpdate()
            ->first();

        if ($sayac = $sorgu()) {
            return $sayac;
        }

        try {
            AccountingSequence::create([
                'id'         => (string) Str::uuid(),
                'company_id' => $companyId,
                'key'        => $key,
                'year'       => $year,
                'prefix'     => $prefix,
                'next_value' => 1,
                'padding'    => $padding,
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // Başka bir istek önce davrandı; aşağıda kilitleyerek okuyoruz.
        }

        return $sorgu();
    }

    /** Sayaç bozulmadan sıradaki numaranın ne olacağını gösterir (önizleme). */
    public function peek(string $companyId, string $key, string $prefix, int $year, int $padding = 5): string
    {
        $sayac = AccountingSequence::query()
            ->where('company_id', $companyId)->where('key', $key)->where('year', $year)
            ->first();

        return sprintf(
            '%s-%d-%0' . ($sayac->padding ?? $padding) . 'd',
            $sayac->prefix ?? $prefix,
            $year,
            $sayac->next_value ?? 1,
        );
    }
}
