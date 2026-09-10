<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Ürün kataloğu tablosu ────────────────────────────────────────────
        if (!Schema::hasTable('warehouse_products')) {
            Schema::create('warehouse_products', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->string('sku')->nullable();
                $table->string('barcode')->nullable();
                $table->string('unit', 20)->default('adet');
                $table->string('category')->nullable();
                $table->text('description')->nullable();
                $table->decimal('unit_price', 15, 2)->nullable();
                $table->integer('min_stock')->default(0);
                $table->integer('current_stock')->default(0);
                $table->boolean('is_active')->default(true);
                $table->jsonb('meta')->default('{}');
                $table->timestamps();
                $table->softDeletes();

                $table->index(['company_id', 'name']);
                $table->index(['company_id', 'sku']);
                $table->index(['company_id', 'barcode']);
            });
        }

        // ─── warehouse_records'a yeni alanlar ────────────────────────────────
        if (!Schema::hasTable('warehouse_records')) {
            return;
        }

        Schema::table('warehouse_records', function (Blueprint $table) {
            if (!Schema::hasColumn('warehouse_records', 'product_id')) {
                $table->foreignUuid('product_id')
                    ->nullable()
                    ->constrained('warehouse_products')
                    ->nullOnDelete()
                    ->after('description');
            }

            if (!Schema::hasColumn('warehouse_records', 'from_location')) {
                $table->string('from_location')->nullable()->after('location');
            }

            if (!Schema::hasColumn('warehouse_records', 'to_location')) {
                $table->string('to_location')->nullable()->after('from_location');
            }

            if (!Schema::hasColumn('warehouse_records', 'operator_id')) {
                $table->foreignUuid('operator_id')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete()
                    ->after('approved_by');
            }

            if (!Schema::hasColumn('warehouse_records', 'transaction_date')) {
                $table->date('transaction_date')->nullable()->after('completed_at');
            }
        });

        // ─── type enum'a stock_count ekle ────────────────────────────────────
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE warehouse_records DROP CONSTRAINT IF EXISTS warehouse_records_type_check");
            DB::statement("ALTER TABLE warehouse_records ADD CONSTRAINT warehouse_records_type_check
                CHECK (type IN ('stock_in','stock_out','transfer','adjustment','inspection','stock_count'))");
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('warehouse_records')) {
            Schema::table('warehouse_records', function (Blueprint $table) {
                if (Schema::hasColumn('warehouse_records', 'product_id')) {
                    $table->dropConstrainedForeignId('product_id');
                }

                $columns = ['from_location', 'to_location', 'operator_id', 'transaction_date'];
                foreach ($columns as $column) {
                    if (Schema::hasColumn('warehouse_records', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE warehouse_records DROP CONSTRAINT IF EXISTS warehouse_records_type_check");
            DB::statement("ALTER TABLE warehouse_records ADD CONSTRAINT warehouse_records_type_check
                CHECK (type IN ('stock_in','stock_out','transfer','adjustment','inspection'))");
        }

        Schema::dropIfExists('warehouse_products');
    }
};
