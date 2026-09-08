<?php

namespace App\Http\Controllers\Api\V1\Company;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SettingsController extends Controller
{
    public function index(): JsonResponse
    {
        $company = Auth::user()->company;

        return response()->json([
            'success' => true,
            'data'    => [
                'name'       => $company->name,
                'email'      => $company->email,
                'phone'      => $company->phone,
                'website'    => $company->website,
                'address'    => $company->address,
                'tax_number' => $company->tax_number,
                ...$company->settings,
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'       => 'required|string|max:255',
            'email'      => 'required|email',
            'phone'      => 'nullable|string|max:30',
            'website'    => 'nullable|url',
            'address'    => 'nullable|string',
            'tax_number' => 'nullable|string|max:20',
        ]);

        $company = Auth::user()->company;
        $company->update($validated);

        return response()->json(['success' => true, 'message' => 'Ayarlar güncellendi.']);
    }
}
