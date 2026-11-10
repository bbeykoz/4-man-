<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\JournalStatus;
use App\Enums\Accounting\JournalType;
use App\Models\Accounting\AccountingPeriod;
use App\Models\Accounting\ChartAccount;
use App\Models\Accounting\JournalEntry;
use App\Models\Accounting\TaxCode;
use App\Models\Company;
use Illuminate\Support\Facades\DB;

/**
 * Fiş doğrulayıcı.
 *
 * Hata listesi döndürür, exception atmaz: kullanıcıya tüm sorunları birden
 * göstermek istiyoruz, ilk hatada durmak değil. Post eden servis bu listeyi
 * boş görmeden deftere yazmaz.
 */
class JournalValidator
{
    /** @return array<int, array{field: string, message: string}> */
    public function validate(JournalEntry $fis): array
    {
        $hatalar = [];

        $satirlar = $fis->relationLoaded('lines') ? $fis->lines : $fis->lines()->with('account')->get();

        // ─── Satır sayısı ───────────────────────────────────────────
        if ($satirlar->count() < 2) {
            $hatalar[] = ['field' => 'lines', 'message' => 'Fiş en az iki satır içermelidir.'];
        }

        // ─── Denge ──────────────────────────────────────────────────
        $borc   = $this->micro($satirlar->sum(fn ($s) => (float) $s->debit));
        $alacak = $this->micro($satirlar->sum(fn ($s) => (float) $s->credit));

        if ($borc !== $alacak) {
            $fark = number_format(($borc - $alacak) / 1_000_000, 2, ',', '.');
            $hatalar[] = [
                'field'   => 'lines',
                'message' => "Borç ve alacak toplamları eşit değil. Fark: {$fark} {$fis->currency}.",
            ];
        }

        if ($borc === 0 && $alacak === 0) {
            $hatalar[] = ['field' => 'lines', 'message' => 'Fiş toplamı sıfır olamaz.'];
        }

        // ─── Para birimi ────────────────────────────────────────────
        $sirket = $fis->relationLoaded('company') ? $fis->company : Company::find($fis->company_id);
        $defter = $sirket?->functionalCurrency();

        if ($defter && $fis->currency !== $defter) {
            $hatalar[] = [
                'field'   => 'currency',
                'message' => "Fiş defter para biriminde olmalı ($defter). Yabancı para tutarı satır bazında saklanır.",
            ];
        }

        // ─── Dönem ──────────────────────────────────────────────────
        $hatalar = array_merge($hatalar, $this->validatePeriod($fis));

        // ─── Satır bazlı kontroller ─────────────────────────────────
        foreach ($satirlar as $satir) {
            $hatalar = array_merge($hatalar, $this->validateLine($fis, $satir));
        }

        return $hatalar;
    }

    private function validatePeriod(JournalEntry $fis): array
    {
        $donem = AccountingPeriod::query()
            ->where('company_id', $fis->company_id)
            ->covering($fis->posting_date->toDateString())
            ->first();

        if (! $donem) {
            return [[
                'field'   => 'posting_date',
                'message' => "{$fis->posting_date->format('d.m.Y')} tarihini kapsayan muhasebe dönemi tanımlı değil.",
            ]];
        }

        if (! $donem->accepts($fis->journal_type)) {
            return [[
                'field'   => 'posting_date',
                'message' => "{$donem->name} dönemi {$donem->status->label()}; bu türde fiş kabul etmiyor.",
            ]];
        }

        return [];
    }

    private function validateLine(JournalEntry $fis, $satir): array
    {
        $hatalar = [];
        $no      = $satir->line_no;

        $borc   = (float) $satir->debit;
        $alacak = (float) $satir->credit;

        if ($borc > 0 && $alacak > 0) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: borç ve alacak aynı anda dolu olamaz."];
        }

        if ($borc <= 0 && $alacak <= 0) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: borç ya da alacak tutarı girilmeli."];
        }

        if ($borc < 0 || $alacak < 0) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: tutar negatif olamaz. Ters yöne yazın."];
        }

        /** @var ChartAccount|null $hesap */
        $hesap = $satir->relationLoaded('account') ? $satir->account : ChartAccount::find($satir->account_id);

        if (! $hesap) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: hesap bulunamadı."];
            return $hatalar;
        }

        if ($hesap->company_id !== $fis->company_id) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: hesap başka bir şirkete ait."];
        }

        // Hesap, fişin deftere girdiği tarihte kullanılabilir olmalı.
        $tarih = $fis->posting_date->toDateString();
        $acik  = $hesap->is_active
            && (! $hesap->active_from || $hesap->active_from->toDateString() <= $tarih)
            && (! $hesap->active_to   || $hesap->active_to->toDateString()   >= $tarih);

        if (! $acik) {
            $hatalar[] = [
                'field'   => "lines.$no",
                'message' => "Satır $no: {$hesap->displayName()} hesabı {$fis->posting_date->format('d.m.Y')} tarihinde kullanılamaz.",
            ];
        }

        // Kontrol hesabına elle fiş yazılamaz; kaydı alt defter üretir.
        // Açılış fişi istisna: devir bakiyeleri kontrol hesaplarına elle girilir,
        // o sırada henüz alt defter hareketi yoktur.
        if ($hesap->is_control
            && $fis->source_type === 'MANUAL'
            && $fis->journal_type !== JournalType::Opening) {
            $hatalar[] = [
                'field'   => "lines.$no",
                'message' => "Satır $no: {$hesap->displayName()} bir kontrol hesabı; elle fiş yazılamaz.",
            ];
        }

        // Kontrol hesabı cari kimliği istiyor. Artık gerçek cari kartları var,
        // bu yüzden satırda partner_id zorunlu. Tek istisna: belgeden gelen
        // fişte belge bir cari karta bağlıysa kimlik oradan kuruluyor.
        if ($hesap->requires_partner && empty($satir->partner_id) && ! $this->documentIdentifiesPartner($fis)) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: {$hesap->displayName()} hesabı cari seçimi istiyor."];
        }

        // Cari başka şirkete ait olamaz.
        if ($satir->partner_id) {
            $gecerli = DB::table('business_partners')
                ->where('id', $satir->partner_id)
                ->where('company_id', $fis->company_id)
                ->whereNull('deleted_at')
                ->exists();

            if (! $gecerli) {
                $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: cari bulunamadı ya da başka bir şirkete ait."];
            }
        }

        foreach ($hesap->required_dimensions ?? [] as $boyut) {
            if (blank(data_get($satir->dimensions, $boyut))) {
                $hatalar[] = [
                    'field'   => "lines.$no",
                    'message' => "Satır $no: {$hesap->displayName()} hesabı '{$boyut}' boyutunu zorunlu tutuyor.",
                ];
            }
        }

        // Vergi kodu: fişin deftere girdiği tarihte geçerli ve onaylı olmalı.
        // Mevzuat değişince eski kod kapanır; kapanmış koda yeni fiş yazılamaz.
        if ($satir->tax_code_id) {
            $hatalar = array_merge($hatalar, $this->validateTaxCode($fis, $satir, $no));
        }

        // Yabancı para satırında kur ve kaynağı zorunlu; sonradan kur tablosu
        // değişse bile kayıt kendi kurunu taşımalı.
        if ($satir->txn_currency && $satir->txn_currency !== $fis->currency) {
            if (empty($satir->fx_rate) || (float) $satir->fx_rate <= 0) {
                $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: yabancı para satırında kur zorunlu."];
            }
            if (empty($satir->fx_rate_date)) {
                $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: kur tarihi zorunlu."];
            }
            if (empty($satir->fx_rate_source)) {
                $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: kur kaynağı zorunlu."];
            }
        }

        return $hatalar;
    }

    /** Post edilmeye hazır mı: doğrulama temiz ve durum uygun. */
    public function canPost(JournalEntry $fis): array
    {
        $hatalar = $this->validate($fis);

        if (! $fis->status->canTransitionTo(JournalStatus::Posted)) {
            $hatalar[] = [
                'field'   => 'status',
                'message' => "{$fis->status->label()} durumundaki fiş deftere işlenemez; önce onaylanmalı.",
            ];
        }

        return $hatalar;
    }

    /** Satırdaki vergi kodunun tarih, onay ve tutar tutarlılığı. */
    private function validateTaxCode(JournalEntry $fis, $satir, int $no): array
    {
        $hatalar = [];
        $tarih   = $fis->posting_date->toDateString();

        /** @var TaxCode|null $kod */
        $kod = TaxCode::find($satir->tax_code_id);

        if (! $kod) {
            return [['field' => "lines.$no", 'message' => "Satır $no: vergi kodu bulunamadı."]];
        }

        if ($kod->company_id !== $fis->company_id) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: vergi kodu başka bir şirkete ait."];
        }

        if (! $kod->isEffectiveOn($tarih)) {
            $aralik = $kod->valid_from->format('d.m.Y') . ' – ' . ($kod->valid_to?->format('d.m.Y') ?? 'açık');
            $hatalar[] = [
                'field'   => "lines.$no",
                'message' => "Satır $no: {$kod->code} vergi kodu {$fis->posting_date->format('d.m.Y')} tarihinde geçerli değil (geçerlilik: $aralik).",
            ];
        }

        if (! $kod->isApproved()) {
            $hatalar[] = [
                'field'   => "lines.$no",
                'message' => "Satır $no: {$kod->code} vergi kodu henüz onaylanmamış. Oran ve kapsam yerel danışmanca onaylanmadan fişte kullanılamaz.",
            ];
        }

        // Matrah ve vergi birlikte yazılır; biri varsa diğeri de olmalı.
        $matrah = $satir->tax_base;
        $vergi  = $satir->tax_amount;

        if ($matrah !== null && $vergi === null) {
            $hatalar[] = ['field' => "lines.$no", 'message' => "Satır $no: vergi matrahı girilmiş ama vergi tutarı yok."];
        }

        // Yazılan vergi, koddaki oranla hesaplanandan sapıyorsa uyar. 1 kuruş
        // tolerans: satır bazlı yuvarlama farkı meşru.
        if ($matrah !== null && $vergi !== null && $kod->treatment->sellerCharges()) {
            $beklenen = round((float) $matrah * (float) $kod->rate / 100, 2);
            if (abs($beklenen - (float) $vergi) > 0.01) {
                $hatalar[] = [
                    'field'   => "lines.$no",
                    'message' => sprintf('Satır %d: vergi tutarı orana uymuyor. %s matrah × %%%s = %s beklenirken %s yazılmış.',
                        $no,
                        number_format((float) $matrah, 2, ',', '.'),
                        rtrim(rtrim(number_format((float) $kod->rate, 2, ',', ''), '0'), ','),
                        number_format($beklenen, 2, ',', '.'),
                        number_format((float) $vergi, 2, ',', '.')),
                ];
            }
        }

        return $hatalar;
    }

    /** Fiş bir belgeden geliyor ve belge karşı tarafı tanımlıyor mu. */
    private function documentIdentifiesPartner(JournalEntry $fis): bool
    {
        if ($fis->source_type !== 'DOCUMENT' || ! $fis->source_id) {
            return false;
        }

        return DB::table('documents')
            ->where('id', $fis->source_id)
            ->where(fn ($q) => $q->whereNotNull('partner_id')->orWhereNotNull('partner_name'))
            ->exists();
        // Not: partner_name hâlâ kabul ediliyor çünkü Faz 4'te taşınan eski
        // belgelerde cari kartı yok, yalnız unvan var. Taşınan belgeler
        // carilere bağlandıktan sonra bu gevşeklik kaldırılabilir.
    }

    /** Ondalık karşılaştırmasını tam sayıya indirger; float eşitliği güvenilmez. */
    private function micro(float $tutar): int
    {
        return (int) round($tutar * 1_000_000);
    }
}
