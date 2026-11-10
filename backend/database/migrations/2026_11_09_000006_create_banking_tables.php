<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Banka, kasa, tahsilat/ödeme ve ekstre eşleştirme.
 *
 * Üç ayrı kavram birbirine karıştırılmıyor:
 *  - bank_transactions: bankanın bize söylediği. Dış gerçek, değiştirilmez.
 *  - payments: bizim kaydımız. Fiş üretir, belgeleri kapatır.
 *  - matching: ikisinin eşleştirilmesi. Önerilir, insan onaylar.
 *
 * Ekstre satırı doğrudan fiş üretmez; doküman §10'daki "güven puanı ve
 * kullanıcı onayı" kuralı bunu gerektiriyor.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ─── Banka / kasa hesapları ──────────────────────────────────
        Schema::create('bank_accounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30);
            $table->string('name');
            // bank: banka hesabı, cash: kasa, pos: sanal POS / tahsilat hesabı.
            $table->enum('type', ['bank', 'cash', 'pos'])->default('bank');
            $table->string('bank_name')->nullable();
            $table->string('iban', 34)->nullable();
            $table->string('bic', 11)->nullable();
            $table->string('account_number', 40)->nullable();
            $table->string('currency', 3);
            // Defterdeki karşılığı; bakiye buradan okunur.
            $table->foreignUuid('account_id')->constrained('chart_accounts')->restrictOnDelete();
            // Kasa limiti: aşılırsa uyarı (doküman §10).
            $table->decimal('cash_limit', 20, 6)->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            // Ödeme onay eşiği: bu tutarın üstü ayrı onay ister.
            $table->decimal('approval_threshold', 20, 6)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'code']);
            $table->index(['company_id', 'type', 'is_active']);
            $table->index('iban');
        });

        // ─── Tahsilat ve ödemeler ────────────────────────────────────
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('number', 40)->nullable();          // kesme anında atanır
            // in: tahsilat (para girişi), out: ödeme (para çıkışı).
            $table->enum('direction', ['in', 'out']);
            $table->foreignUuid('bank_account_id')->constrained('bank_accounts')->restrictOnDelete();
            $table->uuid('partner_id')->nullable();
            $table->date('payment_date');
            $table->decimal('amount', 20, 6);
            $table->string('currency', 3);
            $table->decimal('exchange_rate', 20, 10)->default(1);
            $table->decimal('amount_fc', 20, 6);               // defter para birimi karşılığı
            // Belgelere dağıtılan toplam; kalan avans sayılır.
            $table->decimal('allocated_amount', 20, 6)->default(0);
            $table->string('method', 30)->nullable();          // transfer, nakit, kart, çek
            $table->string('reference')->nullable();
            $table->text('description')->nullable();
            // Banka masrafı ayrı yazılır; tahsilat tutarını azaltmaz.
            $table->decimal('bank_charge', 20, 6)->default(0);

            $table->enum('status', ['draft', 'pending_approval', 'approved', 'posted', 'cancelled'])->default('draft');
            $table->foreignUuid('prepared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'number']);
            $table->index(['company_id', 'direction', 'status']);
            $table->index(['company_id', 'payment_date']);
            $table->index('partner_id');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->foreign('partner_id')->references('id')->on('business_partners')->nullOnDelete();
        });

        // ─── Ödemenin kapattığı belgeler ─────────────────────────────
        Schema::create('payment_allocations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('payment_id')->constrained('payments')->cascadeOnDelete();
            $table->foreignUuid('document_id')->constrained('documents')->restrictOnDelete();
            $table->decimal('allocated_amount', 20, 6);
            // Belge kuru ile tahsilat kuru farklıysa gerçekleşen kur farkı.
            $table->decimal('fx_difference', 20, 6)->default(0);
            $table->timestamps();

            $table->unique(['payment_id', 'document_id']);
            $table->index('document_id');
        });

        // ─── Banka ekstresi ──────────────────────────────────────────
        Schema::create('bank_statements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('bank_account_id')->constrained('bank_accounts')->cascadeOnDelete();
            $table->string('reference', 60)->nullable();       // bankanın ekstre numarası
            $table->date('statement_date');
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('opening_balance', 20, 6)->default(0);
            $table->decimal('closing_balance', 20, 6)->default(0);
            $table->string('currency', 3);
            $table->string('format', 20)->default('csv');      // csv, camt053, mt940
            $table->string('source_file')->nullable();
            $table->string('file_hash', 64)->nullable();       // aynı dosya iki kez yüklenmesin
            $table->enum('status', ['imported', 'matching', 'reconciled'])->default('imported');
            $table->foreignUuid('imported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'bank_account_id', 'period_start']);
            $table->unique(['company_id', 'file_hash']);
        });

        // ─── Ekstre satırları ────────────────────────────────────────
        Schema::create('bank_transactions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('bank_account_id')->constrained('bank_accounts')->cascadeOnDelete();
            $table->foreignUuid('statement_id')->nullable()->constrained('bank_statements')->nullOnDelete();
            // Bankanın verdiği benzersiz kimlik; aynı satır iki kez girmesin.
            $table->string('external_id', 120);
            $table->date('booking_date');
            $table->date('value_date')->nullable();
            // Pozitif = para girişi, negatif = para çıkışı.
            $table->decimal('amount', 20, 6);
            $table->string('currency', 3);
            $table->text('remittance')->nullable();            // açıklama / referans metni
            $table->string('counterparty_name')->nullable();
            $table->string('counterparty_iban', 34)->nullable();
            $table->decimal('running_balance', 20, 6)->nullable();

            $table->enum('match_status', ['unmatched', 'suggested', 'matched', 'ignored'])->default('unmatched');
            $table->foreignUuid('payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->decimal('match_confidence', 5, 2)->nullable();
            $table->jsonb('match_reasons')->default('[]');
            $table->foreignUuid('matched_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('matched_at')->nullable();
            $table->string('ignore_reason')->nullable();
            $table->timestamps();

            $table->unique(['bank_account_id', 'external_id']);
            $table->index(['company_id', 'match_status']);
            $table->index(['bank_account_id', 'booking_date']);
        });

        // ─── Kasa sayımı ─────────────────────────────────────────────
        Schema::create('cash_counts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('bank_account_id')->constrained('bank_accounts')->cascadeOnDelete();
            $table->date('count_date');
            $table->decimal('ledger_balance', 20, 6);          // defterdeki bakiye
            $table->decimal('counted_amount', 20, 6);          // fiilen sayılan
            $table->decimal('difference', 20, 6);
            $table->jsonb('denominations')->default('{}');     // kupür dökümü
            $table->text('note')->nullable();
            // Fark varsa düzeltme fişi.
            $table->foreignUuid('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->foreignUuid('counted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['bank_account_id', 'count_date']);
            $table->index(['company_id', 'count_date']);
        });

        // Deftere işlenmiş ödeme silinemez, tutarı değişemez.
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
        BEGIN
            IF (TG_OP = 'DELETE') THEN
                IF OLD.status = 'posted' THEN
                    RAISE EXCEPTION 'Deftere işlenmiş ödeme silinemez (%). Ters kayıt kullanın.', COALESCE(OLD.number, OLD.id::text);
                END IF;
                RETURN OLD;
            END IF;

            IF OLD.status = 'posted' AND NEW.status = 'posted' THEN
                IF NEW.amount       IS DISTINCT FROM OLD.amount
                OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
                OR NEW.number       IS DISTINCT FROM OLD.number
                OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id THEN
                    RAISE EXCEPTION 'Deftere işlenmiş ödemenin tutar, tarih, numara ve hesap alanları değiştirilemez (%).', OLD.number;
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER payments_guard_trg
            BEFORE UPDATE OR DELETE ON payments
            FOR EACH ROW EXECUTE FUNCTION payments_guard();
        SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS payments_guard_trg ON payments');
        DB::unprepared('DROP FUNCTION IF EXISTS payments_guard()');

        Schema::dropIfExists('cash_counts');
        Schema::dropIfExists('bank_transactions');
        Schema::dropIfExists('bank_statements');
        Schema::dropIfExists('payment_allocations');
        Schema::table('payments', fn (Blueprint $t) => $t->dropForeign(['partner_id']));
        Schema::dropIfExists('payments');
        Schema::dropIfExists('bank_accounts');
    }
};
