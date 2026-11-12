<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class ActivityLogService
{
    public function log(
        string $action,
        ?Model $model = null,
        ?User $causer = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?string $description = null,
    ): void {
        try {
            $user = $causer ?? auth()->user();

            // Platform tarafının denetim kayıtları (platform.*) süper adminin sistem
            // kayıtlarında görünür, şirketin kendi aktivitesinde görünmez. Bu yüzden
            // company_id boş bırakılır; şirket aktivitesi company_id ile süzülüyor.
            $companyId = str_starts_with($action, 'platform.')
                ? null
                : ($model?->company_id ?? $user?->company_id);

            // Platform ekibi bir şirkete bağlıyken istek şirket sahibinin jetonuyla
            // gidiyor; işi gerçekte yapanı ayrı sütunda tutuyoruz.
            $impersonator = $user instanceof User ? $user->impersonatorId() : null;

            ActivityLog::create([
                'company_id'      => $companyId,
                'user_id'         => $user?->id,
                'impersonated_by' => $impersonator,
                'action'      => $action,
                'model_type'  => $model ? get_class($model) : null,
                'model_id'    => $model?->getKey(),
                'description' => $description ?? $this->buildDescription($action, $model),
                'old_values'  => $oldValues,
                'new_values'  => $newValues,
                'ip_address'  => request()->ip(),
                'user_agent'  => request()->userAgent(),
                // Zaman uygulamada üretilir. Sütunun CURRENT_TIMESTAMP varsayılanı
                // veritabanının saat dilimine bağlı olduğu için kaymaya yol açıyordu.
                'created_at'  => now(),
            ]);
        } catch (\Throwable $e) {
            logger()->error('ActivityLog write failed: ' . $e->getMessage());
        }
    }

    private function buildDescription(string $action, ?Model $model): string
    {
        $parts = explode('.', $action);
        $modelName = $model ? class_basename($model) : ($parts[0] ?? 'Kayıt');
        $verb = match(end($parts)) {
            'created'    => 'oluşturuldu',
            'updated'    => 'güncellendi',
            'deleted'    => 'silindi',
            'approved'   => 'onaylandı',
            'rejected'   => 'reddedildi',
            'login'      => 'giriş yaptı',
            'logout'     => 'çıkış yaptı',
            'suspended'  => 'askıya alındı',
            'activated'  => 'aktifleştirildi',
            default      => end($parts),
        };
        return "{$modelName} {$verb}";
    }
}
