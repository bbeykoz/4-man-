<?php

namespace App\Http\Controllers\Api\V1\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\Accounting\ChartAccountResource;
use App\Models\Accounting\ChartAccount;
use App\Services\Accounting\ChartOfAccountsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Hesap planı uçları.
 *
 * Şirket oturumdaki kullanıcıdan gelir; istemci parametresine güvenilmez.
 */
class ChartAccountController extends Controller
{
    public function __construct(private readonly ChartOfAccountsService $service) {}

    public function index(Request $request): JsonResponse
    {
        $company = $request->user()->company;

        $sorgu = ChartAccount::where('company_id', $company->id)
            ->when($request->filled('search'), function ($q) use ($request) {
                $a = '%' . $request->string('search') . '%';
                $q->where(fn ($s) => $s->where('code', 'ilike', $a)
                    ->orWhere('name', 'ilike', $a)
                    ->orWhere('name_local', 'ilike', $a));
            })
            ->when($request->filled('account_type'), fn ($q) => $q->where('account_type', $request->string('account_type')))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->boolean('postable'), fn ($q) => $q->where('is_control', false)->where('is_active', true))
            ->orderBy('code');

        // Fiş ekranındaki hesap seçici tüm planı bir kerede ister; liste ekranı sayfalar.
        if ($request->boolean('all')) {
            return response()->json(['success' => true, 'data' => ChartAccountResource::collection($sorgu->get())]);
        }

        return response()->json([
            'success' => true,
            'data'    => ChartAccountResource::collection($sorgu->paginate($request->integer('per_page', 50))),
        ]);
    }

    /** Hiyerarşik görünüm. */
    public function tree(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->service->tree($request->user()->company_id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());

        $hesap = $this->service->create($request->user()->company, $data);

        return response()->json([
            'success' => true,
            'data'    => new ChartAccountResource($hesap),
            'message' => 'Hesap oluşturuldu.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => new ChartAccountResource($this->find($request, $id)),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $hesap = $this->find($request, $id);
        $data  = $request->validate($this->rules(sometimes: true));

        return response()->json([
            'success' => true,
            'data'    => new ChartAccountResource($this->service->update($hesap, $data)),
            'message' => 'Hesap güncellendi.',
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->service->delete($this->find($request, $id));

        return response()->json(['success' => true, 'message' => 'Hesap silindi.']);
    }

    public function deactivate(Request $request, string $id): JsonResponse
    {
        $request->validate(['active_to' => ['nullable', 'date']]);

        return response()->json([
            'success' => true,
            'data'    => new ChartAccountResource($this->service->deactivate($this->find($request, $id), $request->input('active_to'))),
            'message' => 'Hesap kullanıma kapatıldı.',
        ]);
    }

    /** Ülke paketinin hesap planı şablonunu kurar. */
    public function installTemplate(Request $request): JsonResponse
    {
        $request->validate(['template' => ['nullable', 'string', 'max:40']]);

        $eklenen = $this->service->installTemplate($request->user()->company, $request->input('template'));

        return response()->json([
            'success' => true,
            'data'    => ['created' => $eklenen],
            'message' => $eklenen > 0
                ? "$eklenen hesap eklendi."
                : 'Şablondaki tüm hesaplar zaten mevcut.',
        ]);
    }

    private function rules(bool $sometimes = false): array
    {
        $z = $sometimes ? 'sometimes' : 'required';

        return [
            'code'                  => [$z, 'string', 'max:20'],
            'name'                  => [$z, 'string', 'max:255'],
            'name_local'            => ['nullable', 'string', 'max:255'],
            'account_type'          => [$z, Rule::in(['asset', 'liability', 'equity', 'revenue', 'expense', 'off_balance'])],
            'normal_balance'        => ['nullable', Rule::in(['debit', 'credit'])],
            'parent_id'             => ['nullable', 'uuid', 'exists:chart_accounts,id'],
            'is_control'            => ['nullable', 'boolean'],
            'requires_partner'      => ['nullable', 'boolean'],
            'required_dimensions'   => ['nullable', 'array'],
            'required_dimensions.*' => ['string', 'max:30'],
            'active_from'           => ['nullable', 'date'],
            'active_to'             => ['nullable', 'date', 'after_or_equal:active_from'],
            'is_active'             => ['nullable', 'boolean'],
            'description'           => ['nullable', 'string', 'max:1000'],
        ];
    }

    private function find(Request $request, string $id): ChartAccount
    {
        return ChartAccount::where('company_id', $request->user()->company_id)
            ->whereKey($id)
            ->firstOrFail();
    }
}
