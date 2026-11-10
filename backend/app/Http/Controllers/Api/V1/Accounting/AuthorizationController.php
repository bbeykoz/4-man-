<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\Accounting\AccountingRoleService;
use App\Services\Accounting\ApprovalMatrixService;
use App\Services\Accounting\SegregationOfDutyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Muhasebe yetkilendirmesi: roller, izin kataloğu, görev ayrılığı raporu,
 * istisnalar ve onay matrisi.
 */
class AuthorizationController extends Controller
{
    public function __construct(
        private readonly AccountingRoleService $roles,
        private readonly SegregationOfDutyService $sod,
        private readonly ApprovalMatrixService $approvals,
    ) {}

    // ─── Roller ─────────────────────────────────────────────────────

    public function roles(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'roles'      => $this->roles->listing($request->user()->company),
                'catalog'    => $this->roles->permissionCatalog(),
            ],
        ]);
    }

    /** İzinleri ve rol şablonlarını kurar. */
    public function installRoles(Request $request): JsonResponse
    {
        $izin  = $this->roles->installPermissions();
        $sonuc = $this->roles->installRoleTemplates($request->user()->company);

        return response()->json([
            'success' => true,
            'data'    => ['permissions_added' => $izin] + $sonuc,
            'message' => sprintf('%d izin eklendi, %d rol kuruldu, %d rol zaten vardı.',
                $izin, $sonuc['created'], $sonuc['skipped']),
        ], 201);
    }

    // ─── Görev ayrılığı ─────────────────────────────────────────────

    public function dutyReport(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->sod->companyReport($request->user()->company),
        ]);
    }

    public function userConflicts(Request $request, string $userId): JsonResponse
    {
        $kullanici = $this->findUser($request, $userId);

        return response()->json(['success' => true, 'data' => [
            'user'      => ['id' => $kullanici->id, 'name' => $kullanici->name, 'email' => $kullanici->email],
            'conflicts' => $this->sod->conflictsFor($kullanici),
        ]]);
    }

    /** Rol vermeden önce çakışma önizlemesi. */
    public function previewRole(Request $request, string $userId): JsonResponse
    {
        $data = $request->validate(['role_id' => ['required', 'uuid']]);

        $kullanici = $this->findUser($request, $userId);
        $rol = Role::where('company_id', $request->user()->company_id)->findOrFail($data['role_id']);

        return response()->json([
            'success' => true,
            'data'    => $this->sod->previewRoleAssignment($kullanici, $rol),
        ]);
    }

    public function grantException(Request $request, string $userId): JsonResponse
    {
        $data = $request->validate([
            'conflict_code' => ['required', 'string', 'max:60'],
            'reason'        => ['required', 'string', 'min:10', 'max:500'],
            'valid_to'      => ['nullable', 'date', 'after:today'],
        ]);

        $sonuc = $this->sod->grantException(
            $this->findUser($request, $userId),
            $data['conflict_code'],
            $data['reason'],
            $data['valid_to'] ?? null,
        );

        return response()->json([
            'success' => true,
            'data'    => $sonuc,
            'message' => 'İstisna tanımlandı; denetim raporunda görünecek.',
        ], 201);
    }

    public function revokeException(Request $request, string $exceptionId): JsonResponse
    {
        $this->sod->revokeException($exceptionId, $request->user()->company_id);

        return response()->json(['success' => true, 'message' => 'İstisna kaldırıldı.']);
    }

    // ─── Onay matrisi ───────────────────────────────────────────────

    public function matrix(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'rules'    => $this->approvals->matrix($request->user()->company),
                'currency' => $request->user()->company->functionalCurrency(),
                'actions'  => [
                    'payment.post'      => 'Ödeme deftere işleme',
                    'journal.post'      => 'Fiş deftere işleme',
                    'period.close'      => 'Dönem kapatma',
                    'vat_return.submit' => 'KDV beyanı gönderme',
                ],
            ],
        ]);
    }

    public function installMatrix(Request $request): JsonResponse
    {
        $eklenen = $this->approvals->installDefaults($request->user()->company);

        return response()->json([
            'success' => true,
            'data'    => ['created' => $eklenen, 'rules' => $this->approvals->matrix($request->user()->company)],
            'message' => $eklenen > 0 ? "$eklenen onay kuralı kuruldu." : 'Onay kuralları zaten tanımlı.',
        ]);
    }

    public function storeRule(Request $request): JsonResponse
    {
        $data = $this->ruleRules($request);

        return response()->json([
            'success' => true,
            'data'    => $this->approvals->upsertRule($request->user()->company, $data),
            'message' => 'Onay kuralı eklendi.',
        ], 201);
    }

    public function updateRule(Request $request, string $id): JsonResponse
    {
        $data = $this->ruleRules($request);

        return response()->json([
            'success' => true,
            'data'    => $this->approvals->upsertRule($request->user()->company, $data, $id),
            'message' => 'Onay kuralı güncellendi.',
        ]);
    }

    public function destroyRule(Request $request, string $id): JsonResponse
    {
        $this->approvals->deleteRule($request->user()->company, $id);

        return response()->json(['success' => true, 'message' => 'Onay kuralı silindi.']);
    }

    private function ruleRules(Request $request): array
    {
        return $request->validate([
            'action'              => ['required', Rule::in(['payment.post', 'journal.post', 'period.close', 'vat_return.submit', 'document.post'])],
            'min_amount'          => ['nullable', 'numeric', 'min:0'],
            'max_amount'          => ['nullable', 'numeric', 'gt:min_amount'],
            'required_approvals'  => ['required', 'integer', 'between:0,5'],
            'required_permission' => ['nullable', 'string', 'max:60'],
            'approver_role_ids'   => ['nullable', 'array'],
            'approver_role_ids.*' => ['uuid'],
            'is_active'           => ['nullable', 'boolean'],
            'note'                => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function findUser(Request $request, string $userId): User
    {
        return User::where('company_id', $request->user()->company_id)->findOrFail($userId);
    }
}
