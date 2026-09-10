<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketing_records', function (Blueprint $table) {
            // Bütçe takibi
            $table->decimal('spent_amount', 15, 2)->default(0)->after('budget');

            // Sorumlu kişi
            $table->foreignUuid('assigned_to')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete()
                ->after('updated_by');

            // Hedef
            $table->string('goal_type', 50)->nullable()->after('target_audience'); // leads, visitors, sales, engagement, awareness
            $table->integer('goal_value')->nullable()->after('goal_type');

            // Reklam URL
            $table->string('ad_url')->nullable()->after('goal_value');

            // Performans metrikleri
            $table->integer('impressions')->default(0)->after('ad_url');
            $table->integer('clicks')->default(0)->after('impressions');
            $table->integer('conversions')->default(0)->after('clicks');
        });
    }

    public function down(): void
    {
        Schema::table('marketing_records', function (Blueprint $table) {
            $table->dropColumn([
                'spent_amount', 'assigned_to', 'goal_type', 'goal_value',
                'ad_url', 'impressions', 'clicks', 'conversions',
            ]);
        });
    }
};
