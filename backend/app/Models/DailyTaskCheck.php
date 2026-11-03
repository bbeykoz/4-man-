<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Bir genel görevin belirli bir gündeki kontrol durumu; satır yoksa o gün yapılmamıştır. */
class DailyTaskCheck extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            // 'date:Y-m-d' olmadan Eloquent zaman damgasıyla ("...00:00:00") kaydeder;
            // controller'daki ham 'Y-m-d' where() sorgularıyla eşleşmesi için format sabitlenir.
            'check_date' => 'date:Y-m-d',
            'is_checked' => 'boolean',
            'checked_at' => 'datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(DailyCheckTask::class, 'task_id');
    }

    public function checkedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'checked_by');
    }
}
