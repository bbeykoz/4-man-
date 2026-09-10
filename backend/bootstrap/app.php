<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__ . '/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(\Illuminate\Http\Middleware\HandleCors::class);

        $middleware->alias([
            'permission'     => \App\Http\Middleware\CheckPermission::class,
            'company.access' => \App\Http\Middleware\CheckCompanyAccess::class,
            'module.enabled' => \App\Http\Middleware\CheckModuleEnabled::class,
            'log.api'        => \App\Http\Middleware\LogApiRequest::class,
        ]);

        $middleware->throttleApi('60,1');
        // statefulApi kaldırıldı — Bearer token kullanıyoruz, cookie/CSRF gereksiz
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Throwable $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                $status = 500;
                $code   = 'SERVER_ERROR';
                $message = 'Sunucu hatası oluştu.';

                if ($e instanceof \Illuminate\Auth\AuthenticationException) {
                    $status  = 401;
                    $code    = 'UNAUTHENTICATED';
                    $message = 'Kimlik doğrulaması gerekli.';
                } elseif ($e instanceof \Illuminate\Auth\Access\AuthorizationException) {
                    $status  = 403;
                    $code    = 'FORBIDDEN';
                    $message = 'Bu işlem için yetkiniz bulunmamaktadır.';
                } elseif ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
                    $status  = 404;
                    $code    = 'NOT_FOUND';
                    $message = 'Kayıt bulunamadı.';
                } elseif ($e instanceof \Illuminate\Validation\ValidationException) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Girilen veriler geçersiz.',
                        'errors'  => $e->errors(),
                        'code'    => 'VALIDATION_ERROR',
                    ], 422);
                } elseif ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpException) {
                    $status  = $e->getStatusCode();
                    $message = $e->getMessage() ?: $message;
                }

                return response()->json([
                    'success' => false,
                    'message' => $message,
                    'code'    => $code,
                    'debug'   => app()->isLocal() ? ['exception' => get_class($e), 'trace' => $e->getMessage()] : null,
                ], $status);
            }
        });
    })->create();
