<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Kiracı şirketlerde oluşan hata / hatalı işlem kaydı.
 * Yalnız platform panelinden okunur; şirket tarafında bu modeli kullanan uç yok.
 */
class PlatformIncident extends Model
{
    use HasUuids;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'first_seen_at'   => 'datetime',
            'last_seen_at'    => 'datetime',
            'resolved_at'     => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function scopeOpen($query)
    {
        return $query->whereIn('status', ['open', 'investigating']);
    }

    public function isResolved(): bool
    {
        return in_array($this->status, ['resolved', 'ignored'], true);
    }
}
