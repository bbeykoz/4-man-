<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SKU ve barkod şirket içinde benzersiz olmalı; aynı kod iki üründe stoğu karıştırıyordu.
 *
 * Kısıt kısmi indeks olarak kurulur: boş kodlar ve silinmiş ürünler kapsam dışıdır.
 * Veride tekrar varsa indeks kurulamaz; o durumda migration hata vermeden atlar ve
 * tekrarları listeler. Kodun kendisi zaten uygulama tarafında engelleniyor.
 */
return new class extends Migration
{
    private const INDEXES = [
        'warehouse_products_company_sku_unique'     => 'sku',
        'warehouse_products_company_barcode_unique' => 'barcode',
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $index => $column) {
            $duplicates = DB::table('warehouse_products')
                ->select('company_id', $column, DB::raw('count(*) as total'))
                ->whereNotNull($column)
                ->where($column, '<>', '')
                ->whereNull('deleted_at')
                ->groupBy('company_id', $column)
                ->havingRaw('count(*) > 1')
                ->get();

            if ($duplicates->isNotEmpty()) {
                $list = $duplicates->map(fn ($d) => "{$d->$column} ({$d->total})")->implode(', ');
                echo "  ! {$column} tekrarlı olduğu için benzersizlik kısıtı kurulmadı: {$list}" . PHP_EOL;
                echo "    Tekrarları düzelttikten sonra bu migration'ı tekrar çalıştırın." . PHP_EOL;
                continue;
            }

            DB::statement(
                "CREATE UNIQUE INDEX IF NOT EXISTS {$index} ON warehouse_products (company_id, {$column}) " .
                "WHERE {$column} IS NOT NULL AND {$column} <> '' AND deleted_at IS NULL"
            );
        }
    }

    public function down(): void
    {
        foreach (array_keys(self::INDEXES) as $index) {
            DB::statement("DROP INDEX IF EXISTS {$index}");
        }

        // Şema dosyasının tutarlı kalması için tabloya dokunulmaz
        Schema::hasTable('warehouse_products');
    }
};
