<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Şirkete ülke, defter para birimi, saat dilimi ve mali yıl alanları.
 *
 * Muhasebe modülü ülke bağımsız bir çekirdek üstüne kuruluyor; ülkeye özgü her
 * şey (hesap planı şablonu, vergi kodları, resmi çıktı dili) buradaki
 * country_code üzerinden seçiliyor. Saat dilimi şirkete taşınıyor çünkü
 * Bulgaristan Europe/Sofia, Türkiye Europe/Istanbul kullanıyor ve gün sınırı
 * hesapları (dönem, rapor, SKT) buna bağlı.
 *
 * Varsayılanlar mevcut kurulumu bozmayacak şekilde seçildi: TR / TRY /
 * Europe/Istanbul, yani bugünkü davranışın aynısı.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            // ISO 3166-1 alpha-2. Ülke paketini bu alan seçiyor.
            $table->string('country_code', 2)->default('TR')->after('slug');
            // Defter (fonksiyonel) para birimi, ISO 4217. İşlem para biriminden ayrı.
            $table->string('functional_currency', 3)->default('TRY')->after('country_code');
            $table->string('timezone', 64)->default('Europe/Istanbul')->after('functional_currency');
            // Mali yılın başladığı ay (1-12). Takvim yılı kullanan ülkelerde 1.
            $table->unsignedTinyInteger('fiscal_year_start_month')->default(1)->after('timezone');
            // Uygulanan raporlama çerçevesi: national, ifrs_sme, ifrs_full.
            $table->string('accounting_framework', 30)->default('national')->after('fiscal_year_start_month');
            // Resmi belgelerin dili (bg, tr, en). Arayüz dilinden ayrı.
            $table->string('document_locale', 5)->default('tr')->after('accounting_framework');
            // Ülkeye özgü tüzel kişi kimliği: Bulgaristan EIK/BULSTAT, Türkiye vergi no.
            $table->string('registration_number', 30)->nullable()->after('tax_number');
            // AB KDV numarası (BG123456789 gibi). tax_number'dan ayrı tutuluyor.
            $table->string('vat_number', 20)->nullable()->after('registration_number');
            // KDV mükellefiyeti: kayıtlı değilse KDV kodları ve defterleri kapalı kalır.
            $table->boolean('vat_registered')->default(false)->after('vat_number');
            $table->date('vat_registered_at')->nullable()->after('vat_registered');

            $table->index('country_code');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropIndex(['country_code']);
            $table->dropColumn([
                'country_code', 'functional_currency', 'timezone',
                'fiscal_year_start_month', 'accounting_framework', 'document_locale',
                'registration_number', 'vat_number', 'vat_registered', 'vat_registered_at',
            ]);
        });
    }
};
