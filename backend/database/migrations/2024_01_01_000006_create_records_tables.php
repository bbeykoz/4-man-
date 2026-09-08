<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Muhasebe kayıtları
        Schema::create('accounting_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('record_number', 30)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['invoice', 'expense', 'payment', 'receipt', 'other'])->default('invoice');
            $table->enum('status', ['draft', 'pending', 'approved', 'rejected', 'completed', 'cancelled'])->default('draft');
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('currency', 3)->default('TRY');
            $table->string('reference_number')->nullable();
            $table->string('vendor')->nullable();
            $table->date('due_date')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'type']);
            $table->index('due_date');
        });

        // Marketing kayıtları
        Schema::create('marketing_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('record_number', 30)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['campaign', 'lead', 'content', 'event', 'other'])->default('campaign');
            $table->enum('status', ['draft', 'pending', 'in_progress', 'completed', 'cancelled'])->default('draft');
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->string('channel')->nullable();   // social, email, sms, ads
            $table->decimal('budget', 15, 2)->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->string('target_audience')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
        });

        // Depo kayıtları (Müdür + Kontrolcü ortak)
        Schema::create('warehouse_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('record_number', 30)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['stock_in', 'stock_out', 'transfer', 'adjustment', 'inspection'])->default('stock_in');
            $table->enum('status', ['draft', 'pending', 'in_progress', 'completed', 'cancelled', 'approved'])->default('draft');
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->string('product_name')->nullable();
            $table->string('sku')->nullable();
            $table->decimal('quantity', 10, 2)->default(0);
            $table->string('unit', 20)->nullable();
            $table->string('location')->nullable();
            $table->string('batch_number')->nullable();
            $table->date('expiry_date')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'type']);
        });

        // Paketleme kayıtları
        Schema::create('packaging_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('record_number', 30)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('status', ['pending', 'in_progress', 'completed', 'cancelled'])->default('pending');
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->string('order_number')->nullable();
            $table->string('customer_name')->nullable();
            $table->unsignedInteger('item_count')->default(0);
            $table->string('package_type')->nullable();
            $table->decimal('weight', 8, 2)->nullable();
            $table->string('dimensions')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
        });

        // İade kayıtları
        Schema::create('return_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('record_number', 30)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['customer_return', 'supplier_return', 'damaged', 'expired'])->default('customer_return');
            $table->enum('status', ['pending', 'in_progress', 'approved', 'rejected', 'completed'])->default('pending');
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->string('order_number')->nullable();
            $table->string('customer_name')->nullable();
            $table->string('reason')->nullable();
            $table->decimal('refund_amount', 15, 2)->nullable();
            $table->string('condition')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
        });

        // Gümrükleme kayıtları
        Schema::create('customs_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('record_number', 30)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['import', 'export', 'transit', 'temporary'])->default('import');
            $table->enum('status', ['draft', 'submitted', 'in_review', 'approved', 'rejected', 'completed'])->default('draft');
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->string('declaration_number')->nullable();
            $table->string('hs_code')->nullable();
            $table->string('country_of_origin')->nullable();
            $table->string('port_of_entry')->nullable();
            $table->decimal('declared_value', 15, 2)->nullable();
            $table->string('currency', 3)->default('USD');
            $table->decimal('customs_duty', 15, 2)->nullable();
            $table->date('expected_date')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'type']);
        });

        // Nakliye kayıtları
        Schema::create('shipping_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('record_number', 30)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['delivery', 'pickup', 'transfer', 'express'])->default('delivery');
            $table->enum('status', ['pending', 'confirmed', 'in_transit', 'delivered', 'failed', 'cancelled'])->default('pending');
            $table->enum('priority', ['low', 'medium', 'high', 'critical'])->default('medium');
            $table->string('tracking_number')->nullable();
            $table->string('carrier')->nullable();
            $table->string('origin_address')->nullable();
            $table->string('destination_address')->nullable();
            $table->decimal('weight', 8, 2)->nullable();
            $table->decimal('distance_km', 8, 2)->nullable();
            $table->decimal('shipping_cost', 15, 2)->nullable();
            $table->string('vehicle_plate')->nullable();
            $table->string('driver_name')->nullable();
            $table->timestamp('pickup_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->date('estimated_delivery')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->jsonb('meta')->default('{}');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['company_id', 'status']);
            $table->index('tracking_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipping_records');
        Schema::dropIfExists('customs_records');
        Schema::dropIfExists('return_records');
        Schema::dropIfExists('packaging_records');
        Schema::dropIfExists('warehouse_records');
        Schema::dropIfExists('marketing_records');
        Schema::dropIfExists('accounting_records');
    }
};
