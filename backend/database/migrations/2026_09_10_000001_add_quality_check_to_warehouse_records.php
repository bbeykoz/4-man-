<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_records', function (Blueprint $table) {
            // null = kalite kontrol öncesi eski kayıt, pending = bekliyor, passed = onaylı
            $table->string('qc_status', 20)->nullable()->after('status');
            $table->string('qc_photo_path')->nullable()->after('qc_status');
            $table->string('qc_photo_disk', 20)->nullable()->after('qc_photo_path');
            $table->foreignUuid('qc_checked_by')->nullable()->after('qc_photo_disk')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('qc_checked_at')->nullable()->after('qc_checked_by');

            $table->index(['company_id', 'qc_status']);
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_records', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'qc_status']);
            $table->dropConstrainedForeignId('qc_checked_by');
            $table->dropColumn(['qc_status', 'qc_photo_path', 'qc_photo_disk', 'qc_checked_at']);
        });
    }
};
