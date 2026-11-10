<?php

namespace App\Models\Accounting;

use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use RuntimeException;

/**
 * Muhasebe denetim kaydı.
 *
 * Append-only: yönetici dahil kimse geçmişi değiştiremez veya silemez. Kural
 * veritabanı trigger'ı ile de zorlanıyor; buradaki engel yalnız hata mesajını
 * anlaşılır yapmak için.
 *
 * Mevcut activity_logs tablosundan ayrı tutuluyor: o genel uygulama günlüğü,
 * bu ise defterin yasal izi. Saklama süresi ve değiştirilemezlik şartları farklı.
 */
class AccountingAuditEvent extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'payload'     => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new RuntimeException('Muhasebe denetim kaydı değiştirilemez.'));
        static::deleting(fn () => throw new RuntimeException('Muhasebe denetim kaydı silinemez.'));
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
