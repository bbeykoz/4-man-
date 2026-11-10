<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * KDV beyanı ve defter anlık görüntüleri.
 *
 * KDV defterleri (satış/alış) ayrı tabloda tutulmuyor: belgeler ve fiş
 * satırlarından türetiliyor. İkinci bir kopya tutmak defterle ayrışma riski
 * doğurur.
 *
 * Beyan ise farklı: gönderildiği anda neyin beyan edildiği dondurulmalı.
 * Sonradan bir belge düzeltilirse beyan değişmemeli, fark görünmeli. Bu
 * yüzden beyan kutuları ve satır anlık görüntüsü saklanıyor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vat_returns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('period_key', 7);              // 2026-03
            $table->date('period_start');
            $table->date('period_end');
            $table->date('due_date');                     // takip eden ayın 14'ü
            $table->string('currency', 3);

            // Beyan kutuları: kod => ['base' => .., 'tax' => ..]
            $table->jsonb('boxes')->default('{}');

            $table->decimal('output_base', 20, 6)->default(0);
            $table->decimal('output_tax', 20, 6)->default(0);
            $table->decimal('input_base', 20, 6)->default(0);
            $table->decimal('input_tax', 20, 6)->default(0);
            $table->decimal('non_deductible_tax', 20, 6)->default(0);
            // Pozitif = ödenecek, negatif = devreden/iade.
            $table->decimal('net_payable', 20, 6)->default(0);

            $table->unsignedInteger('sales_count')->default(0);
            $table->unsignedInteger('purchase_count')->default(0);

            $table->enum('status', ['draft', 'validated', 'submitted', 'accepted', 'rejected'])->default('draft');
            // Gönderim anındaki defter özeti; sonradan değişiklik tespit edilsin.
            $table->string('snapshot_hash', 64)->nullable();
            $table->jsonb('validation_issues')->default('[]');

            $table->timestamp('submitted_at')->nullable();
            $table->foreignUuid('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('submission_reference')->nullable();   // kurum makbuz no
            $table->text('submission_note')->nullable();

            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();

            $table->unique(['company_id', 'period_key']);
            $table->index(['company_id', 'status']);
        });

        // Beyana giren belge satırlarının anlık görüntüsü.
        // Sonradan belge değişirse "beyanda ne vardı" sorusu cevaplanabilsin.
        Schema::create('vat_return_entries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('vat_return_id')->constrained('vat_returns')->cascadeOnDelete();
            $table->enum('book', ['sales', 'purchase']);
            $table->uuid('document_id')->nullable();
            $table->string('document_number', 40)->nullable();
            $table->string('doc_type', 30)->nullable();
            $table->date('tax_date');
            $table->string('partner_name')->nullable();
            $table->string('partner_vat_number', 20)->nullable();
            $table->string('tax_code', 30)->nullable();
            $table->string('treatment', 30)->nullable();
            $table->string('report_box', 20)->nullable();
            $table->decimal('base', 20, 6)->default(0);
            $table->decimal('tax', 20, 6)->default(0);
            $table->decimal('non_deductible', 20, 6)->default(0);
            $table->timestamps();

            $table->index(['vat_return_id', 'book']);
            $table->index('document_id');
        });

        // Gönderilmiş beyan değiştirilemez.
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION vat_returns_guard() RETURNS trigger AS $$
        BEGIN
            IF (TG_OP = 'DELETE') THEN
                IF OLD.status IN ('submitted', 'accepted') THEN
                    RAISE EXCEPTION 'Gönderilmiş KDV beyanı silinemez (%).', OLD.period_key;
                END IF;
                RETURN OLD;
            END IF;

            IF OLD.status IN ('submitted', 'accepted') THEN
                IF NEW.boxes       IS DISTINCT FROM OLD.boxes
                OR NEW.output_tax  IS DISTINCT FROM OLD.output_tax
                OR NEW.input_tax   IS DISTINCT FROM OLD.input_tax
                OR NEW.net_payable IS DISTINCT FROM OLD.net_payable THEN
                    RAISE EXCEPTION 'Gönderilmiş KDV beyanının tutarları değiştirilemez (%). Düzeltme beyanı verin.', OLD.period_key;
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER vat_returns_guard_trg
            BEFORE UPDATE OR DELETE ON vat_returns
            FOR EACH ROW EXECUTE FUNCTION vat_returns_guard();
        SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS vat_returns_guard_trg ON vat_returns');
        DB::unprepared('DROP FUNCTION IF EXISTS vat_returns_guard()');
        Schema::dropIfExists('vat_return_entries');
        Schema::dropIfExists('vat_returns');
    }
};
