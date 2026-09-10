<?php

namespace App\Http\Middleware;

use App\Models\Module;
use Closure;
use Illuminate\Http\Request;

class CheckModuleEnabled
{
    /**
     * Birden fazla slug verilirse herhangi birinin açık olması yeterlidir.
     */
    public function handle(Request $request, Closure $next, string ...$moduleSlugs): mixed
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Kimlik doğrulaması gerekli.'], 401);
        }

        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        // Süper admin tarafından sistem genelinde pasife alınan departman kimseye açılmaz
        $activeSlugs = array_values(array_filter($moduleSlugs, fn($slug) => Module::isSlugActive($slug)));

        if (empty($activeSlugs)) {
            return response()->json([
                'success' => false,
                'message' => 'Bu departman sistem yöneticisi tarafından pasife alınmıştır.',
                'code'    => 'MODULE_PASSIVE',
            ], 403);
        }

        if (!$user->company) {
            return response()->json([
                'success' => false,
                'message' => 'Şirket bilgisi bulunamadı.',
                'code'    => 'NO_COMPANY',
            ], 403);
        }

        foreach ($activeSlugs as $slug) {
            if ($user->company->isModuleEnabled($slug)) {
                return $next($request);
            }
        }

        $label = implode(', ', $moduleSlugs);

        return response()->json([
            'success' => false,
            'message' => "'{$label}' modülü şirketiniz için aktif değil.",
            'code'    => 'MODULE_DISABLED',
        ], 403);
    }
}
