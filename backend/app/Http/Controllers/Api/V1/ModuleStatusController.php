<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;

class ModuleStatusController extends Controller
{
    /**
     * Departmanların sistem genelindeki aktif/pasif durumu.
     * Menü ve sayfa erişimi için tüm kullanıcılara açıktır.
     */
    public function __invoke(): JsonResponse
    {
        $modules = Module::ordered()->get(['slug', 'name', 'is_active']);

        return response()->json([
            'success' => true,
            'data'    => $modules->map(fn($m) => [
                'slug'      => $m->slug,
                'name'      => $m->name,
                'is_active' => $m->is_active,
            ]),
        ]);
    }
}
