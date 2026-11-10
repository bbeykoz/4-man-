<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Vergi kodları ve vergi kayıt eşiği takibi.
 *
 * Mevzuat değişkeni kod içine sabitlenmiyor. Her vergi kodu bir geçerlilik
 * aralığı taşır; oran değişince eski kod kapatılır ve yenisi açılır. Böylece
 * geçmiş fişler geriye dönük değişmez — doküman §2.1'in temel şartı.
 *
 * Aynı kodun geçerlilik aralıkları çakışamaz; bu kural hem serviste hem de
 * veritabanında (exclusion constraint) zorlanıyor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('country_code', 2);
            // Şirket içinde benzersiz anahtar; oran değişse de kod aynı kalır.
            $table->string('code', 30);
            $table->string('name');
            $table->string('name_local')->nullable();

            // vat (ДДС / KDV), withholding (stopaj), excise … İleride başka
            // vergi türleri aynı motoru kullanabilsin diye ayrı alan.
            $table->string('tax_type', 20)->default('vat');
            // İşlemin vergi niteliği; oran tek başına yetmiyor. %0 ile istisna
            // aynı tutarı verir ama beyanda farklı kutuya gider.
            $table->enum('treatment', [
                'standard', 'reduced', 'reduced_low', 'zero', 'exempt',
                'reverse_charge', 'eu_supply', 'eu_acquisition', 'import',
                'export', 'triangulation', 'out_of_scope',
            ])->default('standard');
            $table->decimal('rate', 7, 4)->default(0);        // yüzde; 20.0000

            // Satış mı alış mı; aynı oran iki yönde farklı hesaba ve farklı
            // beyan kutusuna gider.
            $table->enum('direction', ['sale', 'purchase', 'both'])->default('both');

            // İndirilebilirlik: kısmi indirim ve indirilemeyen KDV için.
            $table->decimal('deductible_rate', 5, 2)->default(100);

            // Muhasebe eşlemesi: verginin yazılacağı hesaplar.
            $table->uuid('output_account_id')->nullable();    // hesaplanan (satış)
            $table->uuid('input_account_id')->nullable();     // indirilecek (alış)
            $table->uuid('expense_account_id')->nullable();   // indirilemeyen kısım gider

            // Beyan ve raporlama eşlemesi.
            $table->string('report_box', 20)->nullable();     // KDV beyan kutusu
            $table->string('saft_code', 20)->nullable();      // SAF-T vergi kodu
            $table->boolean('eu_reportable')->default(false); // VIES'e girer mi
            $table->boolean('affects_vat_return')->default(true);

            $table->date('valid_from');
            $table->date('valid_to')->nullable();             // null = açık uçlu
            $table->string('legal_reference')->nullable();    // ЗДДС md. 66 vb.
            // Danışman onayı alınmadan canlıda kullanılmasın.
            $table->enum('approval_status', ['draft', 'approved'])->default('draft');
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->boolean('is_default')->default(false);    // türün varsayılanı
            $table->text('description')->nullable();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'tax_type', 'treatment']);
            $table->index(['company_id', 'valid_from', 'valid_to']);
            $table->unique(['company_id', 'code', 'valid_from']);
        });

        // Aynı kodun geçerlilik aralıkları çakışamaz. Uygulama kontrolü
        // eşzamanlı iki kayıtta yetersiz kalır; veritabanı son sözü söyler.
        // daterange üst sınırı dışlayıcı: valid_to dahil olsun diye +1 gün.
        DB::statement('CREATE EXTENSION IF NOT EXISTS btree_gist');
        DB::statement(<<<'SQL'
        ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_no_overlap
        EXCLUDE USING gist (
            company_id WITH =,
            code WITH =,
            daterange(valid_from, COALESCE(valid_to + 1, 'infinity'::date), '[)') WITH &&
        ) WHERE (deleted_at IS NULL)
        SQL);

        // Fiş satırındaki vergi kodu artık gerçek bir tabloya işaret ediyor.
        Schema::table('journal_lines', function (Blueprint $table) {
            $table->foreign('tax_code_id')->references('id')->on('tax_codes')->nullOnDelete();
            $table->index('tax_code_id');
            // Satırın vergi matrahı ve tutarı; beyan defterleri bunu okuyacak.
            $table->decimal('tax_base', 20, 6)->nullable()->after('tax_code_id');
            $table->decimal('tax_amount', 20, 6)->nullable()->after('tax_base');
            $table->decimal('tax_rate', 7, 4)->nullable()->after('tax_amount');
            $table->decimal('non_deductible_amount', 20, 6)->nullable()->after('tax_rate');
        });

        // Vergi kayıt eşiği takibi: ciro penceresi ve uyarı durumu.
        Schema::create('vat_threshold_checks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->date('window_start');
            $table->date('window_end');
            $table->decimal('turnover', 20, 6)->default(0);
            $table->decimal('threshold', 20, 6);
            $table->string('currency', 3);
            $table->decimal('ratio', 7, 4)->default(0);       // eşiğin yüzde kaçı
            $table->enum('level', ['ok', 'warning', 'exceeded'])->default('ok');
            $table->timestamp('checked_at')->useCurrent();

            $table->index(['company_id', 'checked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vat_threshold_checks');

        Schema::table('journal_lines', function (Blueprint $table) {
            $table->dropForeign(['tax_code_id']);
            $table->dropIndex(['tax_code_id']);
            $table->dropColumn(['tax_base', 'tax_amount', 'tax_rate', 'non_deductible_amount']);
        });

        DB::statement('ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_no_overlap');
        Schema::dropIfExists('tax_codes');
    }
};
