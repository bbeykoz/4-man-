<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Stok defteri temeli (Faz 0):
 * - warehouses: şirketin fiziksel depoları
 * - stock_movements: onaylı hareketlerden oluşan, sadece eklenen (append-only) stok defteri
 * - warehouse_records: depo, yön ve stoğa işlenme alanları
 * - warehouse_products: kg/litre gibi birimler için ondalıklı stok
 */
return new class extends Migration
{
    private const TYPES_OLD = ['stock_in', 'stock_out', 'transfer', 'adjustment', 'inspection', 'stock_count'];
    private const TYPES_NEW = ['stock_in', 'stock_out', 'transfer', 'adjustment', 'inspection', 'stock_count', 'damage', 'return_in'];

    public function up(): void
    {
        Schema::create('warehouses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 20);
            $table->string('city')->nullable();
            $table->string('address', 500)->nullable();
            $table->unsignedInteger('capacity')->nullable(); // doluluk KPI'ı için, stok birimi cinsinden
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'code']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('product_id')->constrained('warehouse_products')->cascadeOnDelete();
            $table->foreignUuid('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignUuid('record_id')->nullable()->constrained('warehouse_records')->nullOnDelete();
            // stock_in, stock_out, transfer_in, transfer_out, adjustment, count_adjustment,
            // damage, return_in, qc_release, opening, reversal
            $table->string('movement_type', 30);
            // available (kullanılabilir), quarantine (karantina), damaged (hasarlı), reserved (rezerve)
            $table->string('bucket', 20);
            $table->decimal('quantity', 15, 3); // işaretli: + giriş, − çıkış
            $table->string('lot_number', 100)->nullable();
            $table->date('expiry_date')->nullable();
            $table->decimal('unit_cost', 15, 2)->nullable();
            $table->timestamp('occurred_at');
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 500)->nullable();
            $table->timestamps();

            $table->index(['company_id', 'product_id', 'warehouse_id', 'bucket']);
            $table->index(['company_id', 'occurred_at']);
            $table->index(['company_id', 'movement_type', 'occurred_at']);
        });

        Schema::table('warehouse_records', function (Blueprint $table) {
            $table->foreignUuid('warehouse_id')->nullable()->after('product_id')
                ->constrained('warehouses')->nullOnDelete();
            $table->foreignUuid('to_warehouse_id')->nullable()->after('warehouse_id')
                ->constrained('warehouses')->nullOnDelete();
            $table->string('direction', 10)->nullable()->after('to_warehouse_id'); // adjustment: increase / decrease
            $table->decimal('system_quantity', 15, 3)->nullable()->after('quantity'); // sayımda onay anındaki sistem stoğu
            $table->timestamp('posted_at')->nullable()->after('completed_at');
            $table->timestamp('reversed_at')->nullable()->after('posted_at');
        });

        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->decimal('current_stock', 15, 3)->default(0)->change();
            $table->decimal('min_stock', 15, 3)->default(0)->change();
        });

        if (DB::getDriverName() !== 'sqlite') {
            $this->replaceTypeCheck(self::TYPES_NEW);
        }

        // Her şirkete bir varsayılan depo
        foreach (DB::table('companies')->pluck('id') as $companyId) {
            DB::table('warehouses')->insert([
                'id'         => (string) Str::uuid(),
                'company_id' => $companyId,
                'name'       => 'Ana Depo',
                'code'       => 'ANA',
                'is_default' => true,
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::table('warehouse_records')->whereIn('type', ['damage', 'return_in'])->update(['type' => 'adjustment']);
            $this->replaceTypeCheck(self::TYPES_OLD);
        }

        Schema::table('warehouse_products', function (Blueprint $table) {
            $table->integer('current_stock')->default(0)->change();
            $table->integer('min_stock')->default(0)->change();
        });

        Schema::table('warehouse_records', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warehouse_id');
            $table->dropConstrainedForeignId('to_warehouse_id');
            $table->dropColumn(['direction', 'system_quantity', 'posted_at', 'reversed_at']);
        });

        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('warehouses');
    }

    private function replaceTypeCheck(array $types): void
    {
        $list = implode(',', array_map(fn($t) => "'{$t}'", $types));
        DB::statement('ALTER TABLE warehouse_records DROP CONSTRAINT IF EXISTS warehouse_records_type_check');
        DB::statement("ALTER TABLE warehouse_records ADD CONSTRAINT warehouse_records_type_check CHECK (type IN ({$list}))");
    }
};
