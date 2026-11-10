<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Muhasebe yetkilendirmesi: onay matrisi ve görev ayrılığı istisnaları.
 *
 * Mevcut rol/izin altyapısının üstüne kuruluyor, yerine geçmiyor. İki şey
 * ekliyor:
 *  - Tutar eşiğine göre onay basamakları (doküman §10: "ödeme onay matrisi").
 *  - Görev ayrılığı çakışmalarının kaydı ve gerekçeli istisnası (§16).
 *
 * Çakışma tespiti kodda; tablo yalnız istisnayı ve kimin verdiğini tutuyor.
 * İstisnasız çakışma engel, istisnalı çakışma izlenebilir risk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounting_approval_rules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            // journal.post, payment.post, document.post, vat_return.submit, period.close
            $table->string('action', 40);
            $table->decimal('min_amount', 20, 6)->default(0);
            $table->decimal('max_amount', 20, 6)->nullable();     // null = üst sınır yok
            // Kaç farklı kişinin onaylaması gerekiyor.
            $table->unsignedTinyInteger('required_approvals')->default(1);
            // Onaylayabilecek roller; boşsa izni olan herkes.
            $table->jsonb('approver_role_ids')->default('[]');
            $table->string('required_permission', 60)->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'action', 'is_active']);
        });

        Schema::create('accounting_duty_exceptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            // Hangi çakışma kuralı için istisna: PREPARE_APPROVE_PAYMENT gibi.
            $table->string('conflict_code', 60);
            $table->text('reason');
            $table->date('valid_from');
            $table->date('valid_to')->nullable();
            $table->foreignUuid('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'user_id', 'conflict_code']);
        });

        // Onay geçmişi: kim neyi ne zaman onayladı. Audit log'dan ayrı çünkü
        // "iki farklı kişi onayladı mı" sorusu sorgulanabilir olmalı.
        Schema::create('accounting_approvals', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('entity_type', 40);
            $table->uuid('entity_id');
            $table->string('action', 40);
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->decimal('amount', 20, 6)->nullable();
            $table->string('note')->nullable();
            $table->timestamp('approved_at')->useCurrent();

            $table->unique(['entity_type', 'entity_id', 'action', 'user_id']);
            $table->index(['company_id', 'entity_type', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_approvals');
        Schema::dropIfExists('accounting_duty_exceptions');
        Schema::dropIfExists('accounting_approval_rules');
    }
};
