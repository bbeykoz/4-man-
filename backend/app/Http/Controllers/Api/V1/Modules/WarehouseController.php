<?php

namespace App\Http\Controllers\Api\V1\Modules;

use App\Exceptions\StockException;
use App\Exports\WarehouseTemplateExport;
use App\Http\Requests\Modules\CreateRecordRequest;
use App\Http\Resources\RecordResource;
use App\Imports\WarehouseImport;
use App\Models\Department;
use App\Models\Module;
use App\Models\Modules\WarehouseRecord;
use App\Models\Warehouse;
use App\Services\ActivityLogService;
use App\Services\Stock\StockLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\StreamedResponse;

class WarehouseController extends BaseModuleController
{
    protected string $module            = 'warehouse';
    protected string $viewPermission    = 'warehouse.records.view';
    protected string $createPermission  = 'warehouse.records.create';
    protected string $editPermission    = 'warehouse.records.edit';
    protected string $deletePermission  = 'warehouse.records.delete';
    protected string $approvePermission = 'warehouse.records.approve';

    private const QC_DISK = 'local';

    public function __construct(ActivityLogService $activityLogService, private readonly StockLedgerService $ledger)
    {
        parent::__construct($activityLogService);
    }

    protected function getModelClass(): string
    {
        return WarehouseRecord::class;
    }

    // ─── Kalite Kontrol ─────────────────────────────────────────────

    /**
     * Yeni depo kaydı kalite kontrol cevabıyla birlikte oluşturulur (multipart).
     * qc_done=1 → görsel zorunlu, kayıt onaylı; qc_done=0 → kayıt "QC bekliyor".
     */
    public function store(CreateRecordRequest $request): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->createPermission), 403);

        if ($error = $this->companyRequired($request)) {
            return $error;
        }

        $request->validate([
            'qc_done'  => ['required', 'boolean'],
            'qc_photo' => ['required_if_accepted:qc_done', 'nullable', 'image', 'max:5120'],
        ], $this->qcMessages());

        $user   = $request->user();
        $stock  = $this->validateStockFields($request, $user->company_id);
        $qcDone = $request->boolean('qc_done');
        $photo  = $qcDone ? $this->storeQcPhoto($request, $user->company_id) : null;

        // Stok onayla işlenir; kayıt onaylı açılamaz
        $status = in_array($request->input('status'), ['draft', 'pending', 'in_progress'], true)
            ? $request->input('status')
            : 'pending';

        try {
            $record = WarehouseRecord::create(array_merge(
                $request->validated(),
                $stock,
                [
                    'company_id'    => $user->company_id,
                    'created_by'    => $user->id,
                    'updated_by'    => $user->id,
                    'status'        => $status,
                    'qc_status'     => $qcDone ? WarehouseRecord::QC_PASSED : WarehouseRecord::QC_PENDING,
                    'qc_photo_path' => $photo,
                    'qc_photo_disk' => $photo ? self::QC_DISK : null,
                    'qc_checked_by' => $qcDone ? $user->id : null,
                    'qc_checked_at' => $qcDone ? now() : null,
                ]
            ));
        } catch (\Throwable $e) {
            if ($photo) {
                Storage::disk(self::QC_DISK)->delete($photo);
            }
            throw $e;
        }

        $this->activityLogService->log("{$this->module}.record.created", $record, $user);

        return response()->json([
            'success' => true,
            'data'    => new RecordResource($record->load(['createdBy', 'department', 'qcCheckedBy:id,name'])),
            'message' => $qcDone ? 'Kayıt oluşturuldu, kalite kontrol onaylandı.' : 'Kayıt oluşturuldu, kalite kontrol bekliyor.',
        ], 201);
    }

    /** QC alanları sadece kalite kontrol akışıyla, stok alanları sadece işlenmemiş kayıtta değişir. */
    public function update(Request $request, string $id): JsonResponse
    {
        $record    = WarehouseRecord::where('company_id', $request->user()->company_id)->findOrFail($id);
        $protected = $record->isPosted()
            ? [...WarehouseRecord::QC_FIELDS, ...WarehouseRecord::STOCK_FIELDS, 'status']
            : [...WarehouseRecord::QC_FIELDS, 'posted_at', 'reversed_at', 'system_quantity', 'status'];

        $request->replace($request->except($protected));

        return parent::update($request, $id);
    }

    // ─── Stok defteri ───────────────────────────────────────────────

    /** Onay (approved/completed) stoğa işler; işlenmiş kaydı başka duruma almak geri alır. */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->editPermission), 403);

        $request->validate([
            'status' => ['required', Rule::in(['draft', 'pending', 'in_progress', 'completed', 'cancelled', 'approved'])],
        ]);

        $user      = $request->user();
        $newStatus = $request->input('status');

        return DB::transaction(function () use ($request, $id, $user, $newStatus) {
            $record = WarehouseRecord::where('company_id', $user->company_id)->lockForUpdate()->findOrFail($id);

            if ($record->reversed_at && $newStatus !== 'cancelled') {
                throw new StockException('İptal edilip stoğu geri alınan kayıt tekrar açılamaz. Yeni kayıt oluşturun.');
            }

            if (in_array($newStatus, ['approved', 'completed'], true)) {
                $this->ledger->post($record, $user);
                if ($newStatus === 'approved') {
                    $record->forceFill(['approved_by' => $user->id])->save();
                }
            } elseif ($record->isPosted()) {
                $this->ledger->reverse($record, $user);
            }

            return parent::updateStatus($request, $id);
        });
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->deletePermission), 403);

        $record = WarehouseRecord::where('company_id', $request->user()->company_id)->findOrFail($id);

        if ($record->isPosted()) {
            throw new StockException('Stoğa işlenmiş kayıt silinemez. Önce iptal edin.');
        }

        return parent::destroy($request, $id);
    }

    /** Depo/ürün şirkete ait olmalı; transferde hedef, düzeltmede yön zorunlu. */
    private function validateStockFields(Request $request, string $companyId): array
    {
        $ofCompany = fn(string $table) => Rule::exists($table, 'id')
            ->where('company_id', $companyId)
            ->whereNull('deleted_at');

        $data = $request->validate([
            'type'            => ['nullable', Rule::in(WarehouseRecord::TYPES)],
            'product_id'      => ['nullable', 'uuid', $ofCompany('warehouse_products')],
            'quantity'        => [
                Rule::requiredIf(fn() => $request->filled('product_id') && $request->input('type') !== 'inspection'),
                'nullable', 'numeric', 'min:0',
            ],
            'warehouse_id'    => ['nullable', 'uuid', $ofCompany('warehouses')],
            'to_warehouse_id' => ['nullable', 'required_if:type,transfer', 'uuid', $ofCompany('warehouses')],
            'direction'       => ['nullable', 'required_if:type,adjustment', Rule::in(['increase', 'decrease'])],
            'department_id'   => [
                'nullable', 'uuid', $ofCompany('departments'),
                // Şirketin ya da süper adminin pasife aldığı departman seçilemez
                function (string $attribute, mixed $value, \Closure $fail) use ($companyId) {
                    $dept = Department::where('company_id', $companyId)->find($value);
                    if ($dept && ($dept->status !== 'active' || ($dept->type && !Module::isSlugActive($dept->type)))) {
                        $fail('Seçilen departman pasif.');
                    }
                },
            ],
        ], [
            'product_id.exists'           => 'Seçilen ürün bulunamadı.',
            'quantity.required'           => 'Ürün seçildiğinde miktar zorunludur.',
            'warehouse_id.exists'         => 'Seçilen depo bulunamadı.',
            'to_warehouse_id.required_if' => 'Transfer için hedef depo seçin.',
            'to_warehouse_id.exists'      => 'Hedef depo bulunamadı.',
            'direction.required_if'       => 'Düzeltme için artış veya azalış seçin.',
            'department_id.exists'        => 'Seçilen departman bulunamadı.',
        ]);

        $warehouseId = $data['warehouse_id'] ?? null;
        if (!$warehouseId && !empty($data['product_id'])) {
            $warehouseId = Warehouse::defaultFor($companyId)?->id;
        }

        return array_filter([
            'warehouse_id'    => $warehouseId,
            'to_warehouse_id' => ($data['type'] ?? null) === 'transfer' ? ($data['to_warehouse_id'] ?? null) : null,
            'direction'       => ($data['type'] ?? null) === 'adjustment' ? ($data['direction'] ?? null) : null,
        ], fn($v) => $v !== null);
    }

    /** "QC bekliyor" kayda sonradan görsel yükleyip onaylama. */
    public function qualityCheck(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $this->can($user, $this->createPermission) || $this->can($user, $this->editPermission),
            403
        );

        if ($error = $this->companyRequired($request)) {
            return $error;
        }

        $request->validate([
            'qc_photo' => ['required', 'image', 'max:5120'],
        ], $this->qcMessages());

        $record = WarehouseRecord::where('company_id', $user->company_id)->findOrFail($id);

        if ($record->qc_status !== WarehouseRecord::QC_PENDING) {
            return response()->json([
                'success' => false,
                'message' => 'Bu kayıt için kalite kontrol beklenmiyor.',
            ], 422);
        }

        $photo = $this->storeQcPhoto($request, $user->company_id);

        try {
            DB::transaction(function () use ($record, $photo, $user) {
                $record->update([
                    'qc_status'     => WarehouseRecord::QC_PASSED,
                    'qc_photo_path' => $photo,
                    'qc_photo_disk' => self::QC_DISK,
                    'qc_checked_by' => $user->id,
                    'qc_checked_at' => now(),
                    'updated_by'    => $user->id,
                ]);

                // Onaylı girişin karantinadaki stoğu kullanılabilir hâle gelir
                $this->ledger->releaseQuarantine($record, $user);
            });
        } catch (\Throwable $e) {
            Storage::disk(self::QC_DISK)->delete($photo);
            throw $e;
        }

        $this->activityLogService->log("{$this->module}.record.qc_passed", $record, $user);

        return response()->json([
            'success' => true,
            'data'    => new RecordResource($record->fresh(['createdBy', 'department'])),
            'message' => 'Kalite kontrol onaylandı.',
        ]);
    }

    /** Kalite kontrol görselini yetkili kullanıcıya akıtır (dosya herkese açık değil). */
    public function qualityCheckPhoto(Request $request, string $id): StreamedResponse
    {
        abort_unless($this->can($request->user(), $this->viewPermission), 403);

        $record = WarehouseRecord::where('company_id', $request->user()->company_id)->findOrFail($id);

        abort_unless($record->qc_photo_path, 404);

        $disk = Storage::disk($record->qc_photo_disk ?? self::QC_DISK);
        abort_unless($disk->exists($record->qc_photo_path), 404);

        return $disk->response($record->qc_photo_path, null, [
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    /** Depo kaydı bir şirkete aittir; şirketsiz hesap (süper admin) kayıt ekleyemez. */
    private function companyRequired(Request $request): ?JsonResponse
    {
        if ($request->user()->company_id) {
            return null;
        }

        return response()->json([
            'success' => false,
            'message' => 'Bu hesap bir şirkete bağlı değil. Depo kaydı eklemek için şirket kullanıcısıyla giriş yapın.',
            'code'    => 'NO_COMPANY',
        ], 422);
    }

    private function storeQcPhoto(Request $request, string $companyId): string
    {
        return $request->file('qc_photo')->store("quality-checks/{$companyId}", self::QC_DISK);
    }

    private function qcMessages(): array
    {
        return [
            'qc_done.required'                => 'Kalite kontrol yapılıp yapılmadığını seçin.',
            'qc_photo.required'               => 'Kalite kontrol görseli zorunludur.',
            'qc_photo.required_if_accepted'   => 'Kalite kontrol yapıldıysa görsel zorunludur.',
            'qc_photo.image'                  => 'Kalite kontrol görseli bir resim dosyası olmalıdır.',
            'qc_photo.max'                    => 'Görsel en fazla 5 MB olabilir.',
            'qc_photo.uploaded'               => 'Görsel yüklenemedi. Dosya boyutunu kontrol edin.',
        ];
    }

    public function import(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission($this->createPermission), 403);

        $request->validate([
            'file'        => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:10240'],
            'period_type' => ['required', 'in:daily,weekly,monthly'],
        ]);

        $import = new WarehouseImport(
            companyId:  $request->user()->company_id,
            createdBy:  $request->user()->id,
            periodType: $request->input('period_type'),
        );

        Excel::import($import, $request->file('file'));

        $this->activityLogService->log('warehouse.records.imported', null, $request->user(), newValues: [
            'count'       => $import->getImportedCount(),
            'period_type' => $request->input('period_type'),
        ]);

        return response()->json([
            'success'  => true,
            'message'  => "{$import->getImportedCount()} kayıt başarıyla içe aktarıldı.",
            'imported' => $import->getImportedCount(),
            'errors'   => $import->getErrors(),
        ]);
    }

    public function downloadTemplate(): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        return Excel::download(new WarehouseTemplateExport(), 'depo-sablonu.xlsx');
    }
}
