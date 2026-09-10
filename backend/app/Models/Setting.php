<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Setting extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'value' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public static function get(string $key, mixed $default = null, ?string $companyId = null): mixed
    {
        $setting = static::query()
            ->where('key', $key)
            ->where('company_id', $companyId)
            ->first();

        return $setting?->value ?? $default;
    }

    public static function set(string $key, mixed $value, ?string $companyId = null, string $group = 'general'): void
    {
        static::updateOrCreate(
            ['key' => $key, 'company_id' => $companyId],
            ['value' => $value, 'group' => $group]
        );
    }
}
