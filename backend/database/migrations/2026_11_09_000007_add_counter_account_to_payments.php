<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ödemeye karşı hesap alanı.
 *
 * Her tahsilat bir cariye ait değil: kasaya sermaye konması, banka faizi,
 * personel iadesi gibi hareketlerin karşı tarafı bir cari değil bir hesaptır.
 * Bu alan olmadan dağıtılmamış tutar avans hesabına gidiyordu, o hesap da
 * cari istediği için kayıt hiç yazılamıyordu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignUuid('counter_account_id')->nullable()->after('partner_id')
                ->constrained('chart_accounts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['counter_account_id']);
            $table->dropColumn('counter_account_id');
        });
    }
};
