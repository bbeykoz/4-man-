<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Günlük kontrol listesi: depo/üretim alanında her gün yapılması gereken kontroller.
 * İki ayrı boyut — ürün bazında ("bugün kontrol edildi") ve şirketin tanımladığı
 * genel görevler (ör. "depo temizliği", "soğuk zincir sıcaklığı") — aynı günü paylaşır.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Şirketin tanımladığı tekrar eden görev şablonları (ürünlerden bağımsız).
        Schema::create('daily_check_tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('description', 500)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'is_active']);
        });

        // Her ürün için güne özel kontrol kaydı; satır yoksa o ürün o gün kontrol edilmemiş demektir.
        Schema::create('product_daily_checks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('warehouse_products')->cascadeOnDelete();
            $table->date('check_date');
            $table->boolean('is_checked')->default(false);
            $table->string('note', 500)->nullable();
            $table->foreignUuid('checked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('checked_at')->nullable();
            $table->timestamps();

            $table->unique(['product_id', 'check_date']);
            $table->index(['company_id', 'check_date']);
        });

        // Her genel görev için güne özel kontrol kaydı; aynı mantık.
        Schema::create('daily_task_checks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('task_id')->constrained('daily_check_tasks')->cascadeOnDelete();
            $table->date('check_date');
            $table->boolean('is_checked')->default(false);
            $table->string('note', 500)->nullable();
            $table->foreignUuid('checked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('checked_at')->nullable();
            $table->timestamps();

            $table->unique(['task_id', 'check_date']);
            $table->index(['company_id', 'check_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_task_checks');
        Schema::dropIfExists('product_daily_checks');
        Schema::dropIfExists('daily_check_tasks');
    }
};
