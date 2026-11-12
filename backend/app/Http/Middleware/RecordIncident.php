<?php

namespace App\Http\Middleware;

use App\Services\Platform\IncidentRecorder;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Hata yanıtlarını platform olay kaydına yazar.
 *
 * Exception handler yalnız fırlatılan istisnaları görüyor. Yetki reddi, kapalı
 * modül, pasif departman gibi en sık yaşanan redler ara katmanlarda doğrudan
 * JsonResponse olarak dönüyor ve handler'a hiç uğramıyor — bu katman onları
 * yakalar. Handler'ın yazdığı olaylar `incident_recorded` imiyle atlanır.
 *
 * Sıra önemli: auth'tan sonra (kullanıcı belli olsun), yetki katmanlarından
 * önce (onların reddi de bu katmandan geçsin) yerleştirilir.
 */
class RecordIncident
{
    public function __construct(private readonly IncidentRecorder $recorder) {}

    public function handle(Request $request, Closure $next): mixed
    {
        $response = $next($request);

        if ($response->getStatusCode() >= 400) {
            $this->recorder->recordResponse(
                $request,
                $response->getStatusCode(),
                $response instanceof JsonResponse ? (array) $response->getData(true) : null,
            );
        }

        return $response;
    }
}
