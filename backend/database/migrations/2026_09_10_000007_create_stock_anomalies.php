<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Anomali tespiti (Faz 6): tespit edilen sapmalar ve inceleme durumu. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_anomalies', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('fingerprint', 191); // aynı sapma tekrar taramada tekrar açılmasın
            // outflow_spike, large_movement, damage_spike, return_spike, count_variance,
            // frequent_adjustment, user_reversals, user_adjustments, off_hours
            $table->string('type', 40);
            $table->unsignedTinyInteger('severity');
            $table->foreignUuid('product_id')->nullable()->constrained('warehouse_products')->cascadeOnDelete();
            $table->foreignUuid('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('record_id')->nullable()->constrained('warehouse_records')->nullOnDelete();
            $table->date('detected_for');
            $table->string('message', 500);
            $table->jsonb('metrics')->nullable();
            $table->string('status', 20)->default('open'); // open / acknowledged / dismissed
            $table->foreignUuid('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('review_note', 500)->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'fingerprint']);
            $table->index(['company_id', 'status', 'severity']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_anomalies');
    }
};
