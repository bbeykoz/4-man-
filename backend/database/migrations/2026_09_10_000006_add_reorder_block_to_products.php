<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Ölü / yavaş stok (Faz 4): ürünün yeniden siparişini durdurma işareti. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->boolean('reorder_blocked')->default(false)->after('order_multiple');
            $table->timestamp('reorder_blocked_at')->nullable()->after('reorder_blocked');
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->dropColumn(['reorder_blocked', 'reorder_blocked_at']);
        });
    }
};
