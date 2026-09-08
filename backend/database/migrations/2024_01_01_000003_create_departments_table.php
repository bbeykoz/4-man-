<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->string('type')->nullable(); // accounting, marketing, warehouse, etc.
            $table->string('description')->nullable();
            $table->string('color', 20)->default('blue');
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->jsonb('settings')->default('{}');
            $table->unsignedSmallInteger('order_index')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'slug']);
            $table->index(['company_id', 'status']);
        });

        // users tablosuna department_id ekle
        Schema::table('users', function (Blueprint $table) {
            $table->foreignUuid('department_id')->nullable()->after('company_id')->constrained()->nullOnDelete();
        });

        // departments tablosuna manager_id ekle
        Schema::table('departments', function (Blueprint $table) {
            $table->foreignUuid('manager_id')->nullable()->after('company_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeignIdFor(\App\Models\Department::class, 'department_id');
            $table->dropColumn('department_id');
        });
        Schema::dropIfExists('departments');
    }
};
