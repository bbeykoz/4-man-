<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('phone', 20)->nullable();
            $table->string('password');
            $table->string('avatar')->nullable();
            $table->string('title')->nullable();        // Unvan
            $table->enum('status', ['active', 'inactive', 'suspended'])->default('active');
            $table->timestamp('email_verified_at')->nullable();
            $table->string('two_factor_secret')->nullable();
            $table->boolean('two_factor_enabled')->default(false);
            $table->timestamp('last_login_at')->nullable();
            $table->string('last_login_ip', 45)->nullable();
            $table->string('timezone')->default('Europe/Istanbul');
            $table->string('locale', 5)->default('tr');
            $table->jsonb('preferences')->default('{}');
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'status']);
            $table->index(['email', 'deleted_at']);
            $table->index('last_login_at');
        });

        // companies tablosuna owner_id ekle (users tablosu oluştuktan sonra)
        Schema::table('companies', function (Blueprint $table) {
            $table->foreignUuid('owner_id')->nullable()->after('id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropForeignIdFor(\App\Models\User::class, 'owner_id');
            $table->dropColumn('owner_id');
        });
        Schema::dropIfExists('users');
    }
};
