<?php

namespace App\Models\Accounting;

use App\Enums\Accounting\DocumentType;
use App\Models\Company;
use App\Traits\HasCompanyScope;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Belge numara serisi.
 *
 * Mevzuat seri bazında yetki ve atlamasız sıra istiyor. Bir seriye yetkili
 * olmayan kullanıcı o seriden belge kesemez; numara SequenceService tarafından
 * satır kilidiyle üretilir.
 */
class DocumentSeries extends Model
{
    use HasUuid, SoftDeletes, HasCompanyScope;

    protected $table = 'document_series';
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'doc_type'         => DocumentType::class,
            'padding'          => 'integer',
            'reset_yearly'     => 'boolean',
            'is_default'       => 'boolean',
            'is_active'        => 'boolean',
            'allowed_user_ids' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'series_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeForType(Builder $query, string $tur): Builder
    {
        return $query->where('doc_type', $tur);
    }

    /** Kullanıcı bu seriden belge kesebilir mi. Liste boşsa herkese açık. */
    public function allowsUser(?string $userId): bool
    {
        $izinliler = $this->allowed_user_ids ?? [];

        return $izinliler === [] || ($userId !== null && in_array($userId, $izinliler, true));
    }

    /** Sayaç anahtarı; yıllık sıfırlanan seride yıl ayrıca kullanılır. */
    public function sequenceKey(): string
    {
        return "document:{$this->doc_type->value}:{$this->code}";
    }

    public function numberPrefix(): string
    {
        return $this->prefix ?: ($this->doc_type->prefix() . '-' . $this->code);
    }
}
