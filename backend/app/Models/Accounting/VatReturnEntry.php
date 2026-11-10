<?php

namespace App\Models\Accounting;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Beyana giren belge satırının anlık görüntüsü. */
class VatReturnEntry extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'tax_date'       => 'date',
            'base'           => 'decimal:6',
            'tax'            => 'decimal:6',
            'non_deductible' => 'decimal:6',
        ];
    }

    public function vatReturn(): BelongsTo
    {
        return $this->belongsTo(VatReturn::class, 'vat_return_id');
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }
}
