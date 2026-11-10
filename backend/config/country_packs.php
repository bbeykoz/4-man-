<?php

/**
 * Ülke paketleri.
 *
 * Muhasebe çekirdeği ülke bağımsızdır: fiş, hesap planı, dönem ve defter mantığı
 * her ülkede aynı çalışır. Ülkeye özgü olan her şey bu dosyada toplanıyor —
 * para birimi, saat dilimi, resmi belge dili, kimlik numarası biçimi, vergi
 * otoritesi ve hesap planı şablonu.
 *
 * Buradaki vergi oranları yalnızca ilk kurulum tohumu içindir. Canlı oranlar
 * tax_codes tablosunda valid_from/valid_to ile tutulur; mevzuat değişince
 * geçmiş fişler değişmesin diye kod içine sabitlenmez.
 */
return [

    'default' => 'TR',

    'packs' => [

        'BG' => [
            'name'                => 'Bulgaristan',
            'currency'            => 'EUR',
            'timezone'            => 'Europe/Sofia',
            'document_locale'     => 'bg',
            'fiscal_year_start'   => 1,
            'tax_authority'       => 'NRA',      // НАП
            'vat_term'            => 'ДДС',
            // Zorunlu KDV kayıt eşiği (2026). Mevzuat parametresi; sayaç bunu kullanır.
            'vat_threshold'       => ['amount' => 51130, 'currency' => 'EUR', 'valid_from' => '2026-01-01'],
            'corporate_tax_rate'  => 10.0,
            // Fatura düzenleme süresi: vergiyi doğuran olaydan itibaren gün.
            // ЗДДС md. 113 genel kural 5 gün; özel haller ayrıca modellenir.
            'invoice_deadline_days' => 5,
            // KDV beyanı son günü: takip eden ayın bu günü.
            'vat_return_due_day'    => 14,
            'chart_template'      => 'bg_national',
            // Tüzel kişi kimliği: EIK/BULSTAT 9 veya 13 hane.
            'registration_label'  => 'EIK/BULSTAT',
            'registration_regex'  => '/^\d{9}(\d{4})?$/',
            'vat_number_regex'    => '/^BG\d{9,10}$/',
            'seed_tax_rates'      => [
                ['code' => 'BG_VAT_STD',      'rate' => 20.0, 'treatment' => 'standard'],
                ['code' => 'BG_VAT_REDUCED',  'rate' => 9.0,  'treatment' => 'reduced'],
                ['code' => 'BG_VAT_ZERO',     'rate' => 0.0,  'treatment' => 'zero'],
                ['code' => 'BG_VAT_EXEMPT',   'rate' => 0.0,  'treatment' => 'exempt'],
                ['code' => 'BG_VAT_RC',       'rate' => 0.0,  'treatment' => 'reverse_charge'],
                ['code' => 'BG_VAT_EU_SUPPLY','rate' => 0.0,  'treatment' => 'eu_supply'],
                ['code' => 'BG_VAT_IMPORT',   'rate' => 20.0, 'treatment' => 'import'],
            ],
            // 1 EUR = 1.95583 BGN sabit dönüşüm. Eski BGN kayıtları tarihsel korunur.
            // Muhasebe rolü → hesap kodu. Kod hiçbir yerde hesap numarası
            // yazmaz; rolü sorar ve şirketin eşlemesinden okur.
            'account_roles'       => [
                'ar_control'         => '411',
                'ap_control'         => '401',
                'customer_advance'   => '412',
                'supplier_advance'   => '402',
                'output_vat'         => '453',
                'input_vat'          => '454',
                'non_deductible_vat' => '609',
                'vat_settlement'     => '455',
                'default_revenue'    => '701',
                'default_expense'    => '602',
                'inventory'          => '304',
                'grni'               => '309',
                'cogs'               => '691',
                'inventory_variance' => '398',
                'inventory_transit'  => '399',
                'cash'               => '501',
                'bank'               => '503',
                'fx_gain'            => '724',
                'fx_loss'            => '624',
                'rounding'           => '609',
                'retained_earnings'  => '117',
            ],
            'legacy_currency'     => ['code' => 'BGN', 'fixed_rate' => '1.95583', 'until' => '2025-12-31'],
            'reporting'           => ['saf_t' => true, 'vies' => true, 'intrastat' => true, 'fiscal_device' => true],
        ],

        'TR' => [
            'name'                => 'Türkiye',
            'currency'            => 'TRY',
            'timezone'            => 'Europe/Istanbul',
            'document_locale'     => 'tr',
            'fiscal_year_start'   => 1,
            'tax_authority'       => 'GİB',
            'vat_term'            => 'KDV',
            'vat_threshold'       => null,       // Türkiye'de ciro eşiği yok
            'corporate_tax_rate'  => 25.0,
            // VUK: fatura malın teslimi/hizmetin ifasından itibaren 7 gün.
            'invoice_deadline_days' => 7,
            // KDV beyanı takip eden ayın 28'ine kadar verilir.
            'vat_return_due_day'    => 28,
            'chart_template'      => 'tr_tdhp',   // Tek Düzen Hesap Planı
            'registration_label'  => 'Vergi No',
            'registration_regex'  => '/^\d{10}$/',
            'vat_number_regex'    => '/^\d{10}$/',
            'seed_tax_rates'      => [
                ['code' => 'TR_KDV_20',     'rate' => 20.0, 'treatment' => 'standard'],
                ['code' => 'TR_KDV_10',     'rate' => 10.0, 'treatment' => 'reduced'],
                ['code' => 'TR_KDV_1',      'rate' => 1.0,  'treatment' => 'reduced_low'],
                ['code' => 'TR_KDV_0',      'rate' => 0.0,  'treatment' => 'zero'],
                ['code' => 'TR_KDV_EXEMPT', 'rate' => 0.0,  'treatment' => 'exempt'],
                ['code' => 'TR_KDV_RC',     'rate' => 0.0,  'treatment' => 'reverse_charge'],
            ],
            'account_roles'       => [
                'ar_control'         => '120',
                'ap_control'         => '320',
                'customer_advance'   => '340',
                'supplier_advance'   => '159',
                'output_vat'         => '391',
                'input_vat'          => '191',
                'non_deductible_vat' => '689',
                'vat_settlement'     => '360',
                'default_revenue'    => '600',
                'default_expense'    => '632',
                'inventory'          => '153',
                'grni'               => '326.01',
                'cogs'               => '621',
                'inventory_variance' => '397',
                'inventory_transit'  => '157',
                'cash'               => '100',
                'bank'               => '102',
                'fx_gain'            => '646',
                'fx_loss'            => '656',
                'rounding'           => '689',
                'retained_earnings'  => '570',
            ],
            'legacy_currency'     => null,
            'reporting'           => ['e_fatura' => true, 'e_defter' => true, 'e_arsiv' => true],
        ],

    ],
];
