<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Kur tablosu ve dönem sonu yeniden değerleme.
 *
 * Kur bir kez kaydedilir ve değişmez: fişler kendi kurlarını satırda taşıyor
 * (Faz 1), tablo kaynak ve tarihçedir. Sonradan kur düzeltilse bile geçmiş
 * fişler sapmaz.
 *
 * Sabit kur çiftleri (EUR/BGN 1.95583) ayrı işaretleniyor; bunlar mevzuatla
 * belirli, piyasa kuru değil, ve asla elle değiştirilemez.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exchange_rates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // Kur şirkete değil sisteme ait; aynı gün aynı kaynak herkes için aynı.
            $table->foreignUuid('company_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('base_currency', 3);        // 1 birim bu para
            $table->string('quote_currency', 3);       // kaç birim bu para eder
            $table->date('rate_date');
            // Kur 10 hane: 1 EUR = 1.9558300000 BGN gibi sabit kurlar tam saklanmalı.
            $table->decimal('rate', 20, 10);
            $table->string('source', 30);              // BNB, TCMB, ECB, MANUAL, FIXED
            $table->boolean('is_fixed')->default(false);
            $table->text('note')->nullable();
            // Elle girilen kur yetki ve gerekçe ister (doküman §3.1).
            $table->foreignUuid('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('retrieved_at')->useCurrent();
            $table->timestamps();

            $table->unique(['company_id', 'base_currency', 'quote_currency', 'rate_date', 'source']);
            $table->index(['base_currency', 'quote_currency', 'rate_date']);
        });

        // Dönem sonu yeniden değerleme çalıştırmaları.
        Schema::create('fx_revaluations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->date('valuation_date');
            $table->string('currency', 3);             // hangi yabancı para değerlendi
            $table->decimal('rate_used', 20, 10);
            $table->string('rate_source', 30);
            // Gerçekleşmemiş kur farkı; kapanmamış bakiyelerden doğar.
            $table->decimal('gain', 20, 6)->default(0);
            $table->decimal('loss', 20, 6)->default(0);
            $table->decimal('net_effect', 20, 6)->default(0);
            $table->unsignedInteger('item_count')->default(0);
            $table->jsonb('detail')->default('[]');
            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            // Sonraki dönemin başında ters çevrilir; gerçekleşmemiş fark taşınmaz.
            $table->foreignUuid('reversal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['company_id', 'valuation_date', 'currency']);
            $table->index(['company_id', 'valuation_date']);
        });

        // Aynı gün aynı çift için elle kur, resmî kurun üstüne yazılamasın diye
        // sabit kurlar ayrıca korunuyor. plpgsql trigger PostgreSQL'e özeldir;
        // SQLite'ta no-op geçilir.
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION exchange_rates_guard() RETURNS trigger AS $$
            BEGIN
                IF (TG_OP = 'UPDATE' AND OLD.is_fixed) THEN
                    IF NEW.rate IS DISTINCT FROM OLD.rate THEN
                        RAISE EXCEPTION 'Sabit kur değiştirilemez (% / %, %).',
                            OLD.base_currency, OLD.quote_currency, OLD.rate_date;
                    END IF;
                END IF;

                IF (TG_OP = 'DELETE' AND OLD.is_fixed) THEN
                    RAISE EXCEPTION 'Sabit kur silinemez (% / %).', OLD.base_currency, OLD.quote_currency;
                END IF;

                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER exchange_rates_guard_trg
                BEFORE UPDATE OR DELETE ON exchange_rates
                FOR EACH ROW EXECUTE FUNCTION exchange_rates_guard();
            SQL);
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::unprepared('DROP TRIGGER IF EXISTS exchange_rates_guard_trg ON exchange_rates');
            DB::unprepared('DROP FUNCTION IF EXISTS exchange_rates_guard()');
        }
        Schema::dropIfExists('fx_revaluations');
        Schema::dropIfExists('exchange_rates');
    }
};
