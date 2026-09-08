<?php

namespace App\Traits;

use App\Models\ActivityLog;
use Illuminate\Support\Facades\Auth;

trait HasActivityLog
{
    public static function bootHasActivityLog(): void
    {
        static::created(function ($model) {
            $model->logActivity('created', null, $model->toArray());
        });

        static::updated(function ($model) {
            $model->logActivity('updated', $model->getOriginal(), $model->getChanges());
        });

        static::deleted(function ($model) {
            $model->logActivity('deleted', $model->toArray(), null);
        });
    }

    protected function logActivity(string $action, ?array $oldValues, ?array $newValues): void
    {
        try {
            $user = Auth::user();

            ActivityLog::create([
                'company_id'  => $this->company_id ?? $user?->company_id,
                'user_id'     => $user?->id,
                'action'      => class_basename($this) . '.' . $action,
                'model_type'  => get_class($this),
                'model_id'    => $this->getKey(),
                'description' => $this->getActivityDescription($action),
                'old_values'  => $oldValues ? $this->filterSensitiveFields($oldValues) : null,
                'new_values'  => $newValues ? $this->filterSensitiveFields($newValues) : null,
                'ip_address'  => request()->ip(),
                'user_agent'  => request()->userAgent(),
            ]);
        } catch (\Throwable $e) {
            // Log hatası uygulamayı durdurmamalı
            logger()->error('ActivityLog error: ' . $e->getMessage());
        }
    }

    protected function getActivityDescription(string $action): string
    {
        $modelName = class_basename($this);
        return match($action) {
            'created' => "{$modelName} oluşturuldu",
            'updated' => "{$modelName} güncellendi",
            'deleted' => "{$modelName} silindi",
            default   => "{$modelName} {$action}",
        };
    }

    protected function filterSensitiveFields(array $data): array
    {
        $sensitive = ['password', 'remember_token', 'two_factor_secret', 'api_token'];
        return array_diff_key($data, array_flip($sensitive));
    }
}
