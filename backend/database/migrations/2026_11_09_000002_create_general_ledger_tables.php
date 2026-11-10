<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Genel muhasebe (GL) çekirdeği: dönem, hesap planı, fiş, fiş satırı, denetim
 * kaydı ve numara sayacı.
 *
 * Tasarım kararları:
 *  - Fiş satırı tutarları numeric(20,6), kur numeric(20,10). Belge seviyesinde
 *    2 hane yeterli ama defterde yuvarlama hatası birikmemeli.
 *  - Posted fiş silinmez. Projedeki SoftDeletes geleneği burada geçerli değil;
 *    düzeltme ters kayıtla yapılır. Veritabanı seviyesinde de trigger ile
 *    engelleniyor, uygulama hatası defteri bozmasın.
 *  - Fiş numarası post anında atanır. Taslağın numarası yoktur; yasal numara
 *    gibi görünen bir taslak numarası üretmiyoruz.
 *  - Hesap planı şirkete aittir. Tek ve değiştirilemez bir plan dayatmıyoruz;
 *    ülke paketi yalnızca başlangıç şablonu verir.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ─── Muhasebe dönemleri ──────────────────────────────────────
        Schema::create('accounting_periods', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);                     // "2026-01", "2026 Q1"
            $table->date('start_date');
            $table->date('end_date');
            // open: kayıt serbest. closing: yalnız kapanış fişleri. closed: kayıt yok.
            // locked: denetim sonrası, yetkili bile açamaz (ayrı izinle açılır).
            $table->enum('status', ['open', 'closing', 'closed', 'locked'])->default('open');
            $table->foreignUuid('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->foreignUuid('reopened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reopened_at')->nullable();
            $table->text('reopen_reason')->nullable();      // gerekçesiz yeniden açma yok
            $table->timestamps();

            $table->unique(['company_id', 'start_date', 'end_date']);
            $table->index(['company_id', 'status']);
        });

        // ─── Hesap planı ─────────────────────────────────────────────
        Schema::create('chart_accounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('code', 20);
            $table->string('name');                         // şirketin çalışma dili
            $table->string('name_local')->nullable();       // resmi dil (BG için Bulgarca)
            $table->enum('account_type', ['asset', 'liability', 'equity', 'revenue', 'expense', 'off_balance']);
            $table->enum('normal_balance', ['debit', 'credit']);
            $table->uuid('parent_id')->nullable();   // anahtar aşağıda, tablo oluştuktan sonra
            // Kontrol hesabına elle fiş yazılamaz; kaydı alt defter üretir (cari, stok, banka).
            $table->boolean('is_control')->default(false);
            $table->boolean('requires_partner')->default(false);
            // Zorunlu analitik boyutlar: ["cost_center","project"] gibi.
            $table->jsonb('required_dimensions')->default('[]');
            $table->date('active_from')->nullable();
            $table->date('active_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('description')->nullable();
            // Ülke paketi şablonundan geldiyse hangi şablon satırı olduğu.
            $table->string('template_key', 40)->nullable();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();                          // ana veri silinebilir, fiş değil

            $table->unique(['company_id', 'code']);
            $table->index(['company_id', 'account_type']);
            $table->index(['company_id', 'is_active']);
        });

        Schema::table('chart_accounts', function (Blueprint $table) {
            $table->foreign('parent_id')->references('id')->on('chart_accounts')->nullOnDelete();
            $table->index('parent_id');
        });

        // ─── Yevmiye fişi başlığı ────────────────────────────────────
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            // Post anında atanır; taslakta null.
            $table->string('journal_no', 30)->nullable();
            $table->enum('journal_type', [
                'opening', 'general', 'sales', 'purchase', 'bank', 'cash',
                'inventory', 'payroll', 'fixed_asset', 'fx', 'tax_adjustment',
                'closing', 'reversal',
            ])->default('general');
            $table->date('document_date');                  // belgenin kendi tarihi
            $table->date('posting_date');                   // deftere girdiği tarih; dönemi bu belirler
            $table->foreignUuid('period_id')->nullable()->constrained('accounting_periods')->nullOnDelete();
            $table->string('currency', 3);                  // defter para birimi anlık kopyası
            // Kaynak belge: hangi modülden geldi. Elle girilen fişte MANUAL.
            $table->string('source_type', 40)->default('MANUAL');
            $table->uuid('source_id')->nullable();
            $table->enum('status', [
                'draft', 'validated', 'pending_approval', 'approved', 'posted', 'reversed', 'cancelled',
            ])->default('draft');
            $table->string('description');
            $table->string('reference')->nullable();
            // Ters kayıt zinciri: hangi fişi tersliyor / hangi fiş bunu tersledi.
            $table->uuid('reversal_of_id')->nullable();   // anahtarlar aşağıda
            $table->uuid('reversed_by_id')->nullable();
            // Onaylanan içeriğin özeti; post anında değişmediği doğrulanır.
            $table->string('content_hash', 64)->nullable();
            $table->decimal('total_debit', 20, 6)->default(0);
            $table->decimal('total_credit', 20, 6)->default(0);
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->timestamp('reversed_at')->nullable();
            $table->text('memo')->nullable();               // elle fişte gerekçe
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            // Bilinçli olarak softDeletes yok: posted fiş silinmez.

            $table->unique(['company_id', 'journal_no']);
            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'posting_date']);
            $table->index(['period_id', 'status']);
            $table->index(['source_type', 'source_id']);
        });

        Schema::table('journal_entries', function (Blueprint $table) {
            $table->foreign('reversal_of_id')->references('id')->on('journal_entries')->nullOnDelete();
            $table->foreign('reversed_by_id')->references('id')->on('journal_entries')->nullOnDelete();
            $table->index('reversal_of_id');
        });

        // ─── Yevmiye fişi satırı ─────────────────────────────────────
        Schema::create('journal_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('entry_id')->constrained('journal_entries')->cascadeOnDelete();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('line_no');
            $table->foreignUuid('account_id')->constrained('chart_accounts')->restrictOnDelete();
            $table->string('description')->nullable();
            // Defter para birimi tutarları. Bir satır ya borç ya alacak olur.
            $table->decimal('debit', 20, 6)->default(0);
            $table->decimal('credit', 20, 6)->default(0);
            // İşlem para birimi; defterden farklıysa kur ile çevrilir.
            $table->string('txn_currency', 3)->nullable();
            $table->decimal('txn_debit', 20, 6)->nullable();
            $table->decimal('txn_credit', 20, 6)->nullable();
            $table->decimal('fx_rate', 20, 10)->nullable();
            $table->date('fx_rate_date')->nullable();
            $table->string('fx_rate_source', 30)->nullable();
            $table->uuid('partner_id')->nullable();         // business_partners (Faz 5)
            $table->uuid('tax_code_id')->nullable();        // tax_codes (Faz 3)
            // Analitik boyutlar: warehouse, department, project, cost_center, product, branch.
            $table->jsonb('dimensions')->default('{}');
            $table->timestamps();

            $table->unique(['entry_id', 'line_no']);
            $table->index(['company_id', 'account_id']);
            $table->index('partner_id');
        });

        // Tutar işaretleri ve "tek yön" kuralı veritabanında da zorlanıyor.
        DB::statement("ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_amounts_non_negative CHECK (debit >= 0 AND credit >= 0)");
        DB::statement("ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_single_side CHECK (NOT (debit > 0 AND credit > 0))");
        DB::statement("ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_not_empty CHECK (debit > 0 OR credit > 0)");

        // ─── Muhasebe denetim kaydı ──────────────────────────────────
        Schema::create('accounting_audit_events', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 60);                   // journal.posted, period.closed …
            $table->string('entity_type', 60);
            $table->uuid('entity_id')->nullable();
            $table->string('before_hash', 64)->nullable();
            $table->string('after_hash', 64)->nullable();
            $table->jsonb('payload')->default('{}');
            $table->text('reason')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('occurred_at')->useCurrent();

            $table->index(['company_id', 'occurred_at']);
            $table->index(['entity_type', 'entity_id']);
            $table->index('action');
        });

        // ─── Numara sayaçları ────────────────────────────────────────
        // Fiş ve belge numarası için şirket + anahtar + yıl bazlı sayaç.
        // Satır kilidiyle artırılır; eşzamanlı post'ta numara çakışmaz.
        Schema::create('accounting_sequences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('key', 40);                      // journal:sales, document:invoice …
            $table->unsignedSmallInteger('year');
            $table->string('prefix', 20)->nullable();
            $table->unsignedInteger('next_value')->default(1);
            $table->unsignedTinyInteger('padding')->default(5);
            $table->timestamps();

            $table->unique(['company_id', 'key', 'year']);
        });

        $this->protectPostedEntries();
        $this->protectAuditLog();
    }

    /**
     * Posted ve reversed fişler veritabanı seviyesinde korunuyor.
     * Uygulama katmanı atlanırsa (konsol, elle SQL) defter yine bozulmasın.
     * İzin verilen tek güncelleme: ters kayıt bağlantısının yazılması.
     */
    private function protectPostedEntries(): void
    {
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION journal_entries_guard() RETURNS trigger AS $$
        BEGIN
            IF (TG_OP = 'DELETE') THEN
                IF OLD.status IN ('posted', 'reversed') THEN
                    RAISE EXCEPTION 'Deftere işlenmiş fiş silinemez (%). Ters kayıt kullanın.', OLD.journal_no;
                END IF;
                RETURN OLD;
            END IF;

            IF (OLD.status IN ('posted', 'reversed')) THEN
                IF NEW.status IS DISTINCT FROM OLD.status
                   AND NOT (OLD.status = 'posted' AND NEW.status = 'reversed') THEN
                    RAISE EXCEPTION 'Deftere işlenmiş fişin durumu değiştirilemez (%).', OLD.journal_no;
                END IF;
                IF NEW.total_debit  IS DISTINCT FROM OLD.total_debit
                OR NEW.total_credit IS DISTINCT FROM OLD.total_credit
                OR NEW.posting_date IS DISTINCT FROM OLD.posting_date
                OR NEW.journal_no   IS DISTINCT FROM OLD.journal_no
                OR NEW.period_id    IS DISTINCT FROM OLD.period_id THEN
                    RAISE EXCEPTION 'Deftere işlenmiş fişin tutar/tarih/numara alanları değiştirilemez (%).', OLD.journal_no;
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER journal_entries_guard_trg
            BEFORE UPDATE OR DELETE ON journal_entries
            FOR EACH ROW EXECUTE FUNCTION journal_entries_guard();
        SQL);

        // Satırlar da aynı şekilde: posted fişin satırı değişmez, silinmez.
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION journal_lines_guard() RETURNS trigger AS $$
        DECLARE
            entry_status text;
            entry_id_val uuid;
        BEGIN
            entry_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
            SELECT status INTO entry_status FROM journal_entries WHERE id = entry_id_val;

            -- Fiş silinirken satırları cascade ile gider; o anda başlık bulunamaz.
            IF entry_status IS NULL THEN
                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
            END IF;

            IF entry_status IN ('posted', 'reversed') THEN
                RAISE EXCEPTION 'Deftere işlenmiş fişin satırları değiştirilemez.';
            END IF;

            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER journal_lines_guard_trg
            BEFORE UPDATE OR DELETE ON journal_lines
            FOR EACH ROW EXECUTE FUNCTION journal_lines_guard();
        SQL);
    }

    /** Denetim kaydı append-only: yönetici dahil kimse geçmişi sessizce değiştiremez. */
    private function protectAuditLog(): void
    {
        DB::unprepared(<<<'SQL'
        CREATE OR REPLACE FUNCTION accounting_audit_append_only() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Muhasebe denetim kaydı değiştirilemez ve silinemez.';
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER accounting_audit_append_only_trg
            BEFORE UPDATE OR DELETE ON accounting_audit_events
            FOR EACH ROW EXECUTE FUNCTION accounting_audit_append_only();
        SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS accounting_audit_append_only_trg ON accounting_audit_events');
        DB::unprepared('DROP TRIGGER IF EXISTS journal_lines_guard_trg ON journal_lines');
        DB::unprepared('DROP TRIGGER IF EXISTS journal_entries_guard_trg ON journal_entries');
        DB::unprepared('DROP FUNCTION IF EXISTS accounting_audit_append_only()');
        DB::unprepared('DROP FUNCTION IF EXISTS journal_lines_guard()');
        DB::unprepared('DROP FUNCTION IF EXISTS journal_entries_guard()');

        Schema::dropIfExists('accounting_sequences');
        Schema::dropIfExists('accounting_audit_events');
        Schema::dropIfExists('journal_lines');
        Schema::dropIfExists('journal_entries');
        Schema::dropIfExists('chart_accounts');
        Schema::dropIfExists('accounting_periods');
    }
};
