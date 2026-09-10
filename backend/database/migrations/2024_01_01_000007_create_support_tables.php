<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Yorum / not tablosu (polymorphic)
        Schema::create('record_comments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuidMorphs('commentable'); // commentable_type + commentable_id
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->text('content');
            $table->boolean('is_internal')->default(false);
            $table->timestamps();
            $table->softDeletes();
            // uuidMorphs zaten index oluşturuyor, duplicate olmaması için kaldırıldı
        });

        // Dosya ekleri (polymorphic)
        Schema::create('record_attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuidMorphs('attachable');
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('original_name');
            $table->string('file_path');
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('size')->default(0); // bytes
            $table->string('disk', 20)->default('s3');
            $table->timestamps();
            // uuidMorphs zaten index oluşturuyor
        });

        // Aktivite logu
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignUuid('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action');               // User.created
            $table->string('model_type')->nullable();
            $table->string('model_id', 50)->nullable();
            $table->text('description')->nullable();
            $table->jsonb('old_values')->nullable();
            $table->jsonb('new_values')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['company_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
            $table->index(['model_type', 'model_id']);
            $table->index('action');
        });

        // Bildirimler
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 50)->default('info'); // info, success, warning, error
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('action_url')->nullable();
            $table->jsonb('data')->default('{}');
            $table->timestamp('read_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'read_at']);
            $table->index(['company_id', 'created_at']);
        });

        // Kullanıcı oturumları
        Schema::create('user_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('token_hash');
            $table->string('device_name')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_activity_at')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'is_active']);
            $table->index('token_hash');
        });

        // Ayarlar
        Schema::create('settings', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignUuid('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('key');
            $table->jsonb('value')->nullable();
            $table->string('group', 50)->default('general');
            $table->timestamps();

            $table->unique(['company_id', 'key']);
            $table->index(['company_id', 'group']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
        Schema::dropIfExists('user_sessions');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('record_attachments');
        Schema::dropIfExists('record_comments');
    }
};
