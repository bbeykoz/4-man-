<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Sipariş kalemine fiş/fatura (görsel veya PDF) eklenebilmesi için. */
    public function up(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->string('receipt_path')->nullable()->after('suggestion');
            $table->string('receipt_disk')->nullable()->after('receipt_path');
            $table->string('receipt_original_name')->nullable()->after('receipt_disk');
            $table->string('receipt_mime')->nullable()->after('receipt_original_name');
            $table->timestamp('receipt_uploaded_at')->nullable()->after('receipt_mime');
            $table->foreignUuid('receipt_uploaded_by')->nullable()->after('receipt_uploaded_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('receipt_uploaded_by');
            $table->dropColumn(['receipt_path', 'receipt_disk', 'receipt_original_name', 'receipt_mime', 'receipt_uploaded_at']);
        });
    }
};
