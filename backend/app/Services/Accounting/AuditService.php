<?php

namespace App\Services\Accounting;

use App\Models\Accounting\AccountingAuditEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Muhasebe denetim kaydı yazıcısı.
 *
 * Her defter olayı buradan geçer: kim, ne zaman, neyi, hangi gerekçeyle.
 * Tablo append-only olduğu için yazma dışında işlem yok.
 */
class AuditService
{
    public function log(
        string $companyId,
        string $action,
        string $entityType,
        ?string $entityId = null,
        ?string $beforeHash = null,
        ?string $afterHash = null,
        array $payload = [],
        ?string $reason = null,
    ): void {
        // Eloquent create() yerine doğrudan insert: model booted() içinde
        // update/delete engeli var, insert serbest ama sorgu daha ucuz.
        DB::table('accounting_audit_events')->insert([
            'company_id'  => $companyId,
            'actor_id'    => auth()->id(),
            'action'      => $action,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'before_hash' => $beforeHash,
            'after_hash'  => $afterHash,
            'payload'     => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'reason'      => $reason,
            'ip_address'  => request()->ip(),
            'occurred_at' => now(),
        ]);
    }

    /** Model üzerinden kısayol. */
    public function logModel(Model $model, string $action, array $payload = [], ?string $reason = null): void
    {
        $this->log(
            companyId:  $model->company_id,
            action:     $action,
            entityType: class_basename($model),
            entityId:   $model->getKey(),
            payload:    $payload,
            reason:     $reason,
        );
    }

    /** Bir kaydın denetim geçmişi. */
    public function historyFor(string $entityType, string $entityId)
    {
        return AccountingAuditEvent::query()
            ->where('entity_type', $entityType)
            ->where('entity_id', $entityId)
            ->orderByDesc('occurred_at')
            ->get();
    }
}
