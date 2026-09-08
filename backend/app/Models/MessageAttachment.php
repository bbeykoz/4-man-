<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class MessageAttachment extends Model
{
    use HasUuid;

    public $timestamps = false;

    protected $fillable = [
        'message_id',
        'original_name',
        'file_path',
        'mime_type',
        'size',
    ];

    protected $casts = [
        'size'       => 'integer',
        'created_at' => 'datetime',
    ];

    protected $appends = ['url'];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function getUrlAttribute(): string
    {
        return Storage::disk('public')->url($this->file_path);
    }
}
