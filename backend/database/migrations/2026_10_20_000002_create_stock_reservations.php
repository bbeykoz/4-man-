<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Booked (rezerve) stok.
 *
 * Stok çıkışı kaydı açıldığında ürün "available" kovasından "reserved" kovasına alınır.
 * Böylece verilen siparişler depodaki serbest stokla karışmaz. Teslimat yapıldıkça
 * rezerveden düşülür; kalan miktar iptalde serbest stoğa geri döner.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('record_id')->unique()->constrained('warehouse_records')->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('warehouse_products')->cascadeOnDelete();
            $table->foreignUuid('warehouse_id')->constrained('warehouses')->cascadeOnDelete();

            // Sipariş miktarı; rezerve edilebilen kısım stoğa bağlı olduğundan ayrı tutulur
            $table->decimal('quantity', 15, 3);
            $table->decimal('reserved_quantity', 15, 3)->default(0);
            $table->decimal('delivered_quantity', 15, 3)->default(0);

            $table->string('status', 20)->default('open'); // open | delivered | cancelled
            $table->string('reference')->nullable();       // sipariş no / müşteri
            $table->date('due_date')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'product_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
    }
};
