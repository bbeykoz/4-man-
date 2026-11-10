<?php

namespace App\Models\Accounting;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Cari adresi: fatura, teslimat ya da diğer. */
class PartnerAddress extends Model
{
    use HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean'];
    }

    public function partner(): BelongsTo
    {
        return $this->belongsTo(BusinessPartner::class, 'partner_id');
    }

    /** Belgeye kopyalanacak düz metin hali. */
    public function toArrayForDocument(): array
    {
        return array_filter([
            'line1'       => $this->line1,
            'line2'       => $this->line2,
            'city'        => $this->city,
            'postal_code' => $this->postal_code,
            'region'      => $this->region,
            'country'     => $this->country_code,
        ]);
    }

    public function oneLine(): string
    {
        return implode(', ', array_filter([
            $this->line1, $this->line2, $this->postal_code, $this->city, $this->country_code,
        ]));
    }
}
