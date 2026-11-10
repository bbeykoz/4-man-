<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Belge satırı.
 *
 * Tutarlar işlem para biriminde. Satır bazında vergi hesaplanır ve yuvarlanır;
 * belge toplamı satırların toplamıdır, tersi değil.
 */
class DocumentLine extends Model
{
    use HasUuid, HasCompanyScope;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'line_no'               => 'integer',
            'quantity'              => 'decimal:6',
            'unit_price'            => 'decimal:6',
            'discount_rate'         => 'decimal:4',
            'discount_amount'       => 'decimal:6',
            'net_amount'            => 'decimal:6',
            'tax_rate'              => 'decimal:4',
            'tax_amount'            => 'decimal:6',
            'non_deductible_amount' => 'decimal:6',
            'gross_amount'          => 'decimal:6',
            'dimensions'            => 'array',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function taxCode(): BelongsTo
    {
        return $this->belongsTo(TaxCode::class, 'tax_code_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ChartAccount::class, 'account_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /** İskonto öncesi brüt satır tutarı. */
    public function grossLineAmount(): float
    {
        return round((float) $this->quantity * (float) $this->unit_price, 2);
    }
}
