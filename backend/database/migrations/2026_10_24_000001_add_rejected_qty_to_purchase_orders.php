<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Teslim alınıp sonra reddedilen (kalite kontrolde geçmeyen ya da girişi iptal edilen)
 * miktar ayrı tutulur.
 *
 * Eskiden teslim alınan miktar received_qty'ye yazılıyor, sonradan reddedilse bile
 * orada kalıyordu: sipariş "tamamen teslim alındı" görünüyor, tedarikçi performansı
 * ve karşılama oranı kabul edilmeyen malı da sayıyordu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->decimal('rejected_qty', 15, 3)->default(0)->after('damaged_qty');
        });

        Schema::table('purchase_order_receipt_items', function (Blueprint $table) {
            $table->decimal('rejected_quantity', 15, 3)->default(0)->after('damaged_quantity');
            $table->string('rejection_reason', 500)->nullable()->after('rejected_quantity');
            $table->timestamp('rejected_at')->nullable()->after('rejection_reason');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropColumn('rejected_qty');
        });

        Schema::table('purchase_order_receipt_items', function (Blueprint $table) {
            $table->dropColumn(['rejected_quantity', 'rejection_reason', 'rejected_at']);
        });
    }
};
