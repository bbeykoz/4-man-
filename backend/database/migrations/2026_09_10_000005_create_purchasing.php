<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Satın alma (Faz 3): tedarikçiler, satın alma siparişleri, teslim alımlar.
 * Teslim alınan sağlam miktar depo kaydı (stock_in) olarak stok defterine işlenir;
 * hasarlı miktar stoğa girmez, tedarikçi performansı için sipariş kaleminde tutulur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 30);
            $table->string('contact_name')->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('email')->nullable();
            $table->string('tax_number', 50)->nullable();
            $table->string('address', 500)->nullable();
            $table->unsignedSmallInteger('default_lead_time_days')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'code']);
        });

        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->foreignUuid('default_supplier_id')->nullable()->after('safety_stock')
                ->constrained('suppliers')->nullOnDelete();
            $table->decimal('min_order_qty', 15, 3)->nullable()->after('default_supplier_id');
            $table->decimal('order_multiple', 15, 3)->nullable()->after('min_order_qty'); // paket / koli katı
        });

        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('po_number', 30)->unique();
            $table->foreignUuid('supplier_id')->constrained('suppliers')->restrictOnDelete();
            $table->foreignUuid('warehouse_id')->constrained('warehouses')->restrictOnDelete(); // teslim deposu
            // draft, sent, partially_received, received, cancelled
            $table->string('status', 20)->default('draft');
            $table->string('source', 20)->default('manual'); // manual / suggestion
            $table->date('order_date')->nullable();
            $table->date('expected_date')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('received_at')->nullable(); // tamamen teslim alındığı an
            $table->timestamp('cancelled_at')->nullable();
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->string('currency', 3)->default('TRY');
            $table->text('notes')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'supplier_id']);
        });

        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('warehouse_products')->restrictOnDelete();
            $table->decimal('quantity', 15, 3);
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->decimal('received_qty', 15, 3)->default(0);
            $table->decimal('damaged_qty', 15, 3)->default(0);
            $table->jsonb('suggestion')->nullable(); // öneriden geldiyse hesap gerekçesi
            $table->timestamps();

            $table->unique(['purchase_order_id', 'product_id']);
        });

        Schema::create('purchase_order_receipts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->timestamp('received_at');
            $table->foreignUuid('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 500)->nullable();
            $table->timestamps();
        });

        Schema::create('purchase_order_receipt_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('receipt_id')->constrained('purchase_order_receipts')->cascadeOnDelete();
            $table->foreignUuid('purchase_order_item_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 15, 3);         // sağlam, stoğa giren
            $table->decimal('damaged_quantity', 15, 3)->default(0);
            $table->string('lot_number', 100)->nullable();
            $table->date('expiry_date')->nullable();
            $table->foreignUuid('record_id')->nullable()->constrained('warehouse_records')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_receipt_items');
        Schema::dropIfExists('purchase_order_receipts');
        Schema::dropIfExists('purchase_order_items');
        Schema::dropIfExists('purchase_orders');

        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('default_supplier_id');
            $table->dropColumn(['min_order_qty', 'order_multiple']);
        });

        Schema::dropIfExists('suppliers');
    }
};
