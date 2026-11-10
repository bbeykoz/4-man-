<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cari hesaplar: iş ortakları, adresleri ve mahsup kayıtları.
 *
 * Müşteri ve tedarikçi tek kayıt üzerinde ayrı roller olarak tutuluyor
 * (doküman §5.3): aynı firma hem alıcı hem satıcı olabiliyor ve iki tarafı
 * ayrı kartta tutmak mahsubu imkânsızlaştırıyor.
 *
 * Bakiye kolonu bilinçli olarak yok. Cari bakiye defterden hesaplanır;
 * ayrı bir toplam tutmak defterle ayrışma riski doğurur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_partners', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30);                   // şirket içi cari kodu
            $table->string('legal_name');                 // resmi unvan
            $table->string('trade_name')->nullable();     // ticari ad

            // Roller ayrı ayrı açılır; ikisi birden açık olabilir.
            $table->boolean('is_customer')->default(false);
            $table->boolean('is_supplier')->default(false);

            $table->string('country_code', 2);
            // Bulgaristan EIK/BULSTAT, Türkiye vergi no.
            $table->string('registration_number', 30)->nullable();
            $table->string('vat_number', 20)->nullable();
            $table->boolean('vat_registered')->default(false);
            // AB içi işlemde VIES doğrulaması yapıldı mı.
            $table->timestamp('vat_verified_at')->nullable();
            $table->string('vat_verification_source', 40)->nullable();

            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('website')->nullable();
            $table->string('contact_person')->nullable();

            $table->string('currency', 3)->nullable();    // tercih edilen para birimi
            $table->string('payment_terms', 60)->nullable();
            $table->unsignedSmallInteger('payment_days')->nullable();
            $table->decimal('credit_limit', 20, 6)->nullable();
            $table->decimal('discount_rate', 7, 4)->default(0);

            // Varsayılan hesaplar; boşsa rol eşlemesinden gelir.
            $table->foreignUuid('receivable_account_id')->nullable()->constrained('chart_accounts')->nullOnDelete();
            $table->foreignUuid('payable_account_id')->nullable()->constrained('chart_accounts')->nullOnDelete();
            $table->foreignUuid('default_revenue_account_id')->nullable()->constrained('chart_accounts')->nullOnDelete();
            $table->foreignUuid('default_expense_account_id')->nullable()->constrained('chart_accounts')->nullOnDelete();
            $table->foreignUuid('default_tax_code_id')->nullable()->constrained('tax_codes')->nullOnDelete();

            $table->boolean('is_active')->default(true);
            // Bloke cari: yeni belge kesilemez, mevcut bakiye tahsil edilir.
            $table->boolean('is_blocked')->default(false);
            $table->string('block_reason')->nullable();

            $table->text('notes')->nullable();
            $table->jsonb('meta')->default('{}');
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'code']);
            $table->index(['company_id', 'is_customer']);
            $table->index(['company_id', 'is_supplier']);
            $table->index(['company_id', 'legal_name']);
            $table->index('vat_number');
            $table->index('registration_number');
        });

        // Aynı şirket içinde aynı vergi numarası iki kez olmamalı; boş olanlar serbest.
        DB::statement("CREATE UNIQUE INDEX business_partners_vat_unique
                       ON business_partners (company_id, vat_number)
                       WHERE vat_number IS NOT NULL AND deleted_at IS NULL");

        // Çoklu teslimat/fatura adresi (doküman §5.1).
        Schema::create('partner_addresses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('partner_id')->constrained('business_partners')->cascadeOnDelete();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['billing', 'delivery', 'other'])->default('delivery');
            $table->string('label')->nullable();
            $table->string('line1');
            $table->string('line2')->nullable();
            $table->string('city', 80)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->string('region', 80)->nullable();
            $table->string('country_code', 2);
            $table->string('contact_person')->nullable();
            $table->string('phone', 30)->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['partner_id', 'type']);
        });

        // Mahsup: aynı carinin alacağı ile borcunun karşılıklı kapatılması.
        Schema::create('partner_offsets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('partner_id')->constrained('business_partners')->cascadeOnDelete();
            $table->date('offset_date');
            $table->decimal('amount', 20, 6);
            $table->string('currency', 3);
            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->text('reason');
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'partner_id', 'offset_date']);
        });

        // Mahsubun hangi belgeleri kapattığı.
        Schema::create('partner_offset_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('offset_id')->constrained('partner_offsets')->cascadeOnDelete();
            $table->foreignUuid('document_id')->constrained('documents')->restrictOnDelete();
            $table->decimal('applied_amount', 20, 6);
            $table->timestamps();

            $table->unique(['offset_id', 'document_id']);
        });

        // Artık gerçek bir cari tablosu var; belge ve fiş satırı ona bağlanıyor.
        Schema::table('documents', function (Blueprint $table) {
            $table->foreign('partner_id')->references('id')->on('business_partners')->nullOnDelete();
        });

        Schema::table('journal_lines', function (Blueprint $table) {
            $table->foreign('partner_id')->references('id')->on('business_partners')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('journal_lines', fn (Blueprint $t) => $t->dropForeign(['partner_id']));
        Schema::table('documents', fn (Blueprint $t) => $t->dropForeign(['partner_id']));

        Schema::dropIfExists('partner_offset_lines');
        Schema::dropIfExists('partner_offsets');
        Schema::dropIfExists('partner_addresses');
        DB::statement('DROP INDEX IF EXISTS business_partners_vat_unique');
        Schema::dropIfExists('business_partners');
    }
};
