<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Depo → muhasebe olay kuyruğu (outbox).
 *
 * Depo modülü muhasebe tablolarına doğrudan yazmıyor. Stok hareketi
 * işlendiğinde aynı transaction içinde buraya bir olay satırı düşüyor; fişi
 * sonradan bir tüketici üretiyor. Böylece:
 *  - muhasebe kurulumu eksikse depo çalışmaya devam ediyor,
 *  - olay kaybolmuyor (stok yazıldıysa satır da yazılmıştır),
 *  - aynı olay iki kez fiş üretmiyor (event_id benzersiz).
 *
 * Kapanmış döneme denk gelen geçmiş tarihli hareket otomatik işlenmiyor;
 * "exception" durumuna düşüp insan kararı bekliyor (doküman §6).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_accounting_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();

            // Kaynak olayın kimliği. Aynı iş olayı ikinci kez yayımlanırsa
            // benzersiz kısıt engelliyor — idempotency anahtarı bu.
            $table->string('event_id', 120);
            $table->string('event_type', 40);          // GOODS_RECEIVED, GOODS_ISSUED …

            $table->string('source_type', 40);         // WAREHOUSE_RECORD
            $table->uuid('source_id');
            $table->string('source_number', 40)->nullable();

            $table->timestamp('occurred_at');
            // Muhasebe tarihi; kapanmış dönem kontrolü bunu kullanır.
            $table->date('accounting_date');

            // Olayın tüm verisi; tüketici bunu okur, depo tablolarına gitmez.
            $table->jsonb('payload');

            $table->enum('status', [
                'pending',      // işlenmeyi bekliyor
                'processed',    // fiş üretildi
                'skipped',      // muhasebe etkisi yok (ör. aynı tüzel kişi içi transfer)
                'exception',    // kapalı dönem / eksik yapılandırma; insan kararı bekliyor
                'failed',       // teknik hata; yeniden denenebilir
            ])->default('pending');

            $table->unsignedSmallInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->string('skip_reason')->nullable();

            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();
            $table->foreignUuid('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['company_id', 'event_id']);
            $table->index(['company_id', 'status', 'accounting_date']);
            $table->index(['source_type', 'source_id']);
            $table->index('event_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_accounting_events');
    }
};
