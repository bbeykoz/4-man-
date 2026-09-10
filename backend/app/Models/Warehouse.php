<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Warehouse extends Model
{
    use HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'capacity'   => 'integer',
            'is_default' => 'boolean',
            'is_active'  => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function scopeForCompany($query, ?string $companyId)
    {
        return $companyId ? $query->where('company_id', $companyId) : $query->whereRaw('1 = 0');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /** Şirketin varsayılan deposu; yoksa ilk aktif depo. */
    public static function defaultFor(string $companyId): ?self
    {
        return static::forCompany($companyId)->active()
            ->orderByDesc('is_default')
            ->orderBy('created_at')
            ->first();
    }
}
