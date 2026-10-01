<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Tanıtım sayfasındaki "bize ulaşın" ve "demo iste" formları.
 * Oturum gerektirmez; gelen her kayıt satış ekibinin destek talebi olarak düşer.
 */
class PublicLeadController extends Controller
{
    /** Form konusu → talebin başlığı. */
    private const SUBJECTS = [
        'demo'    => 'Demo talebi',
        'sales'   => 'Satış ve fiyatlandırma',
        'support' => 'Teknik destek sorusu',
        'setup'   => 'Kurulum ve eğitim',
    ];

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'    => ['required', 'string', 'max:120'],
            'email'   => ['required', 'email', 'max:160'],
            'phone'   => ['nullable', 'string', 'max:40'],
            'company' => ['nullable', 'string', 'max:160'],
            'subject' => ['required', 'string', 'in:demo,sales,support,setup'],
            'message' => ['required', 'string', 'max:3000'],
        ], [
            'name.required'    => 'Adınızı yazın.',
            'email.required'   => 'E-posta adresinizi yazın.',
            'email.email'      => 'Geçerli bir e-posta adresi yazın.',
            'subject.in'       => 'Konu seçin.',
            'message.required' => 'Mesajınızı yazın.',
        ]);

        $subject = self::SUBJECTS[$data['subject']];

        Ticket::create([
            'user_id'         => null,
            'company_id'      => null,
            'title'           => $subject . ' — ' . $data['name'],
            'body'            => $data['message'],
            'type'            => 'support',
            // Tanıtım sayfasından gelen her talep satış ekibine düşer
            'team'            => Ticket::TEAM_SALES,
            'source'          => 'marketing',
            'priority'        => $data['subject'] === 'demo' ? 'high' : 'medium',
            'contact_name'    => $data['name'],
            'contact_email'   => $data['email'],
            'contact_phone'   => $data['phone'] ?? null,
            'contact_company' => $data['company'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Mesajınız alındı. Satış ekibimiz en kısa sürede dönecek.',
        ], 201);
    }
}
