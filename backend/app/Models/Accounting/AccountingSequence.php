<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Numara sayacı (şirket + anahtar + yıl).
 *
 * Projedeki HasRecordNumber trait'i "son kaydı bul, bir artır" yaklaşımını
 * kullanıyor; eşzamanlı iki post aynı numarayı alabilir. Yasal belge
 * numarasında bu kabul edilemez, bu yüzden ayrı bir sayaç tablosu var ve
 * SequenceService satır kilidiyle artırıyor.
 */
class AccountingSequence extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'year'       => 'integer',
            'next_value' => 'integer',
            'padding'    => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
