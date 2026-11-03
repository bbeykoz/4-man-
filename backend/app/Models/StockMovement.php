<?php

namespace App\Models;

use App\Models\Modules\WarehouseRecord;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stok defteri satırı. Sadece eklenir; düzeltme ters kayıtla (reversal) yapılır.
 * Bakiye = aynı ürün/depo/kova (bucket)/lot satırlarının quantity toplamı.
 */
class StockMovement extends Model
{
    use HasUuid;

    public const BUCKET_AVAILABLE  = 'available';
    public const BUCKET_QUARANTINE = 'quarantine';
    public const BUCKET_DAMAGED    = 'damaged';
    public const BUCKET_RESERVED   = 'reserved';

    public const BUCKETS = [
        self::BUCKET_AVAILABLE,
        self::BUCKET_QUARANTINE,
        self::BUCKET_DAMAGED,
        self::BUCKET_RESERVED,
    ];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'quantity'    => 'float',
            'unit_cost'   => 'decimal:2',
            'expiry_date' => 'date',
            'occurred_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(WarehouseProduct::class, 'product_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function record(): BelongsTo
    {
        return $this->belongsTo(WarehouseRecord::class, 'record_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeForCompany($query, ?string $companyId)
    {
        return $companyId ? $query->where('company_id', $companyId) : $query->whereRaw('1 = 0');
    }

    /**
     * Silinmiş ürünlerin defter satırları hiçbir hesaba girmez.
     *
     * Ürün silindiğinde hareketleri yerinde kalıyordu; ürün listelerinde görünmeyen
     * bu satırlar depo toplamlarına, stok değerine, devir hızına ve transfer
     * önerilerine ekleniyordu ("hayalet stok"). Genel kapsam olarak tanımlandı ki
     * tek tek sorgulara bağlı kalmasın.
     */
    protected static function booted(): void
    {
        static::addGlobalScope('existingProduct', function (Builder $query) {
            $query->whereHas('product');
        });
    }

    /** Denetim/temizlik için: silinmiş ürünlerin satırlarını da getirir. */
    public function scopeWithDeletedProducts($query)
    {
        return $query->withoutGlobalScope('existingProduct');
    }
}
