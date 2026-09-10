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
            // İşlem tarihi — gerçek işlemin gerçekleştiği tarih
            $table->date('transaction_date')->nullable()->after('due_date');

            // KDV alanları
            $table->decimal('vat_rate', 5, 2)->default(0)->after('amount');     // KDV oranı (%)
            $table->boolean('vat_included')->default(false)->after('vat_rate'); // KDV dahil mi
            $table->decimal('vat_amount', 15, 2)->default(0)->after('vat_included'); // Hesaplanan KDV tutarı

            // Ödeme yöntemi
            $table->string('payment_method', 50)->nullable()->after('currency');

            // Döviz kuru (TRY dışında döviz seçilince kullanılır)
            $table->decimal('exchange_rate', 15, 6)->default(1)->after('payment_method');

            // Tekrarlayan işlem
            $table->boolean('is_recurring')->default(false)->after('vendor');
            $table->string('recurring_frequency', 20)->nullable()->after('is_recurring'); // monthly, weekly, yearly
            $table->date('recurring_end_date')->nullable()->after('recurring_frequency');
        });

        // PostgreSQL CHECK constraint güncelleme — type enum'a gelir/borç/alacak ekle
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE accounting_records DROP CONSTRAINT IF EXISTS accounting_records_type_check');
            DB::statement("ALTER TABLE accounting_records ADD CONSTRAINT accounting_records_type_check
                CHECK (type IN ('invoice', 'expense', 'payment', 'receipt', 'other', 'income', 'payable', 'receivable'))");
        }
    }

    public function down(): void
    {
        Schema::table('accounting_records', function (Blueprint $table) {
            $table->dropColumn([
                'transaction_date',
                'vat_rate',
                'vat_included',
                'vat_amount',
                'payment_method',
                'exchange_rate',
                'is_recurring',
                'recurring_frequency',
                'recurring_end_date',
            ]);
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE accounting_records DROP CONSTRAINT IF EXISTS accounting_records_type_check');
            DB::statement("ALTER TABLE accounting_records ADD CONSTRAINT accounting_records_type_check
                CHECK (type IN ('invoice', 'expense', 'payment', 'receipt', 'other'))");
        }
    }
};
