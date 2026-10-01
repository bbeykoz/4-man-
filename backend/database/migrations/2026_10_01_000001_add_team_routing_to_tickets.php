<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Destek talepleri artık platform ekiplerine dağıtılır: destek, satış, teknik.
 * Ayrıca tanıtım sayfasındaki form kullanıcı hesabı olmadan talep açabilsin diye
 * user_id boş bırakılabilir; bu durumda iletişim bilgileri talebin üstünde durur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->string('team', 20)->default('support')->after('type'); // support | sales | technical
            $table->foreignUuid('assigned_to')->nullable()->after('team')->constrained('users')->nullOnDelete();
            $table->string('source', 20)->default('panel')->after('assigned_to'); // panel | marketing
            $table->string('contact_name')->nullable()->after('source');
            $table->string('contact_email')->nullable()->after('contact_name');
            $table->string('contact_phone', 40)->nullable()->after('contact_email');
            $table->string('contact_company')->nullable()->after('contact_phone');

            $table->index(['team', 'status']);
        });

        // Mevcut talepler: fikir bildirimleri satışa, diğerleri desteğe
        DB::table('tickets')->where('type', 'idea')->update(['team' => 'sales']);

        Schema::table('tickets', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assigned_to');
            $table->dropIndex(['team', 'status']);
            $table->dropColumn(['team', 'source', 'contact_name', 'contact_email', 'contact_phone', 'contact_company']);
        });
    }
};
