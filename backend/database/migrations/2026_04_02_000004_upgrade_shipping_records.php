<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipping_records', function (Blueprint $table) {
            $table->jsonb('items')->nullable()->default('[]')->after('approved_by');
            $table->string('order_number', 100)->nullable()->after('items');
            $table->string('customer_name', 255)->nullable()->after('order_number');
            $table->string('transport_mode', 20)->nullable()->after('customer_name');
            $table->string('recipient_name', 255)->nullable()->after('transport_mode');
            $table->string('recipient_phone', 50)->nullable()->after('recipient_name');
            $table->date('departure_date')->nullable()->after('recipient_phone');
            $table->date('actual_delivery')->nullable()->after('departure_date');
            $table->unsignedInteger('pallet_count')->nullable()->after('actual_delivery');
            $table->decimal('fuel_cost', 15, 2)->nullable()->after('shipping_cost');
            $table->decimal('driver_cost', 15, 2)->nullable()->after('fuel_cost');
            $table->decimal('extra_cost', 15, 2)->nullable()->after('driver_cost');
        });
    }

    public function down(): void
    {
        Schema::table('shipping_records', function (Blueprint $table) {
            $table->dropColumn([
                'items', 'order_number', 'customer_name', 'transport_mode',
                'recipient_name', 'recipient_phone', 'departure_date', 'actual_delivery',
                'pallet_count', 'fuel_cost', 'driver_cost', 'extra_cost',
            ]);
        });
    }
};
