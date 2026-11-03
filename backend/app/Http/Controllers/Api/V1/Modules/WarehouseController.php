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
use App\Models\StockMovement;
use App\Models\StockReservation;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use App\Services\ActivityLogService;
use App\Services\Stock\PurchasingService;
use App\Services\Stock\StockLedgerService;
use App\Services\Stock\StockReservationService;
use App\Support\AppTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
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

    /** Liste satırları detay penceresinde kullanılıyor: kalite kontrolü yapan ve depo adları gerekir. */
    protected array $indexWith = ['qcCheckedBy:id,name', 'warehouse:id,name', 'toWarehouse:id,name', 'product:id,name,sku,unit'];

    /** Küsurat kabul etmeyen, sayılarak takip edilen birimler. */
    private const TAM_SAYI_BIRIMLER = ['adet', 'ad', 'piece', 'pcs', 'koli', 'kutu', 'paket', 'palet', 'çuval', 'rulo', 'top', 'düzine'];

    /** Bu kadar gün kalmışsa giriş sırasında SKT uyarısı verilir. */
    private const SKT_YAKIN_GUN = 30;

    private const QC_DISK = 'local';

    public function __construct(
        ActivityLogService $activityLogService,
        private readonly StockLedgerService $ledger,
        private readonly StockReservationService $reservations,
        private readonly PurchasingService $purchasing,
    ) {
        parent::__construct($activityLogService);
    }

    protected function getModelClass(): string
    {
        return WarehouseRecord::class;
    }

    // ─── Kalite Kontrol ─────────────────────────────────────────────

    /**
     * Yeni depo kaydı kalite kontrol cevabıyla birlikte oluşturulur (multipart).
     *
     * qc_result=passed   → kayıt onaylı, görsel isteğe bağlı
     * qc_result=rejected → ürün reddedildi, görsel zorunlu (kanıt), stok karantinada kalır
     * qc_result=pending  → kontrol henüz yapılmadı, kayıt "QC bekliyor"
     */
    public function store(CreateRecordRequest $request): JsonResponse
    {
        abort_unless($this->can($request->user(), $this->createPermission), 403);

        if ($error = $this->companyRequired($request)) {
            return $error;
        }

        $request->validate([
            'qc_result' => ['required', Rule::in(WarehouseRecord::QC_STATUSES)],
            'qc_photo'  => ['required_if:qc_result,' . WarehouseRecord::QC_REJECTED, 'nullable', 'image', 'max:5120'],
            'qc_note'   => ['nullable', 'string', 'max:500'],
        ], $this->qcMessages());

        $user     = $request->user();
        $stock    = $this->validateStockFields($request, $user->company_id);
        $qcResult = $request->input('qc_result');
        $decided  = $qcResult !== WarehouseRecord::QC_PENDING;
        $photo    = $request->hasFile('qc_photo') ? $this->storeQcPhoto($request, $user->company_id) : null;

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
                    'qc_status'     => $qcResult,
                    'qc_photo_path' => $photo,
                    'qc_photo_disk' => $photo ? self::QC_DISK : null,
                    'qc_checked_by' => $decided ? $user->id : null,
                    'qc_checked_at' => $decided ? now() : null,
                    'qc_note'       => $request->input('qc_note'),
                ]
            ));
        } catch (\Throwable $e) {
            if ($photo) {
                Storage::disk(self::QC_DISK)->delete($photo);
            }
            throw $e;
        }

        // Stok çıkışı siparişe ayrılır: ürün serbest stoktan rezerveye geçer (Booked).
        // Rezervasyon serbest stoğu tükettiği için uyarı ondan sonra hesaplanamaz;
        // ne kadarının ayrılabildiğini rezervasyon kaydının kendisi söyler.
        $reservation = $this->reservations->openFor($record, $user);

        $this->activityLogService->log("{$this->module}.record.created", $record, $user);

        return response()->json([
            'success'  => true,
            // Stok yetmiyorsa kullanıcı onayı beklemeden, kaydı açarken uyarılır
            'warnings' => $this->stockWarnings($record, $reservation),
            'data'     => new RecordResource($record->fresh(['createdBy', 'department', 'qcCheckedBy:id,name'])),
            'message' => match ($qcResult) {
                WarehouseRecord::QC_PASSED   => 'Kayıt oluşturuldu, kalite kontrol onaylandı.',
                WarehouseRecord::QC_REJECTED => 'Kayıt oluşturuldu, ürün kalite kontrolden geçmedi. Stok karantinada.',
                default                      => 'Kayıt oluşturuldu, kalite kontrol bekliyor.',
            },
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

            // Rezerve edilmiş sipariş buradan işlenmez: stok zaten rezervede durur,
            // teslimat Booked ekranından yapılır. Yoksa stok iki kez düşerdi.
            if (in_array($newStatus, ['approved', 'completed'], true) && $this->reservations->hasOpenReservation($record)) {
                throw new StockException('Bu kayıt için stok rezerve edildi. Teslimatı Booked sekmesinden yapın.');
            }

            if (in_array($newStatus, ['approved', 'completed'], true)) {
                $this->ledger->post($record, $user);
                if ($newStatus === 'approved') {
                    $record->forceFill(['approved_by' => $user->id])->save();
                }
            } elseif ($record->isPosted()) {
                $this->ledger->reverse($record, $user);
            }

            if ($newStatus === 'cancelled') {
                // İptalde rezervedeki miktar serbest stoğa döner
                $this->reservations->releaseForRecord($record, $user);

                // Bekleyen kalite kontrol iptalle birlikte kapanır; liste "QC Bekliyor"
                // göstermeye devam etmemeli.
                if ($record->qc_status === WarehouseRecord::QC_PENDING) {
                    $record->forceFill([
                        'qc_status'     => WarehouseRecord::QC_REJECTED,
                        'qc_checked_by' => $record->qc_checked_by ?? $user->id,
                        'qc_checked_at' => $record->qc_checked_at ?? now(),
                        'qc_note'       => $record->qc_note ?? 'Kayıt iptal edildiği için kalite kontrol kapatıldı.',
                    ])->save();
                }

                // Satın alma teslimatının iptali siparişe yansır
                $this->purchasing->rejectReceipt($record, 'Stok giriş kaydı iptal edildi.');
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

        // Silinen siparişin rezervesi serbest stoğa döner
        $this->reservations->releaseForRecord($record, $request->user());

        return parent::destroy($request, $id);
    }

    /**
     * Kayıt açılırken stok yetmiyorsa uyarı üretir (engellemez).
     *
     * Yetersizlik eskiden yalnız onay anında görülüyordu; kullanıcı 85 adetlik stoğa
     * 500 adetlik çıkış kaydı açıp sorunu çok sonra fark ediyordu.
     *
     * @return string[]
     */
    private function stockWarnings(WarehouseRecord $record, ?StockReservation $reservation = null): array
    {
        $uyarilar = [];

        // Girişte son kullanma tarihi kontrolü: SKT'si geçmiş ya da çok yakın lot
        // sessizce stoğa alınıyordu.
        if (in_array($record->type, ['stock_in', 'return_in'], true) && $record->expiry_date) {
            $bugun = AppTime::today();
            $skt   = $record->expiry_date->copy()->startOfDay();
            $lot   = $record->batch_number ? " ({$record->batch_number} lotu)" : '';

            if ($skt->lt($bugun)) {
                $gun = (int) $skt->diffInDays($bugun);
                $uyarilar[] = "Son kullanma tarihi geçmiş ürün girildi{$lot}: {$skt->format('d.m.Y')}, {$gun} gün önce doldu. Girişi gözden geçirin.";
            } elseif ($skt->lte($bugun->copy()->addDays(self::SKT_YAKIN_GUN))) {
                $gun = (int) $bugun->diffInDays($skt);
                $uyarilar[] = "Son kullanma tarihi yakın ürün girildi{$lot}: {$skt->format('d.m.Y')}, {$gun} gün kaldı. FIFO ile öncelikli çıkarın.";
            }
        }

        $tuketen = ['stock_out', 'transfer', 'damage'];

        if (!$record->product_id || !$record->warehouse_id || !in_array($record->type, $tuketen, true)) {
            return $uyarilar;
        }

        $istenen = (float) $record->quantity;

        // Rezervasyon açıldıysa ayrılabilen miktar = kayıttan önceki serbest stok
        $mevcut = $reservation
            ? (float) $reservation->reserved_quantity
            : $this->ledger->balance(
                $record->company_id,
                $record->product_id,
                $record->warehouse_id,
                StockMovement::BUCKET_AVAILABLE,
            );

        if ($istenen - $mevcut <= 0.0005) {
            return $uyarilar;
        }

        $birim = $record->unit ?: ($record->product?->unit ?: 'adet');
        $eksik = rtrim(rtrim(number_format($istenen - $mevcut, 3, '.', ''), '0'), '.');
        $var   = rtrim(rtrim(number_format($mevcut, 3, '.', ''), '0'), '.');

        $kuyruk = $reservation
            ? 'Bulunabilen miktar rezerve edildi; kalanı Booked sekmesinden tamamlayabilirsiniz.'
            : 'Kayıt açıldı ancak stok tamamlanmadan işlenemez.';

        $uyarilar[] = "Yetersiz stok: depoda {$var} {$birim} var, {$eksik} {$birim} eksik. {$kuyruk}";

        return $uyarilar;
    }

    /** Depo/ürün şirkete ait olmalı; transferde hedef, düzeltmede yön zorunlu. */
    private function validateStockFields(Request $request, string $companyId): array
    {
        $ofCompany = fn(string $table) => Rule::exists($table, 'id')
            ->where('company_id', $companyId)
            ->whereNull('deleted_at');

        $data = $request->validate([
            'type'            => ['nullable', Rule::in(WarehouseRecord::TYPES)],
            // Gelecek tarihli hareket stok geçmişini bozar; sınır Türkiye gününe göre
            'transaction_date'=> ['nullable', 'date', 'before_or_equal:' . AppTime::today()->toDateString()],
            'product_id'      => ['nullable', 'uuid', $ofCompany('warehouse_products')],
            'quantity'        => [
                Rule::requiredIf(fn() => $request->filled('product_id') && $request->input('type') !== 'inspection'),
                'nullable', 'numeric',
                // Sayılabilir birimlerde küsurat olmaz: 145,97 adet kâğıt alınamaz.
                function (string $attribute, mixed $value, \Closure $fail) use ($request, $companyId) {
                    if ($value === null || $value === '') {
                        return;
                    }
                    $unit = $request->input('unit')
                        ?: ($request->filled('product_id')
                            ? WarehouseProduct::forCompany($companyId)->whereKey($request->input('product_id'))->value('unit')
                            : null);

                    if ($unit && in_array(mb_strtolower(trim($unit)), self::TAM_SAYI_BIRIMLER, true)
                        && abs((float) $value - round((float) $value)) > 0.0001) {
                        $fail("\"{$unit}\" biriminde küsuratlı miktar girilemez. Tam sayı yazın.");
                    }
                },
            ],
            // Birim ürün kartındakiyle aynı olmalı. Çevrim tablosu yok; farklı birimle
            // girilen miktar çevrilmeden stoktan düşerdi (5 kg → 5 adet).
            'unit'            => [
                'nullable', 'string', 'max:20',
                function (string $attribute, mixed $value, \Closure $fail) use ($request, $companyId) {
                    if (!$value || !$request->filled('product_id')) {
                        return;
                    }
                    $productUnit = WarehouseProduct::forCompany($companyId)->whereKey($request->input('product_id'))->value('unit');
                    if ($productUnit && mb_strtolower(trim($value)) !== mb_strtolower(trim($productUnit))) {
                        $fail("Ürünün birimi \"{$productUnit}\". Farklı birimle ({$value}) hareket girilemez; miktarı {$productUnit} cinsinden yazın.");
                    }
                },
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
            'quantity.gt'                 => 'Miktar 0\'dan büyük olmalıdır.',
            'quantity.numeric'            => 'Miktar sayı olmalıdır.',
            'warehouse_id.exists'         => 'Seçilen depo bulunamadı.',
            'to_warehouse_id.required_if' => 'Transfer için hedef depo seçin.',
            'to_warehouse_id.exists'      => 'Hedef depo bulunamadı.',
            'direction.required_if'       => 'Düzeltme için artış veya azalış seçin.',
            'transaction_date.before_or_equal' => 'İşlem tarihi gelecekte olamaz.',
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

    /**
     * "QC bekliyor" kaydı sonuçlandırır.
     *
     * Onayda görsel isteğe bağlıdır; stok karantinadan kullanılabilir hâle geçer.
     * Redde görsel zorunludur (kanıt) ve stok karantinada kalır.
     */
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
            'result'   => ['required', Rule::in([WarehouseRecord::QC_PASSED, WarehouseRecord::QC_REJECTED])],
            'qc_photo' => ['required_if:result,' . WarehouseRecord::QC_REJECTED, 'nullable', 'image', 'max:5120'],
            'qc_note'  => ['nullable', 'string', 'max:500'],
        ], $this->qcMessages());

        $record = WarehouseRecord::where('company_id', $user->company_id)->findOrFail($id);

        if ($record->qc_status !== WarehouseRecord::QC_PENDING) {
            return response()->json([
                'success' => false,
                'message' => 'Bu kayıt için kalite kontrol beklenmiyor.',
            ], 422);
        }

        $result   = $request->input('result');
        $rejected = $result === WarehouseRecord::QC_REJECTED;
        $photo    = $request->hasFile('qc_photo') ? $this->storeQcPhoto($request, $user->company_id) : null;

        try {
            DB::transaction(function () use ($record, $photo, $user, $result, $rejected) {
                $record->update(array_filter([
                    'qc_status'     => $result,
                    'qc_photo_path' => $photo,
                    'qc_photo_disk' => $photo ? self::QC_DISK : null,
                    'qc_checked_by' => $user->id,
                    'qc_checked_at' => now(),
                    'qc_note'       => request('qc_note'),
                    'updated_by'    => $user->id,
                ], fn($v) => $v !== null));

                // Onaylı girişin karantinadaki stoğu kullanılabilir hâle gelir.
                // Reddedilen üründe karantina çözülmez; stok orada bekler.
                if ($rejected) {
                    // Satın alma teslimatıysa sipariş ve tedarikçi performansı güncellenir:
                    // kabul edilmeyen miktar "teslim alındı" sayılmaya devam etmemeli.
                    $this->purchasing->rejectReceipt($record, request('qc_note'));
                } else {
                    $this->ledger->releaseQuarantine($record, $user);
                }
            });
        } catch (\Throwable $e) {
            if ($photo) {
                Storage::disk(self::QC_DISK)->delete($photo);
            }
            throw $e;
        }

        $this->activityLogService->log(
            "{$this->module}.record." . ($rejected ? 'qc_rejected' : 'qc_passed'),
            $record,
            $user,
        );

        return response()->json([
            'success' => true,
            'data'    => new RecordResource($record->fresh(['createdBy', 'department'])),
            'message' => $rejected
                ? 'Ürün reddedildi. Stok karantinada kalır.'
                : 'Kalite kontrol onaylandı.',
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

    /**
     * Teslim imzası: kaydı teslim alan kişi ekranda imzalar, PNG olarak saklanır.
     * İmza bir kez atılır; değiştirmek için önce silinmesi gerekir.
     */
    public function storeSignature(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $this->can($user, $this->createPermission) || $this->can($user, $this->editPermission),
            403
        );

        if ($error = $this->companyRequired($request)) {
            return $error;
        }

        $data = $request->validate([
            'signature' => ['required', 'string', 'max:2000000'],
            'name'      => ['required', 'string', 'max:120'],
        ], [
            'signature.required' => 'İmza boş olamaz.',
            'name.required'      => 'Teslim alan kişinin adı zorunlu.',
        ]);

        $record = WarehouseRecord::where('company_id', $user->company_id)->findOrFail($id);

        if ($record->signature_path) {
            return response()->json([
                'success' => false,
                'message' => 'Bu kayıt zaten imzalanmış.',
            ], 422);
        }

        // data:image/png;base64,... biçimi bekleniyor
        if (!preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $data['signature'], $m)) {
            return response()->json([
                'success' => false,
                'message' => 'İmza biçimi geçersiz.',
            ], 422);
        }

        $binary = base64_decode($m[1], true);

        if ($binary === false || strlen($binary) > 2 * 1024 * 1024) {
            return response()->json([
                'success' => false,
                'message' => 'İmza okunamadı veya çok büyük.',
            ], 422);
        }

        $path = sprintf('signatures/%s/%s.png', $user->company_id, Str::uuid());
        Storage::disk(self::QC_DISK)->put($path, $binary);

        try {
            $record->update([
                'signature_path' => $path,
                'signature_disk' => self::QC_DISK,
                'signed_by_name' => $data['name'],
                'signed_by'      => $user->id,
                'signed_at'      => now(),
                'updated_by'     => $user->id,
            ]);
        } catch (\Throwable $e) {
            Storage::disk(self::QC_DISK)->delete($path);
            throw $e;
        }

        return response()->json([
            'success' => true,
            'message' => 'İmza kaydedildi.',
            'data'    => new RecordResource($record->fresh()),
        ]);
    }

    /** İmza görselini döndürür. */
    public function signature(Request $request, string $id): StreamedResponse
    {
        abort_unless($this->can($request->user(), $this->viewPermission), 403);

        $record = WarehouseRecord::where('company_id', $request->user()->company_id)->findOrFail($id);

        abort_unless($record->signature_path, 404);

        $disk = Storage::disk($record->signature_disk ?? self::QC_DISK);
        abort_unless($disk->exists($record->signature_path), 404);

        return $disk->response($record->signature_path, null, [
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
            'qc_result.required'              => 'Kalite kontrol sonucunu seçin.',
            'qc_result.in'                    => 'Geçersiz kalite kontrol sonucu.',
            'result.required'                 => 'Kalite kontrol sonucunu seçin.',
            'result.in'                       => 'Geçersiz kalite kontrol sonucu.',
            'qc_photo.required_if'            => 'Ürün reddedildiğinde görsel zorunludur.',
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
            'count'            => $import->getImportedCount(),
            'created_products' => $import->getCreatedProductCount(),
            'period_type'      => $request->input('period_type'),
        ]);

        $message = "{$import->getImportedCount()} kayıt başarıyla içe aktarıldı.";
        if ($import->getCreatedProductCount() > 0) {
            $message .= " {$import->getCreatedProductCount()} yeni ürün kataloğa eklendi.";
        }

        return response()->json([
            'success'          => true,
            'message'          => $message,
            'imported'         => $import->getImportedCount(),
            'created_products' => $import->getCreatedProductCount(),
            'errors'           => $import->getErrors(),
        ]);
    }

    public function downloadTemplate(): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        return Excel::download(new WarehouseTemplateExport(), 'depo-sablonu.xlsx');
    }
}
