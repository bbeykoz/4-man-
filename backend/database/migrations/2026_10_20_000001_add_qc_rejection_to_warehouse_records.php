<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kalite kontrol artık üç sonuçlu: bekliyor / onaylandı / reddedildi.
 * Red gerekçesi kayıtta tutulur; görsel zaten qc_photo_path'te.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_records', function (Blueprint $table) {
            $table->string('qc_note', 500)->nullable()->after('qc_checked_at');
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_records', function (Blueprint $table) {
            $table->dropColumn('qc_note');
        });
    }
};
