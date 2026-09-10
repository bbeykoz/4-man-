<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL CHECK constraint'ini genişlet (warranty + service ekle)
        DB::statement("ALTER TABLE return_records DROP CONSTRAINT IF EXISTS return_records_type_check");
        DB::statement("ALTER TABLE return_records ADD CONSTRAINT return_records_type_check CHECK (type::text = ANY (ARRAY['customer_return'::text, 'supplier_return'::text, 'damaged'::text, 'expired'::text, 'warranty'::text, 'service'::text]))");

        // Status CHECK constraint'ini genişlet (draft + cancelled ekle)
        DB::statement("ALTER TABLE return_records DROP CONSTRAINT IF EXISTS return_records_status_check");
        DB::statement("ALTER TABLE return_records ADD CONSTRAINT return_records_status_check CHECK (status::text = ANY (ARRAY['draft'::text, 'pending'::text, 'in_progress'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text]))");

        Schema::table('return_records', function (Blueprint $table) {
            $table->jsonb('items')->nullable()->default('[]')->after('approved_by');
            $table->string('return_outcome', 50)->nullable()->after('items');
            $table->string('rma_number', 100)->nullable()->after('return_outcome');
            $table->string('shipping_company', 100)->nullable()->after('rma_number');
            $table->string('shipping_tracking', 100)->nullable()->after('shipping_company');
            $table->date('shipping_date')->nullable()->after('shipping_tracking');
            $table->foreignUuid('reviewed_by')->nullable()->constrained('users')->nullOnDelete()->after('shipping_date');
        });
    }

    public function down(): void
    {
        Schema::table('return_records', function (Blueprint $table) {
            $table->dropForeign(['reviewed_by']);
            $table->dropColumn([
                'items', 'return_outcome', 'rma_number',
                'shipping_company', 'shipping_tracking', 'shipping_date', 'reviewed_by',
            ]);
        });

        DB::statement("ALTER TABLE return_records DROP CONSTRAINT IF EXISTS return_records_type_check");
        DB::statement("ALTER TABLE return_records ADD CONSTRAINT return_records_type_check CHECK (type::text = ANY (ARRAY['customer_return'::text, 'supplier_return'::text, 'damaged'::text, 'expired'::text]))");

        DB::statement("ALTER TABLE return_records DROP CONSTRAINT IF EXISTS return_records_status_check");
        DB::statement("ALTER TABLE return_records ADD CONSTRAINT return_records_status_check CHECK (status::text = ANY (ARRAY['pending'::text, 'in_progress'::text, 'approved'::text, 'rejected'::text, 'completed'::text]))");
    }
};
