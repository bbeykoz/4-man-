<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stok risk skoru (Faz 2):
 * - Ürün parametreleri: tedarik süresi, güvenlik stoğu
 * - Günlük risk anlık görüntüsü (risk trendi grafiği için geçmiş)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->unsignedSmallInteger('lead_time_days')->nullable()->after('min_stock');
            $table->decimal('safety_stock', 15, 3)->nullable()->after('lead_time_days');
        });

        Schema::create('stock_risk_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('warehouse_products')->cascadeOnDelete();
            $table->date('snapshot_date');
            $table->unsignedTinyInteger('risk_score');
            $table->string('risk_level', 10);
            $table->string('driver', 20)->nullable();
            $table->decimal('available', 15, 3);
            $table->decimal('daily_consumption', 15, 3);
            $table->decimal('days_of_cover', 10, 1)->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'snapshot_date', 'product_id']);
            $table->index(['company_id', 'snapshot_date', 'risk_level']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_risk_snapshots');

        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->dropColumn(['lead_time_days', 'safety_stock']);
        });
    }
};
