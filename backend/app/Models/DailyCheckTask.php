<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Şirketin tanımladığı, her gün tekrar eden genel kontrol görevi (ör. "Depo temizliği"). */
class DailyCheckTask extends Model
{
    use HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_active'  => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeForCompany($query, ?string $companyId)
    {
        return $companyId ? $query->where('company_id', $companyId) : $query->whereRaw('1 = 0');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
