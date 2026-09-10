<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customs_records', function (Blueprint $table) {
            $table->jsonb('items')->nullable()->default('[]')->after('approved_by');
            $table->string('company_name', 255)->nullable()->after('items');
            $table->string('tax_number', 50)->nullable()->after('company_name');
            $table->string('customs_agent', 255)->nullable()->after('tax_number');
            $table->string('incoterms', 10)->nullable()->after('customs_agent');
            $table->string('transport_type', 20)->nullable()->after('incoterms');
            $table->string('carrier_name', 255)->nullable()->after('transport_type');
            $table->string('container_number', 100)->nullable()->after('carrier_name');
            $table->string('vehicle_plate', 20)->nullable()->after('container_number');
            $table->string('bl_number', 100)->nullable()->after('vehicle_plate');
            $table->decimal('vat_amount', 15, 2)->nullable()->after('customs_duty');
            $table->decimal('other_taxes', 15, 2)->nullable()->after('vat_amount');
            $table->decimal('exchange_rate', 10, 4)->nullable()->after('other_taxes');
            $table->decimal('net_weight', 10, 2)->nullable()->after('expected_date');
            $table->decimal('gross_weight', 10, 2)->nullable()->after('net_weight');
            $table->string('origin_country', 100)->nullable()->after('country_of_origin');
            $table->string('destination_country', 100)->nullable()->after('origin_country');
        });
    }

    public function down(): void
    {
        Schema::table('customs_records', function (Blueprint $table) {
            $table->dropColumn([
                'items', 'company_name', 'tax_number', 'customs_agent',
                'incoterms', 'transport_type', 'carrier_name', 'container_number',
                'vehicle_plate', 'bl_number', 'vat_amount', 'other_taxes',
                'exchange_rate', 'net_weight', 'gross_weight',
                'origin_country', 'destination_country',
            ]);
        });
    }
};
