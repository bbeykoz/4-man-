<?php

namespace App\Services\Accounting;

use App\Enums\Accounting\DocumentType;
use App\Models\Accounting\DocumentSeries;
use App\Models\Company;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Numara serisi yönetimi.
 *
 * Her belge türünün en az bir serisi olmalı. Kullanılmış seri silinemez;
 * pasife alınır — geçmiş belgelerin serisi kaybolursa numara bütünlüğü
 * doğrulanamaz.
 */
class DocumentSeriesService
{
    public function __construct(private readonly AuditService $audit) {}

    /** Her belge türü için varsayılan "A" serisini kurar. */
    public function installDefaults(Company $company): int
    {
        $eklenen = 0;

        DB::transaction(function () use ($company, &$eklenen) {
            foreach (DocumentType::cases() as $tur) {
                $varMi = DocumentSeries::where('company_id', $company->id)
                    ->where('doc_type', $tur->value)
                    ->exists();

                if ($varMi) {
                    continue;
                }

                DocumentSeries::create([
                    'company_id'   => $company->id,
                    'doc_type'     => $tur->value,
                    'code'         => 'A',
                    'name'         => $tur->label() . ' — A serisi',
                    'prefix'       => $tur->prefix(),
                    'padding'      => 6,
                    'reset_yearly' => true,
                    'is_default'   => true,
                    'is_active'    => true,
                ]);

                $eklenen++;
            }
        });

        if ($eklenen > 0) {
            $this->audit->log(
                companyId: $company->id, action: 'document_series.installed',
                entityType: 'DocumentSeries', payload: ['created' => $eklenen],
            );
        }

        return $eklenen;
    }

    public function create(Company $company, array $data): DocumentSeries
    {
        $seri = DocumentSeries::create([
            'company_id'       => $company->id,
            'doc_type'         => $data['doc_type'],
            'code'             => $data['code'],
            'name'             => $data['name'],
            'prefix'           => $data['prefix'] ?? null,
            'padding'          => $data['padding'] ?? 6,
            'reset_yearly'     => $data['reset_yearly'] ?? true,
            'is_default'       => $data['is_default'] ?? false,
            'is_active'        => $data['is_active'] ?? true,
            'allowed_user_ids' => $data['allowed_user_ids'] ?? [],
            'branch'           => $data['branch'] ?? null,
        ]);

        if ($seri->is_default) {
            $this->clearOtherDefaults($seri);
        }

        $this->audit->logModel($seri, 'document_series.created', ['code' => $seri->code, 'type' => $seri->doc_type->value]);

        return $seri;
    }

    public function update(DocumentSeries $seri, array $data): DocumentSeries
    {
        // Kullanılmış seride ön ek ve hane sayısı değişemez: numaranın biçimi
        // değişirse aynı seride iki farklı desen oluşur, sıralama bozulur.
        if ($this->isUsed($seri)) {
            foreach (['prefix', 'padding', 'code', 'reset_yearly'] as $alan) {
                if (array_key_exists($alan, $data) && (string) $data[$alan] !== (string) $seri->{$alan}) {
                    throw ValidationException::withMessages([
                        $alan => "{$seri->name} serisinden belge kesilmiş; numara biçimi değiştirilemez. Yeni seri açın.",
                    ]);
                }
            }
        }

        $seri->update(array_intersect_key($data, array_flip([
            'name', 'prefix', 'padding', 'reset_yearly', 'is_default', 'is_active', 'allowed_user_ids', 'branch',
        ])));

        if ($seri->is_default) {
            $this->clearOtherDefaults($seri);
        }

        $this->audit->logModel($seri, 'document_series.updated', ['code' => $seri->code]);

        return $seri->fresh();
    }

    public function delete(DocumentSeries $seri): void
    {
        if ($this->isUsed($seri)) {
            throw ValidationException::withMessages([
                'series' => "{$seri->name} serisinden belge kesilmiş; silinemez. Pasife alın.",
            ]);
        }

        $this->audit->logModel($seri, 'document_series.deleted', ['code' => $seri->code]);
        $seri->delete();
    }

    public function isUsed(DocumentSeries $seri): bool
    {
        return DB::table('documents')->where('series_id', $seri->id)->exists();
    }

    /**
     * Seride numara atlaması var mı.
     * Mevzuat atlamasız sıra istiyor; iptal edilen belgeler numarayı tutar.
     */
    public function gapCheck(DocumentSeries $seri, ?int $yil = null): array
    {
        $numaralar = DB::table('documents')
            ->where('series_id', $seri->id)
            ->whereNotNull('number')
            ->when($yil, fn ($q) => $q->whereYear('issue_date', $yil))
            ->orderBy('number')
            ->pluck('number');

        // Numaranın sonundaki rakam dizisi sıra numarasıdır. Son 10 karakteri
        // almak "SF-2026-000001" gibi bir numarada yıl basamaklarını da
        // yakalıyor ve sıra 26000001 gibi okunuyordu.
        $siralar = $numaralar
            ->map(function (string $n): ?int {
                return preg_match('/(\d+)\D*$/', $n, $e) ? (int) $e[1] : null;
            })
            ->filter(fn (?int $v) => $v !== null)
            ->sort()
            ->values();

        $bosluklar = [];
        for ($i = 1; $i < $siralar->count(); $i++) {
            $fark = $siralar[$i] - $siralar[$i - 1];
            if ($fark > 1) {
                $bosluklar[] = ['after' => $siralar[$i - 1], 'before' => $siralar[$i], 'missing' => $fark - 1];
            }
        }

        return [
            'series'       => $seri->code,
            'document_count' => $siralar->count(),
            'first'        => $siralar->first(),
            'last'         => $siralar->last(),
            'gaps'         => $bosluklar,
            'has_gaps'     => $bosluklar !== [],
        ];
    }

    private function clearOtherDefaults(DocumentSeries $seri): void
    {
        DocumentSeries::where('company_id', $seri->company_id)
            ->where('doc_type', $seri->doc_type->value)
            ->whereKeyNot($seri->id)
            ->update(['is_default' => false]);
    }
}
