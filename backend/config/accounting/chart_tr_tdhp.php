<?php

/**
 * Türkiye Tek Düzen Hesap Planı — başlangıç şablonu.
 *
 * TDHP mevzuatla belirlidir; bu dosya tam planın yaygın kullanılan
 * alt kümesidir. Şirket kurulumda alır ve kendi alt hesaplarını ekler.
 */
return [
    // 1 — Dönen varlıklar
    ['code' => '100', 'name' => 'Kasa',                          'type' => 'asset'],
    ['code' => '102', 'name' => 'Bankalar',                      'type' => 'asset'],
    ['code' => '108', 'name' => 'Diğer hazır değerler',          'type' => 'asset'],
    ['code' => '120', 'name' => 'Alıcılar',                      'type' => 'asset',     'control' => true, 'partner' => true],
    ['code' => '153', 'name' => 'Ticari mallar',                 'type' => 'asset',     'control' => true],
    ['code' => '150', 'name' => 'İlk madde ve malzeme',          'type' => 'asset',     'control' => true],
    ['code' => '152', 'name' => 'Mamuller',                      'type' => 'asset',     'control' => true],
    ['code' => '157', 'name' => 'Diğer stoklar',                 'type' => 'asset'],
    ['code' => '159', 'name' => 'Verilen sipariş avansları',     'type' => 'asset',     'control' => true, 'partner' => true],
    ['code' => '191', 'name' => 'İndirilecek KDV',               'type' => 'asset'],
    ['code' => '196', 'name' => 'Personel avansları',            'type' => 'asset'],

    // 2 — Duran varlıklar
    ['code' => '252', 'name' => 'Binalar',                       'type' => 'asset'],
    ['code' => '253', 'name' => 'Tesis, makine ve cihazlar',     'type' => 'asset'],
    ['code' => '254', 'name' => 'Taşıtlar',                      'type' => 'asset'],
    ['code' => '255', 'name' => 'Demirbaşlar',                   'type' => 'asset'],
    ['code' => '257', 'name' => 'Birikmiş amortismanlar',        'type' => 'asset', 'normal_balance' => 'credit'],

    // 3 — Kısa vadeli yabancı kaynaklar
    ['code' => '300', 'name' => 'Banka kredileri',               'type' => 'liability'],
    ['code' => '320', 'name' => 'Satıcılar',                     'type' => 'liability', 'control' => true, 'partner' => true],
    ['code' => '326', 'name' => 'Alınan depozito ve teminatlar', 'type' => 'liability'],
    ['code' => '335', 'name' => 'Personele borçlar',             'type' => 'liability'],
    ['code' => '340', 'name' => 'Alınan sipariş avansları',      'type' => 'liability', 'control' => true, 'partner' => true],
    ['code' => '360', 'name' => 'Ödenecek vergi ve fonlar',      'type' => 'liability'],
    ['code' => '361', 'name' => 'Ödenecek sosyal güvenlik kes.', 'type' => 'liability'],
    ['code' => '391', 'name' => 'Hesaplanan KDV',                'type' => 'liability'],
    ['code' => '397', 'name' => 'Sayım ve tesellüm fazlaları',   'type' => 'liability'],
    // Mal kabul edildi, fatura gelmedi.
    ['code' => '326.01', 'name' => 'Faturası gelmemiş mal kabulü', 'type' => 'liability', 'control' => true],

    // 5 — Özkaynaklar
    ['code' => '500', 'name' => 'Sermaye',                       'type' => 'equity'],
    ['code' => '570', 'name' => 'Geçmiş yıllar kârları',         'type' => 'equity'],
    ['code' => '590', 'name' => 'Dönem net kârı',                'type' => 'equity'],

    // 6 — Gelir tablosu
    ['code' => '600', 'name' => 'Yurtiçi satışlar',              'type' => 'revenue'],
    ['code' => '601', 'name' => 'Yurtdışı satışlar',             'type' => 'revenue'],
    ['code' => '602', 'name' => 'Diğer gelirler',                'type' => 'revenue'],
    ['code' => '610', 'name' => 'Satıştan iadeler',              'type' => 'revenue', 'normal_balance' => 'debit'],
    ['code' => '611', 'name' => 'Satış iskontoları',             'type' => 'revenue', 'normal_balance' => 'debit'],
    ['code' => '621', 'name' => 'Satılan ticari mal maliyeti',   'type' => 'expense'],
    ['code' => '620', 'name' => 'Satılan mamul maliyeti',        'type' => 'expense'],
    ['code' => '630', 'name' => 'Araştırma ve geliştirme gid.',  'type' => 'expense'],
    ['code' => '631', 'name' => 'Pazarlama satış dağıtım gid.',  'type' => 'expense'],
    ['code' => '632', 'name' => 'Genel yönetim giderleri',       'type' => 'expense'],
    ['code' => '646', 'name' => 'Kambiyo kârları',               'type' => 'revenue'],
    ['code' => '656', 'name' => 'Kambiyo zararları',             'type' => 'expense'],
    ['code' => '689', 'name' => 'Diğer olağandışı gider',        'type' => 'expense'],
    ['code' => '691', 'name' => 'Dönem kârı vergi karşılığı',    'type' => 'expense'],

    // 7 — Maliyet hesapları
    ['code' => '710', 'name' => 'Direkt ilk madde ve malzeme',   'type' => 'expense'],
    ['code' => '720', 'name' => 'Direkt işçilik giderleri',      'type' => 'expense'],
    ['code' => '730', 'name' => 'Genel üretim giderleri',        'type' => 'expense'],
];
