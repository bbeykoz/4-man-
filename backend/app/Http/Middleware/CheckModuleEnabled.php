<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckModuleEnabled
{
    public function handle(Request $request, Closure $next, string $moduleSlug): mixed
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Kimlik doğrulaması gerekli.'], 401);
        }

        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        if (!$user->company) {
            return response()->json([
                'success' => false,
                'message' => 'Şirket bilgisi bulunamadı.',
                'code'    => 'NO_COMPANY',
            ], 403);
        }

        if (!$user->company->isModuleEnabled($moduleSlug)) {
            return response()->json([
                'success' => false,
                'message' => "'{$moduleSlug}' modülü şirketiniz için aktif değil.",
                'code'    => 'MODULE_DISABLED',
            ], 403);
        }

        return $next($request);
    }
}
