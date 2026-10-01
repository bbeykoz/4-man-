<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Platform (hizmet veren taraf) rolleri.
 *
 * Bugüne kadar seviye 1 = süper admin demekti ve süper admin tüm izin kontrollerini atlıyordu.
 * Artık seviye 1 + company_id null olan roller "platform rolü" sayılır; bunların içinden
 * yalnızca is_super işaretli olan her şeyi yapabilir. Diğer platform rolleri (destek, satış,
 * teknik ekip) sadece kendilerine verilen izinleri kullanır.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->boolean('is_super')->default(false)->after('is_system');
        });

        DB::table('roles')
            ->whereNull('company_id')
            ->where('slug', 'super-admin')
            ->update(['is_super' => true]);
    }

    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn('is_super');
        });
    }
};
