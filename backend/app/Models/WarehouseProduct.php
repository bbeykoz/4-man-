<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class WarehouseProduct extends Model
{
    use HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'unit_price'    => 'decimal:2',
            'min_stock'     => 'float',
            'lead_time_days'=> 'integer',
            'safety_stock'  => 'float',
            'min_order_qty' => 'float',
            'order_multiple'=> 'float',
            'reorder_blocked'    => 'boolean',
            'reorder_blocked_at' => 'datetime',
            'current_stock' => 'float', // kullanılabilir stok toplamı; stok defterinden senkronlanır
            'is_active'     => 'boolean',
            'meta'          => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class, 'product_id');
    }

    public function defaultSupplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'default_supplier_id');
    }

    public function scopeForCompany($query, ?string $companyId)
    {
        // Şirketsiz hesap (süper admin) hiçbir şirketin ürününü görmez
        return $companyId ? $query->where('company_id', $companyId) : $query->whereRaw('1 = 0');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeSearch($query, string $term)
    {
        $operator = $query->getModel()->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

        return $query->where(fn($q) => $q
            ->where('name', $operator, "%{$term}%")
            ->orWhere('sku', $operator, "%{$term}%")
            ->orWhere('barcode', $operator, "%{$term}%")
        );
    }

    /** Stok değeri: current_stock × unit_price */
    public function getStockValueAttribute(): float
    {
        return ($this->current_stock ?? 0) * ($this->unit_price ?? 0);
    }

    /** Kritik stok altında mı? */
    public function getIsCriticalStockAttribute(): bool
    {
        return $this->current_stock <= $this->min_stock;
    }
}
