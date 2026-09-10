<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckCompanyAccess
{
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Kimlik doğrulaması gerekli.'], 401);
        }

        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        // URL'deki company_id ile kullanıcının company_id'si eşleşmeli
        $routeCompanyId = $request->route('company_id')
            ?? $request->route('company')
            ?? $request->input('company_id');

        if ($routeCompanyId && $routeCompanyId !== $user->company_id) {
            return response()->json([
                'success' => false,
                'message' => 'Bu şirkete erişim yetkiniz yok.',
                'code'    => 'COMPANY_ACCESS_DENIED',
            ], 403);
        }

        // Şirket aktif mi?
        if ($user->company && $user->company->status->value !== 'active') {
            return response()->json([
                'success' => false,
                'message' => 'Şirket hesabınız aktif değil.',
                'code'    => 'COMPANY_INACTIVE',
            ], 403);
        }

        return $next($request);
    }
}
