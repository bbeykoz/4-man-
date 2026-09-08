<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class LogApiRequest
{
    private array $sensitiveFields = ['password', 'password_confirmation', 'current_password', 'two_factor_secret', 'token'];

    public function handle(Request $request, Closure $next): mixed
    {
        $startTime = microtime(true);
        $response  = $next($request);
        $duration  = round((microtime(true) - $startTime) * 1000, 2);

        // Sadece yavaş (>500ms) veya hata durum kodları için detaylı log
        if ($duration > 500 || $response->getStatusCode() >= 400) {
            Log::channel('daily')->info('API Request', [
                'method'      => $request->method(),
                'url'         => $request->fullUrl(),
                'status'      => $response->getStatusCode(),
                'duration_ms' => $duration,
                'user_id'     => $request->user()?->id,
                'ip'          => $request->ip(),
                'input'       => $this->sanitizeInput($request->all()),
            ]);
        }

        return $response;
    }

    private function sanitizeInput(array $input): array
    {
        foreach ($this->sensitiveFields as $field) {
            if (isset($input[$field])) {
                $input[$field] = '***';
            }
        }
        return $input;
    }
}
