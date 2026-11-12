<?php

namespace App\Http\Controllers\Api\V1\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\PlatformIncident;
use App\Services\Platform\IncidentRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Platform olay kayıtları: kiracı şirketlerde oluşan hatalar.
 *
 * Yalnız platform ekibi erişir. Şirket tarafında bu kayıtları okuyan uç yok;
 * rotalar admin grubunun altında ve platform izniyle korunuyor.
 */
class PlatformIncidentController extends Controller
{
    public function __construct(private readonly IncidentRecorder $recorder) {}

    public function index(Request $request): JsonResponse
    {
        $sorgu = PlatformIncident::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->boolean('open_only'), fn ($q) => $q->open())
            ->when($request->filled('level'), fn ($q) => $q->where('level', $request->string('level')))
            ->when($request->filled('company_id'), fn ($q) => $q->where('company_id', $request->string('company_id')))
            ->when($request->filled('source'), fn ($q) => $q->where('source', $request->string('source')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $a = '%' . $request->string('search') . '%';
                $q->where(fn ($s) => $s->where('message', 'ilike', $a)
                    ->orWhere('request_path', 'ilike', $a)
                    ->orWhere('exception_class', 'ilike', $a)
                    ->orWhere('company_name', 'ilike', $a));
            })
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('last_seen_at', '>=', $request->string('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('last_seen_at', '<=', $request->string('date_to')));

        $kayitlar = (clone $sorgu)->orderByDesc('last_seen_at')->paginate($request->integer('per_page', 25));

        return response()->json([
            'success' => true,
            'data'    => collect($kayitlar->items())->map(fn ($k) => $this->ozet($k)),
            'meta'    => [
                'current_page' => $kayitlar->currentPage(),
                'per_page'     => $kayitlar->perPage(),
                'total'        => $kayitlar->total(),
                'last_page'    => $kayitlar->lastPage(),
            ],
            'summary' => $this->ozetSayilar(),
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $kayit = PlatformIncident::with(['company:id,name', 'user:id,name,email', 'resolver:id,name'])->findOrFail($id);

        return response()->json(['success' => true, 'data' => $this->ozet($kayit) + [
            'trace'           => $kayit->trace,
            'request_payload' => $kayit->request_payload,
            'user_agent'      => $kayit->user_agent,
            'file'            => $kayit->file,
            'line'            => $kayit->line,
            'resolver_name'   => $kayit->resolver?->name,
        ]]);
    }

    /** Durum ve çözüm notu. Not, olayın altında kalıcı olarak saklanır. */
    public function update(Request $request, string $id): JsonResponse
    {
        $veri = $request->validate([
            'status'          => ['nullable', 'in:open,investigating,resolved,ignored'],
            'resolution_note' => ['nullable', 'string', 'max:5000'],
        ]);

        $kayit = PlatformIncident::findOrFail($id);

        if (array_key_exists('resolution_note', $veri)) {
            $kayit->resolution_note = $veri['resolution_note'];
        }

        if (! empty($veri['status'])) {
            $kayit->status = $veri['status'];

            if (in_array($veri['status'], ['resolved', 'ignored'], true)) {
                $kayit->resolved_by = $request->user()->id;
                $kayit->resolved_at = now();
            } else {
                $kayit->resolved_by = null;
                $kayit->resolved_at = null;
            }
        }

        $kayit->save();

        return response()->json([
            'success' => true,
            'message' => 'Olay kaydı güncellendi.',
            'data'    => $this->ozet($kayit->fresh(['resolver:id,name'])),
        ]);
    }

    /** Platform ekibinin elle açtığı kayıt (telefonla gelen şikâyet gibi). */
    public function store(Request $request): JsonResponse
    {
        $veri = $request->validate([
            'message'         => ['required', 'string', 'max:1000'],
            'company_id'      => ['nullable', 'uuid', 'exists:companies,id'],
            'level'           => ['nullable', 'in:critical,error,warning'],
            'request_path'    => ['nullable', 'string', 'max:255'],
            'suggested_fix'   => ['nullable', 'string', 'max:5000'],
            'resolution_note' => ['nullable', 'string', 'max:5000'],
        ]);

        $sirket = ! empty($veri['company_id']) ? \App\Models\Company::find($veri['company_id']) : null;

        $kayit = $this->recorder->recordManual($veri + [
            'company_name' => $sirket?->name,
            'user_id'      => $request->user()->id,
            'user_name'    => $request->user()->name,
        ]);

        return response()->json(['success' => true, 'message' => 'Olay kaydı eklendi.', 'data' => $this->ozet($kayit)], 201);
    }

    public function destroy(string $id): JsonResponse
    {
        PlatformIncident::findOrFail($id)->delete();

        return response()->json(['success' => true, 'message' => 'Olay kaydı silindi.']);
    }

    private function ozet(PlatformIncident $k): array
    {
        return [
            'id'              => $k->id,
            'level'           => $k->level,
            'level_label'     => match ($k->level) {
                'critical' => 'Kritik',
                'warning'  => 'Uyarı',
                default    => 'Hata',
            },
            'source'          => $k->source,
            'source_label'    => match ($k->source) {
                'validation' => 'Hatalı giriş',
                'manual'     => 'Elle eklendi',
                default      => 'Sistem hatası',
            },
            'status'          => $k->status,
            'status_label'    => match ($k->status) {
                'investigating' => 'İnceleniyor',
                'resolved'      => 'Çözüldü',
                'ignored'       => 'Yok sayıldı',
                default         => 'Açık',
            },
            'company_id'      => $k->company_id,
            'company_name'    => $k->company_name,
            'user_name'       => $k->user_name,
            'user_email'      => $k->user_email,
            'exception_class' => $k->exception_class,
            'message'         => $k->message,
            'request_method'  => $k->request_method,
            'request_path'    => $k->request_path,
            'status_code'     => $k->status_code,
            'ip_address'      => $k->ip_address,
            'occurrences'     => $k->occurrences,
            'first_seen_at'   => $k->first_seen_at?->toISOString(),
            'last_seen_at'    => $k->last_seen_at?->toISOString(),
            'suggested_fix'   => $k->suggested_fix,
            'resolution_note' => $k->resolution_note,
            'resolved_at'     => $k->resolved_at?->toISOString(),
        ];
    }

    private function ozetSayilar(): array
    {
        $satirlar = PlatformIncident::selectRaw('status, level, count(*) as adet, sum(occurrences) as tekrar')
            ->groupBy('status', 'level')
            ->get();

        return [
            'open'         => (int) $satirlar->whereIn('status', ['open', 'investigating'])->sum('adet'),
            'critical_open'=> (int) $satirlar->whereIn('status', ['open', 'investigating'])->where('level', 'critical')->sum('adet'),
            'resolved'     => (int) $satirlar->where('status', 'resolved')->sum('adet'),
            'total'        => (int) $satirlar->sum('adet'),
            'occurrences'  => (int) $satirlar->sum('tekrar'),
        ];
    }
}
