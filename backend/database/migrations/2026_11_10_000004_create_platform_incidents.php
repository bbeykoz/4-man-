<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform olay kaydı: kiracı şirketlerde oluşan hatalar ve hatalı işlemler.
 *
 * Şirketin kendi aktivite logundan (activity_logs) ayrı bir tablo. İki sebeple:
 *   1. Bu kayıtlar yalnız platform ekibine görünür. Ayrı tabloda tutulunca
 *      şirket tarafına sızması için bir filtrenin unutulması yetmez — şirket
 *      tarafında bu tabloyu okuyan hiçbir uç yok.
 *   2. Alanları farklı: istisna sınıfı, dosya/satır, istek bağlamı, tekrar
 *      sayısı, çözüm durumu ve çözüm notu.
 *
 * Aynı hata tekrar ettiğinde yeni satır açılmaz: parmak izi (fingerprint)
 * aynıysa sayaç artar, son görülme ve son bağlam güncellenir. Böylece liste
 * tek bir döngüsel hatayla dolmaz.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_incidents', function (Blueprint $table) {
            $table->uuid('id')->primary();

            // Aynı hatanın tekrarlarını tek satırda toplayan anahtar.
            $table->string('fingerprint', 64)->unique();

            $table->string('level', 20)->default('error');     // critical | error | warning
            $table->string('source', 20)->default('exception'); // exception | validation | manual

            // Şirket silinse bile olay kaydı kalmalı: ad ayrıca saklanıyor.
            $table->foreignUuid('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('company_name')->nullable();
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('user_name')->nullable();
            $table->string('user_email')->nullable();

            $table->string('exception_class')->nullable();
            $table->text('message');
            $table->string('file')->nullable();
            $table->integer('line')->nullable();

            $table->string('request_method', 10)->nullable();
            $table->string('request_path')->nullable();
            $table->string('route_name')->nullable();
            $table->integer('status_code')->nullable();
            // Parolalar ve token'lar maskelenerek saklanır.
            $table->jsonb('request_payload')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->text('trace')->nullable();

            $table->unsignedInteger('occurrences')->default(1);
            $table->timestamp('first_seen_at')->useCurrent();
            $table->timestamp('last_seen_at')->useCurrent();

            $table->string('status', 20)->default('open');     // open | investigating | resolved | ignored
            // Sunucunun ürettiği ön öneri; operatörün yazdığı çözüm notundan ayrı.
            $table->text('suggested_fix')->nullable();
            $table->text('resolution_note')->nullable();
            $table->foreignUuid('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();

            $table->timestamps();

            $table->index(['status', 'last_seen_at']);
            $table->index(['company_id', 'last_seen_at']);
            $table->index(['level', 'last_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_incidents');
    }
};
