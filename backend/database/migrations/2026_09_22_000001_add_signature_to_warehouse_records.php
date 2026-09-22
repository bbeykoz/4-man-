<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Mal kabul / teslim imzası: kaydı teslim alan kişinin çizdiği imza. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_records', function (Blueprint $table) {
            $table->string('signature_path')->nullable()->after('qc_photo_disk');
            $table->string('signature_disk', 30)->nullable()->after('signature_path');
            $table->string('signed_by_name')->nullable()->after('signature_disk');
            $table->foreignUuid('signed_by')->nullable()->after('signed_by_name')->constrained('users')->nullOnDelete();
            $table->timestamp('signed_at')->nullable()->after('signed_by');
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_records', function (Blueprint $table) {
            $table->dropConstrainedForeignId('signed_by');
            $table->dropColumn(['signature_path', 'signature_disk', 'signed_by_name', 'signed_at']);
        });
    }
};
