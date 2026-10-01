<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Ticket extends Model
{
    use HasUuid;

    /** Talebin düşeceği platform ekibi. */
    public const TEAM_SUPPORT   = 'support';
    public const TEAM_SALES     = 'sales';
    public const TEAM_TECHNICAL = 'technical';

    public const TEAMS = [
        self::TEAM_SUPPORT   => 'Destek Ekibi',
        self::TEAM_SALES     => 'Satış Ekibi',
        self::TEAM_TECHNICAL => 'Teknik Ekip',
    ];

    /** Platform rol kısa adı → ekip. Kullanıcı kendi ekibinin taleplerini görür. */
    public const ROLE_TEAMS = [
        'platform-support' => self::TEAM_SUPPORT,
        'platform-sales'   => self::TEAM_SALES,
        'platform-tech'    => self::TEAM_TECHNICAL,
    ];

    protected $fillable = [
        'user_id', 'company_id', 'title', 'body',
        'type', 'team', 'assigned_to', 'source', 'status', 'priority',
        'admin_note', 'ticket_number',
        'contact_name', 'contact_email', 'contact_phone', 'contact_company',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $ticket) {
            $ticket->ticket_number = (static::max('ticket_number') ?? 0) + 1;
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function getTeamLabelAttribute(): string
    {
        return self::TEAMS[$this->team] ?? 'Destek Ekibi';
    }
}
