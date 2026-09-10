<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounting_records', function (Blueprint $table) {
            // Kategori sistemi (Kira, Maaş, Reklam, vs.)
            $table->string('category', 100)->nullable()->after('type');

            // Ödeme tarihi (fiilen ödendiği gün)
            $table->date('paid_at')->nullable()->after('transaction_date');
        });

        // Type CHECK — transfer ve advance ekle
        DB::statement('ALTER TABLE accounting_records DROP CONSTRAINT IF EXISTS accounting_records_type_check');
        DB::statement("ALTER TABLE accounting_records ADD CONSTRAINT accounting_records_type_check
            CHECK (type IN (
                'income','expense','transfer','advance',
                'invoice','payment','receipt','payable','receivable','other'
            ))");
    }

    public function down(): void
    {
        Schema::table('accounting_records', function (Blueprint $table) {
            $table->dropColumn(['category', 'paid_at']);
        });

        DB::statement('ALTER TABLE accounting_records DROP CONSTRAINT IF EXISTS accounting_records_type_check');
        DB::statement("ALTER TABLE accounting_records ADD CONSTRAINT accounting_records_type_check
            CHECK (type IN ('invoice','expense','payment','receipt','other','income','payable','receivable'))");
    }
};
