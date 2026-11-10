<?php

namespace App\Models\Accounting;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Ödemenin bir belgeye uygulanan kısmı ve doğan kur farkı. */
class PaymentAllocation extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['allocated_amount' => 'decimal:6', 'fx_difference' => 'decimal:6'];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }
}
