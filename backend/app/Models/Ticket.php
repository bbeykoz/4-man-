<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Ticket extends Model
{
    use HasUuid;

    protected $fillable = [
        'user_id', 'company_id', 'title', 'body',
        'type', 'status', 'priority', 'admin_note', 'ticket_number',
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
}
