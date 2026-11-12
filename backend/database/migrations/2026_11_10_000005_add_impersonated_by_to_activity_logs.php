<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Şirkete bağlanarak (impersonation) yapılan işlemin gerçek sahibi.
 *
 * Bağlantı sırasında istekler şirket sahibinin jetonuyla gidiyor, bu yüzden
 * user_id o şirketin sahibini gösteriyor. Platform ekibinin iş hacmi raporu
 * bu işlemleri de saymalı — gerçek aktör ayrı sütunda tutuluyor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->foreignUuid('impersonated_by')->nullable()->after('user_id')
                ->constrained('users')->nullOnDelete();
            $table->index(['impersonated_by', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('impersonated_by');
        });
    }
};
