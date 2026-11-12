<?php

namespace App\Services\Platform;

use App\Models\PlatformIncident;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Kiracı şirketlerde oluşan hataları platform olay kaydına yazar.
 *
 * Kayıt yalnız platform panelinde görünür. Şirketin kendi aktivite logu
 * (activity_logs) bu kayıtlardan etkilenmez.
 *
 * Aynı hata tekrar ettiğinde yeni satır açılmaz; parmak izi eşleşirse sayaç
 * artar ve son bağlam güncellenir — tek bir döngüsel hata listeyi doldurmasın.
 */
class IncidentRecorder
{
    /** Bu durumlar gürültü: kullanıcı tarafında anlamlı bir sorun göstermiyor. */
    private const ATLANAN_DURUMLAR = [401, 404, 419, 429];

    /** Payload'da asla saklanmayacak alanlar. */
    private const GIZLI_ALANLAR = [
        'password', 'password_confirmation', 'current_password', 'new_password',
        'token', 'access_token', 'refresh_token', 'api_key', 'secret',
        'two_factor_secret', 'two_factor_code', 'signature', 'authorization',
        'card_number', 'cvv', 'iban',
    ];

    public function record(Throwable $e, Request $request, int $status): void
    {
        try {
            if (! $this->kaydedilmeli($e, $request, $status)) {
                return;
            }

            // Yanit tabanli yakalayici ayni olayi ikinci kez yazmasin.
            $request->attributes->set('incident_recorded', true);

            $kullanici = $request->user();
            $seviye    = $this->seviye($status);
            $alanlar   = $e instanceof ValidationException ? array_keys($e->errors()) : [];
            $iz        = $this->parmakIzi($e, $request, $status, $alanlar);

            $veri = [
                'level'           => $seviye,
                'source'          => $e instanceof ValidationException ? 'validation' : 'exception',
                'company_id'      => $kullanici?->company_id,
                'company_name'    => $kullanici?->company?->name,
                'user_id'         => $kullanici?->id,
                'user_name'       => $kullanici?->name,
                'user_email'      => $kullanici?->email,
                'exception_class' => get_class($e),
                'message'         => $this->mesaj($e),
                'file'            => $this->kisaDosya($e->getFile()),
                'line'            => $e->getLine(),
                'request_method'  => $request->method(),
                'request_path'    => '/' . ltrim($request->path(), '/'),
                'route_name'      => $request->route()?->getName(),
                'status_code'     => $status,
                'request_payload' => $this->maskeli($request),
                'ip_address'      => $request->ip(),
                'user_agent'      => Str::limit((string) $request->userAgent(), 250, ''),
                'trace'           => $this->kisaIz($e),
                'last_seen_at'    => now(),
                'suggested_fix'   => $this->oneri($e, $status, $alanlar),
            ];

            $mevcut = PlatformIncident::where('fingerprint', $iz)->first();

            if ($mevcut) {
                // Cozulmus bir hata tekrar ederse yeniden acilir: sorun surüyor.
                if ($mevcut->isResolved()) {
                    $veri['status'] = 'open';
                }

                $mevcut->fill($veri);
                $mevcut->occurrences = $mevcut->occurrences + 1;
                $mevcut->save();

                return;
            }

            PlatformIncident::create($veri + [
                'fingerprint'   => $iz,
                'first_seen_at' => now(),
                'status'        => 'open',
            ]);
        } catch (Throwable) {
            // Olay kaydi asla istegi bozmamali; yazilamazsa sessizce gecilir.
        }
    }

    /**
     * Istisna firlatmadan donen hata yanitlari (yetki reddi, kapali modul gibi).
     * Bu redler ara katmanlarda dogrudan JsonResponse olarak doner, exception
     * handler'a hic ugramaz; en sik yasanan "yanlis yaptilar" olaylari da bunlar.
     */
    public function recordResponse(Request $request, int $status, ?array $govde): void
    {
        try {
            if ($request->attributes->get('incident_recorded')) {
                return;
            }

            if (in_array($status, self::ATLANAN_DURUMLAR, true) || $status < 400 || ! $request->is('api/*')) {
                return;
            }

            $kullanici = $request->user();
            $kod       = $govde['code'] ?? null;
            $mesaj     = $govde['message'] ?? 'Hata yanıtı: HTTP ' . $status;

            $yol = preg_replace(
                ['/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/', '/\d+/'],
                ['{id}', '{n}'],
                '/' . ltrim($request->path(), '/'),
            );

            $iz = hash('sha256', implode('|', ['response', $kod, $request->method(), $yol, $status]));

            $veri = [
                'level'           => $status >= 500 ? 'critical' : 'warning',
                'source'          => 'exception',
                'company_id'      => $kullanici?->company_id,
                'company_name'    => $kullanici?->company?->name,
                'user_id'         => $kullanici?->id,
                'user_name'       => $kullanici?->name,
                'user_email'      => $kullanici?->email,
                'exception_class' => $kod ? 'Yanıt kodu: ' . $kod : null,
                'message'         => Str::limit($mesaj, 1000, ''),
                'request_method'  => $request->method(),
                'request_path'    => '/' . ltrim($request->path(), '/'),
                'route_name'      => $request->route()?->getName(),
                'status_code'     => $status,
                'request_payload' => $this->maskeli($request),
                'ip_address'      => $request->ip(),
                'user_agent'      => Str::limit((string) $request->userAgent(), 250, ''),
                'last_seen_at'    => now(),
                'suggested_fix'   => $this->koddanOneri($kod, $status),
            ];

            $mevcut = PlatformIncident::where('fingerprint', $iz)->first();

            if ($mevcut) {
                if ($mevcut->isResolved()) {
                    $veri['status'] = 'open';
                }

                $mevcut->fill($veri);
                $mevcut->occurrences = $mevcut->occurrences + 1;
                $mevcut->save();

                return;
            }

            PlatformIncident::create($veri + [
                'fingerprint'   => $iz,
                'first_seen_at' => now(),
                'status'        => 'open',
            ]);
        } catch (Throwable) {
            // Olay kaydi istegi bozmamali.
        }
    }

    /** Yanit kodlarina gore cozum onerisi. */
    private function koddanOneri(?string $kod, int $status): ?string
    {
        return match ($kod) {
            'MODULE_DISABLED' => 'Şirkette bu modül kapalı. Süper Admin → Şirketler → ilgili şirket → Modüller '
                . 'ekranından modülü açın; şirket paketine dahil değilse müşteriye bildirin.',
            'MODULE_PASSIVE' => 'Modülün bağlı olduğu departman pasife alınmış. Departmanı yeniden aktif edin '
                . 'ya da kullanıcıyı aktif bir departmana taşıyın.',
            'FORBIDDEN' => 'Kullanıcının rolünde bu işlem için izin yok. Şirket → Roller ekranından ilgili izni '
                . 'verin; izin bilerek kısıtlıysa kullanıcıya yetkili kişiye başvurmasını söyleyin.',
            'NO_COMPANY' => 'Hesap bir şirkete bağlı değil. Kullanıcıyı doğru şirkete atayın.',
            'VALIDATION_ERROR' => 'Gönderilen veri kurallara uymuyor. Formdaki zorunlu alanları ve biçim kurallarını '
                . 'kullanıcıya gösterin.',
            default => $status >= 500
                ? 'Sunucu hata yanıtı döndü. Sunucu loglarıyla birlikte inceleyin.'
                : 'İstek reddedildi. Yol, yetki ve gönderilen veriyi kontrol edin.',
        };
    }

    /** Platform ekibinin elle actigi kayit (ornegin telefonla gelen sikayet). */
    public function recordManual(array $veri): PlatformIncident
    {
        return PlatformIncident::create(array_merge([
            'fingerprint'   => 'manual:' . Str::uuid(),
            'level'         => 'warning',
            'source'        => 'manual',
            'first_seen_at' => now(),
            'last_seen_at'  => now(),
            'status'        => 'open',
        ], $veri));
    }

    private function kaydedilmeli(Throwable $e, Request $request, int $status): bool
    {
        if (in_array($status, self::ATLANAN_DURUMLAR, true)) {
            return false;
        }

        // Platform ekibinin kendi ekranlarindaki hatalar da kaydedilir; sirket
        // kullanicisi olmayan istekler (saglik kontrolu gibi) atlanir.
        return $request->is('api/*');
    }

    private function seviye(int $status): string
    {
        return match (true) {
            $status >= 500 => 'critical',
            $status === 422 => 'warning',
            $status === 403 => 'warning',
            default        => 'error',
        };
    }

    private function mesaj(Throwable $e): string
    {
        if ($e instanceof ValidationException) {
            $ilk = collect($e->errors())->flatten()->first();

            return Str::limit('Doğrulama hatası: ' . $ilk, 500, '');
        }

        return Str::limit($e->getMessage() ?: get_class($e), 1000, '');
    }

    /**
     * Ayni hatanin tekrarini bulan anahtar. Yol icindeki kimlikler sabitlenir,
     * yoksa her kayit icin ayri satir acilirdi.
     */
    private function parmakIzi(Throwable $e, Request $request, int $status, array $alanlar): string
    {
        $yol = preg_replace(
            ['/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/', '/\d+/'],
            ['{id}', '{n}'],
            '/' . ltrim($request->path(), '/'),
        );

        return hash('sha256', implode('|', [
            get_class($e),
            $this->kisaDosya($e->getFile()),
            $e->getLine(),
            $request->method(),
            $yol,
            $status,
            implode(',', $alanlar),
        ]));
    }

    private function kisaDosya(string $dosya): string
    {
        return str_replace(base_path() . DIRECTORY_SEPARATOR, '', $dosya);
    }

    private function kisaIz(Throwable $e): string
    {
        $satirlar = array_slice(explode("\n", $e->getTraceAsString()), 0, 25);

        return Str::limit(implode("\n", $satirlar), 8000, '');
    }

    private function maskeli(Request $request): array
    {
        $veri = $request->except(self::GIZLI_ALANLAR);

        array_walk_recursive($veri, function (&$deger, $anahtar) {
            if (in_array(strtolower((string) $anahtar), self::GIZLI_ALANLAR, true)) {
                $deger = '***';
            } elseif (is_string($deger) && strlen($deger) > 500) {
                // Base64 imza/foto gibi buyuk alanlar kayda girmez.
                $deger = '[' . strlen($deger) . ' karakter]';
            }
        });

        return $veri;
    }

    /**
     * Kayda otomatik ön öneri yazar. Operatörün elle gireceği çözüm notunun
     * yerine geçmez; ilk bakışta yön göstermek için.
     */
    private function oneri(Throwable $e, int $status, array $alanlar): ?string
    {
        $mesaj = strtolower($e->getMessage());

        if ($e instanceof ValidationException) {
            return 'Kullanıcı formu eksik ya da hatalı doldurmuş. Hatalı alanlar: '
                . implode(', ', $alanlar)
                . '. Alan etiketleri ve zorunluluk uyarıları net mi kontrol edin; '
                . 'alan gerçekten zorunlu değilse kuralı gevşetin.';
        }

        if ($status === 403) {
            return 'Kullanıcının rolünde bu işlem için izin yok ya da modül şirkette kapalı. '
                . 'Süper Admin → Şirketler → ilgili şirket → Modüller ve rol izinlerini kontrol edin.';
        }

        if ($e instanceof QueryException) {
            return match (true) {
                str_contains($mesaj, 'duplicate key') || str_contains($mesaj, 'unique constraint') =>
                    'Aynı kayıt ikinci kez eklenmiş (benzersizlik kuralı). Kullanıcı büyük olasılıkla '
                    . 'kaydet düğmesine iki kez bastı ya da aynı numarayı tekrar girdi. Mevcut kaydı gösterin.',
                str_contains($mesaj, 'foreign key') =>
                    'İlişkili kayıt yok ya da silinmiş. Önce bağlı kaydın (şirket, depo, ürün, cari) '
                    . 'durduğundan emin olun; silinmişse işlemi iptal edin.',
                str_contains($mesaj, 'not null') =>
                    'Zorunlu bir sütun boş gönderilmiş. Formda o alanın doldurulması isteniyor mu kontrol edin.',
                str_contains($mesaj, 'connection') || str_contains($mesaj, 'could not connect') =>
                    'Veritabanı bağlantısı kurulamadı. Sunucuda PostgreSQL servisini ve bağlantı ayarlarını kontrol edin.',
                default =>
                    'Veritabanı sorgusu hata verdi. Sorgu ve gönderilen veriyi inceleyin; '
                    . 'şema ile kod uyumsuzluğu varsa eksik migration olabilir.',
            };
        }

        if ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
            return 'Kullanıcı silinmiş ya da başka şirkete ait bir kaydı açmaya çalıştı. '
                . 'Listeyi yenilemesini isteyin; bağlantı eski olabilir.';
        }

        if ($e instanceof \TypeError || $e instanceof \ErrorException || $e instanceof \ArgumentCountError) {
            return 'Kod hatası: beklenen veri tipi gelmemiş. Dosya ve satır bilgisiyle ilgili yeri düzeltin, '
                . 'düzeltme yayına alınana kadar kullanıcıya geçici yol gösterin.';
        }

        if (str_contains($mesaj, 'permission denied') || str_contains($mesaj, 'disk')) {
            return 'Dosya yazma/okuma izni sorunu. Sunucuda storage dizini izinlerini kontrol edin.';
        }

        if ($status >= 500) {
            return 'Sunucu hatası. Dosya/satır ve iz kaydına bakıp düzeltin; '
                . 'tekrar ediyorsa (sayaç artıyorsa) öncelik verin.';
        }

        return null;
    }
}
