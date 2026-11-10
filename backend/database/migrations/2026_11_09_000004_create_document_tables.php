<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Belge katmanı: hesap rolleri, numara serileri, belgeler ve belge satırları.
 *
 * Belge ile fiş ayrı katmanlar. Belge ticari gerçeği taşır (kim, ne, kaç para,
 * hangi vergi); fiş onun muhasebe yansımasıdır. Belge kesildiğinde fiş üretilir
 * ve aralarında tek yönlü bağ kurulur. Düzeltme belgeyi silmez: iade/iptal
 * belgesi orijinale bağlanır, fiş tarafında ters kayıt oluşur.
 *
 * Numara serileri ayrı tablo çünkü mevzuat seri bazında yetki ve atlamasız
 * sıra istiyor (doküman §5.1).
 */
return new class extends Migration
{
    public function up(): void
    {
        // ─── Hesap rolleri ───────────────────────────────────────────
        // "Alacak kontrol hesabı 411'dir" bilgisi koda gömülmemeli: şirket
        // kendi planını kullanabiliyor. Rol → hesap eşlemesi burada.
        Schema::create('accounting_account_roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('role', 40);          // ar_control, output_vat, default_revenue …
            $table->foreignUuid('account_id')->constrained('chart_accounts')->restrictOnDelete();
            $table->string('note')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'role']);
        });

        // ─── Numara serileri ─────────────────────────────────────────
        Schema::create('document_series', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('doc_type', 30);
            $table->string('code', 20);          // "A", "SF2026", şube kodu …
            $table->string('name');
            $table->string('prefix', 20)->nullable();
            $table->unsignedTinyInteger('padding')->default(6);
            // Yıl başında sıfırlanan seri mi, sürekli artan mı.
            $table->boolean('reset_yearly')->default(true);
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            // Seriyi kullanabilecek kullanıcılar; boşsa herkese açık.
            $table->jsonb('allowed_user_ids')->default('[]');
            $table->string('branch', 60)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'doc_type', 'code']);
            $table->index(['company_id', 'doc_type', 'is_active']);
        });

        // ─── Belgeler ────────────────────────────────────────────────
        Schema::create('documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('doc_type', 30);
            $table->foreignUuid('series_id')->nullable()->constrained('document_series')->nullOnDelete();
            // Numara belge kesilirken atanır; taslakta null.
            $table->string('number', 40)->nullable();

            // Üç ayrı tarih: belge tarihi, vergiyi doğuran olay, deftere giriş.
            $table->date('issue_date');
            $table->date('tax_date')->nullable();
            $table->date('due_date')->nullable();
            // Vergiyi doğuran olay; fatura süresi kontrolü bunu kullanır.
            $table->date('supply_date')->nullable();

            $table->uuid('partner_id')->nullable();          // business_partners (Faz 5)
            $table->string('partner_name')->nullable();      // belge anındaki unvan
            $table->string('partner_vat_number', 20)->nullable();
            $table->string('partner_registration_number', 30)->nullable();
            $table->jsonb('partner_address')->nullable();

            $table->string('currency', 3);
            $table->decimal('exchange_rate', 20, 10)->default(1);
            $table->date('exchange_rate_date')->nullable();
            $table->string('exchange_rate_source', 30)->nullable();

            // İşlem para biriminde toplamlar.
            $table->decimal('net_amount', 20, 6)->default(0);
            $table->decimal('tax_amount', 20, 6)->default(0);
            $table->decimal('gross_amount', 20, 6)->default(0);
            $table->decimal('discount_amount', 20, 6)->default(0);
            // Defter para biriminde karşılığı.
            $table->decimal('net_amount_fc', 20, 6)->default(0);
            $table->decimal('tax_amount_fc', 20, 6)->default(0);
            $table->decimal('gross_amount_fc', 20, 6)->default(0);
            // Kapatılan tutar; kısmi tahsilat Faz 6'da bunu günceller.
            $table->decimal('settled_amount', 20, 6)->default(0);

            $table->enum('status', [
                'draft', 'issued', 'posted', 'partially_settled', 'settled', 'cancelled',
            ])->default('draft');

            // Düzeltme zinciri: iade/iptal belgesi orijinale bağlanır.
            $table->foreignUuid('corrects_document_id')->nullable();
            $table->string('correction_reason')->nullable();

            // Kaynak: elle mi, depo olayından mı, OCR'dan mı geldi.
            $table->string('source_type', 40)->default('MANUAL');
            $table->uuid('source_id')->nullable();
            $table->uuid('source_file_id')->nullable();      // PDF/foto eki

            // Muhasebe yansıması.
            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->foreignUuid('posted_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('reference')->nullable();         // karşı tarafın belge no'su
            $table->text('notes')->nullable();
            $table->string('payment_terms', 60)->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();                            // yalnız taslak için

            $table->unique(['company_id', 'doc_type', 'series_id', 'number']);
            $table->index(['company_id', 'doc_type', 'status']);
            $table->index(['company_id', 'issue_date']);
            $table->index(['company_id', 'partner_id']);
            $table->index(['source_type', 'source_id']);
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->foreign('corrects_document_id')->references('id')->on('documents')->nullOnDelete();
            $table->index('corrects_document_id');
        });

        // ─── Belge satırları ─────────────────────────────────────────
        Schema::create('document_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('document_id')->constrained('documents')->cascadeOnDelete();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('line_no');

            $table->uuid('product_id')->nullable();           // warehouse_products
            $table->string('item_code', 60)->nullable();
            $table->string('description');
            $table->decimal('quantity', 20, 6)->default(1);
            $table->string('unit', 20)->nullable();
            $table->decimal('unit_price', 20, 6)->default(0);
            $table->decimal('discount_rate', 7, 4)->default(0);
            $table->decimal('discount_amount', 20, 6)->default(0);

            $table->decimal('net_amount', 20, 6)->default(0);
            $table->foreignUuid('tax_code_id')->nullable()->constrained('tax_codes')->nullOnDelete();
            $table->decimal('tax_rate', 7, 4)->default(0);
            $table->decimal('tax_amount', 20, 6)->default(0);
            $table->decimal('non_deductible_amount', 20, 6)->default(0);
            $table->decimal('gross_amount', 20, 6)->default(0);

            // Satırın gideceği gelir/gider/stok hesabı; boşsa rol eşlemesinden.
            $table->foreignUuid('account_id')->nullable()->constrained('chart_accounts')->nullOnDelete();
            $table->jsonb('dimensions')->default('{}');
            $table->timestamps();

            $table->unique(['document_id', 'line_no']);
            $table->index(['company_id', 'product_id']);
        });

        DB::statement('ALTER TABLE document_lines ADD CONSTRAINT document_lines_quantity_not_zero CHECK (quantity <> 0)');

        // Deftere işlenmiş belge silinemez, tutarı değişemez.
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION documents_guard() RETURNS trigger AS $$
        BEGIN
            IF (TG_OP = 'DELETE') THEN
                IF OLD.status IN ('posted', 'partially_settled', 'settled') THEN
                    RAISE EXCEPTION 'Deftere işlenmiş belge silinemez (%). İptal ya da iade belgesi düzenleyin.', OLD.number;
                END IF;
                RETURN OLD;
            END IF;

            IF OLD.status IN ('posted', 'partially_settled', 'settled') THEN
                IF NEW.net_amount   IS DISTINCT FROM OLD.net_amount
                OR NEW.tax_amount   IS DISTINCT FROM OLD.tax_amount
                OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
                OR NEW.number       IS DISTINCT FROM OLD.number
                OR NEW.issue_date   IS DISTINCT FROM OLD.issue_date THEN
                    RAISE EXCEPTION 'Deftere işlenmiş belgenin tutar, numara ve tarih alanları değiştirilemez (%).', OLD.number;
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER documents_guard_trg
            BEFORE UPDATE OR DELETE ON documents
            FOR EACH ROW EXECUTE FUNCTION documents_guard();
        SQL);

        // Fiş tarafından belgeye geri bağ.
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->uuid('document_id')->nullable()->after('source_id');
            $table->index('document_id');
        });
    }

    public function down(): void
    {
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->dropIndex(['document_id']);
            $table->dropColumn('document_id');
        });

        DB::unprepared('DROP TRIGGER IF EXISTS documents_guard_trg ON documents');
        DB::unprepared('DROP FUNCTION IF EXISTS documents_guard()');

        Schema::dropIfExists('document_lines');
        Schema::dropIfExists('documents');
        Schema::dropIfExists('document_series');
        Schema::dropIfExists('accounting_account_roles');
    }
};
