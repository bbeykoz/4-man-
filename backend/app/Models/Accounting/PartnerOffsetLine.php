<?php

namespace App\Models\Accounting;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Mahsubun kapattığı tek belge ve uygulanan tutar. */
class PartnerOffsetLine extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['applied_amount' => 'decimal:6'];
    }

    public function offset(): BelongsTo
    {
        return $this->belongsTo(PartnerOffset::class, 'offset_id');
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }
}
