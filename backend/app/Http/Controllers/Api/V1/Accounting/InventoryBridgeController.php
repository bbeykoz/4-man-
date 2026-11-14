<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Enums\Accounting\InventoryEventType;
use App\Http\Controllers\Controller;
use App\Models\Accounting\InventoryAccountingEvent;
use App\Models\Accounting\JournalEntry;
use App\Models\Modules\WarehouseRecord;
use App\Services\Accounting\InventoryPostingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Depo–muhasebe köprüsü uçları.
 *
 * Kuyruk durumu, elle işleme, istisna çözümü ve iki yönlü drill-down:
 * depo kaydından fişe, fişten depo kaydına.
 */
class InventoryBridgeController extends Controller
{
    public function __construct(private readonly InventoryPostingService $posting) {}

    /** Kuyruk özeti: ne bekliyor, ne takıldı. */
    public function status(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;

        // payload->>'total_value'::numeric PostgreSQL'e özeldir; SQLite'ta json_extract+CAST eşdeğeri kullanılır.
        $degerIfade = DB::connection()->getDriverName() === 'pgsql'
            ? "COALESCE(SUM((payload->>'total_value')::numeric), 0) AS deger"
            : "COALESCE(SUM(CAST(json_extract(payload, '$.total_value') AS REAL)), 0) AS deger";

        $sayilar = InventoryAccountingEvent::where('company_id', $companyId)
            ->selectRaw("status, COUNT(*) AS adet, $degerIfade")
            ->groupBy('status')
            ->get()
            ->mapWithKeys(fn ($s) => [$s->status => [
                'count' => (int) $s->adet,
                'value' => round((float) $s->deger, 2),
            ]])
            ->all();

        $enEski = InventoryAccountingEvent::where('company_id', $companyId)
            ->pending()->orderBy('accounting_date')->first();

        return response()->json(['success' => true, 'data' => [
            'by_status'        => $sayilar,
            'pending'          => $sayilar['pending']['count'] ?? 0,
            'needs_attention'  => ($sayilar['exception']['count'] ?? 0) + ($sayilar['failed']['count'] ?? 0),
            'oldest_pending'   => $enEski?->accounting_date->toDateString(),
            'event_types'      => array_map(fn (InventoryEventType $t) => [
                'value'   => $t->value,
                'label'   => $t->label(),
                'posts'   => $t->createsJournalEntry(),
            ], InventoryEventType::cases()),
        ]]);
    }

    public function index(Request $request): JsonResponse
    {
        $olaylar = InventoryAccountingEvent::where('company_id', $request->user()->company_id)
            ->with('journalEntry')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('event_type'), fn ($q) => $q->where('event_type', $request->string('event_type')))
            ->when($request->boolean('needs_attention'), fn ($q) => $q->needsAttention())
            ->when($request->filled('source_id'), fn ($q) => $q->where('source_id', $request->string('source_id')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('accounting_date', '>=', $request->string('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('accounting_date', '<=', $request->string('date_to')))
            ->orderByDesc('accounting_date')->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json(['success' => true, 'data' => $olaylar->through(fn ($o) => $this->shape($o))]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $olay = $this->find($request, $id);

        return response()->json(['success' => true, 'data' => $this->shape($olay, detayli: true)]);
    }

    /** Bekleyen olayları şimdi işle. */
    public function process(Request $request): JsonResponse
    {
        $request->validate(['limit' => ['nullable', 'integer', 'between:1,500']]);

        $sonuc = $this->posting->processPending($request->user()->company, $request->integer('limit', 200));

        return response()->json([
            'success' => true,
            'data'    => $sonuc,
            'message' => sprintf('%d olay işlendi, %d atlandı, %d istisna, %d hata.',
                $sonuc['processed'], $sonuc['skipped'], $sonuc['exception'], $sonuc['failed']),
        ]);
    }

    /**
     * İstisnadaki olayı yeniden dener.
     *
     * Dönem kapalıysa ya açılmalı ya da olay farklı bir muhasebe tarihine
     * taşınmalı; ikincisi için accounting_date verilir.
     */
    public function retry(Request $request, string $id): JsonResponse
    {
        $request->validate(['accounting_date' => ['nullable', 'date']]);

        $olay   = $this->find($request, $id);
        $sonuc  = $this->posting->retry($olay, $request->input('accounting_date'));

        return response()->json([
            'success' => $sonuc === 'processed' || $sonuc === 'skipped',
            'data'    => $this->shape($olay->fresh(), detayli: true),
            'message' => match ($sonuc) {
                'processed' => 'Olay işlendi ve fiş üretildi.',
                'skipped'   => 'Olayın muhasebe etkisi yok; atlandı.',
                'exception' => 'Olay hâlâ işlenemiyor: ' . $olay->fresh()->last_error,
                default     => 'Olay işlenemedi: ' . $olay->fresh()->last_error,
            },
        ], $sonuc === 'processed' || $sonuc === 'skipped' ? 200 : 422);
    }

    /** Depo kaydından muhasebeye: bu kayıt hangi fişleri üretti. */
    public function forWarehouseRecord(Request $request, string $recordId): JsonResponse
    {
        $kayit = WarehouseRecord::where('company_id', $request->user()->company_id)->findOrFail($recordId);

        $olaylar = InventoryAccountingEvent::where('company_id', $kayit->company_id)
            ->where('source_type', 'WAREHOUSE_RECORD')
            ->where('source_id', $kayit->id)
            ->with('journalEntry.lines.account')
            ->orderBy('created_at')
            ->get();

        return response()->json(['success' => true, 'data' => [
            'record' => [
                'id'            => $kayit->id,
                'record_number' => $kayit->record_number,
                'type'          => $kayit->type,
                'title'         => $kayit->title,
                'posted_at'     => $kayit->posted_at?->toISOString(),
                'reversed_at'   => $kayit->reversed_at?->toISOString(),
            ],
            'events' => $olaylar->map(fn ($o) => $this->shape($o, detayli: true)),
        ]]);
    }

    /** Fişten depoya: bu fiş hangi depo kaydından geldi. */
    public function forJournalEntry(Request $request, string $entryId): JsonResponse
    {
        $fis = JournalEntry::where('company_id', $request->user()->company_id)->findOrFail($entryId);

        $olay = InventoryAccountingEvent::where('journal_entry_id', $fis->id)->first();

        if (! $olay) {
            return response()->json([
                'success' => true,
                'data'    => ['source' => null, 'message' => 'Bu fiş bir depo olayından gelmiyor.'],
            ]);
        }

        $kayit = WarehouseRecord::find($olay->source_id);

        return response()->json(['success' => true, 'data' => [
            'journal_entry' => ['id' => $fis->id, 'journal_no' => $fis->journal_no],
            'event'         => $this->shape($olay, detayli: true),
            'record'        => $kayit ? [
                'id'            => $kayit->id,
                'record_number' => $kayit->record_number,
                'type'          => $kayit->type,
                'title'         => $kayit->title,
                'product_name'  => $kayit->product_name,
                'quantity'      => (float) $kayit->quantity,
                'warehouse_id'  => $kayit->warehouse_id,
            ] : null,
        ]]);
    }

    private function shape(InventoryAccountingEvent $o, bool $detayli = false): array
    {
        $temel = [
            'id'              => $o->id,
            'event_id'        => $o->event_id,
            'event_type'      => $o->event_type->value,
            'event_label'     => $o->event_type->label(),
            'source_type'     => $o->source_type,
            'source_id'       => $o->source_id,
            'source_number'   => $o->source_number,
            'accounting_date' => $o->accounting_date->toDateString(),
            'occurred_at'     => $o->occurred_at->toISOString(),
            'status'          => $o->status,
            'total_value'     => $o->totalValue(),
            'journal_entry_id'=> $o->journal_entry_id,
            'journal_no'      => $o->journalEntry?->journal_no,
            'skip_reason'     => $o->skip_reason,
            'last_error'      => $o->last_error,
            'attempts'        => $o->attempts,
            'processed_at'    => $o->processed_at?->toISOString(),
        ];

        if (! $detayli) {
            return $temel;
        }

        return $temel + [
            'payload' => $o->payload,
            'journal_lines' => $o->journalEntry?->lines->map(fn ($l) => [
                'account_code' => $l->account?->code,
                'account_name' => $l->account?->name,
                'debit'        => (string) $l->debit,
                'credit'       => (string) $l->credit,
                'dimensions'   => $l->dimensions,
            ]),
        ];
    }

    private function find(Request $request, string $id): InventoryAccountingEvent
    {
        return InventoryAccountingEvent::where('company_id', $request->user()->company_id)
            ->with('journalEntry.lines.account')
            ->whereKey($id)->firstOrFail();
    }
}
