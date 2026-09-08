<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user     = $request->user();
        $settings = Setting::where('company_id', $user->company_id)
            ->orWhereNull('company_id')
            ->get()
            ->groupBy('group');

        return response()->json(['success' => true, 'data' => $settings]);
    }

    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'settings'   => ['required', 'array'],
            'settings.*' => ['nullable'],
        ]);

        $user = $request->user();

        foreach ($request->settings as $key => $value) {
            Setting::set($key, $value, $user->company_id);
        }

        return response()->json(['success' => true, 'message' => 'Ayarlar kaydedildi.']);
    }
}
