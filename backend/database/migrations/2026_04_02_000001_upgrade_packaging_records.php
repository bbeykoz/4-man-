<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL CHECK constraint'ini genişlet (approved + draft ekle)
        DB::statement("ALTER TABLE packaging_records DROP CONSTRAINT IF EXISTS packaging_records_status_check");
        DB::statement("ALTER TABLE packaging_records ADD CONSTRAINT packaging_records_status_check CHECK (status::text = ANY (ARRAY['draft'::text, 'pending'::text, 'in_progress'::text, 'approved'::text, 'completed'::text, 'cancelled'::text]))");

        Schema::table('packaging_records', function (Blueprint $table) {
            $table->string('shipping_company', 100)->nullable()->after('dimensions');
            $table->string('shipping_tracking', 100)->nullable()->after('shipping_company');
            $table->date('shipping_date')->nullable()->after('shipping_tracking');
            $table->text('address')->nullable()->after('shipping_date');
            $table->string('city', 100)->nullable()->after('address');
            $table->string('country', 5)->nullable()->default('TR')->after('city');
            $table->foreignUuid('packed_by')->nullable()->constrained('users')->nullOnDelete()->after('updated_by');
            $table->jsonb('items')->nullable()->default('[]')->after('packed_by');
            $table->decimal('desi', 8, 2)->nullable()->after('items');
            $table->string('package_barcode', 100)->nullable()->after('desi');
            $table->decimal('width', 8, 2)->nullable()->after('package_barcode');
            $table->decimal('height', 8, 2)->nullable()->after('width');
            $table->decimal('depth', 8, 2)->nullable()->after('height');
        });
    }

    public function down(): void
    {
        Schema::table('packaging_records', function (Blueprint $table) {
            $table->dropForeign(['packed_by']);
            $table->dropColumn([
                'shipping_company', 'shipping_tracking', 'shipping_date',
                'address', 'city', 'country', 'packed_by',
                'items', 'desi', 'package_barcode', 'width', 'height', 'depth',
            ]);
        });

        DB::statement("ALTER TABLE packaging_records DROP CONSTRAINT IF EXISTS packaging_records_status_check");
        DB::statement("ALTER TABLE packaging_records ADD CONSTRAINT packaging_records_status_check CHECK (status::text = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))");
    }
};
