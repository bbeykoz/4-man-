<?php

/**
 * Bulgaristan ulusal hesap planı — başlangıç şablonu.
 *
 * Bulgaristan'da işletme kendi bireysel hesap planını onaylar; mevzuat tek bir
 * planı dayatmaz. Bu yüzden şablon "öneri"dir: şirket kurulumda alır, sonra
 * kendi kodlamasına göre düzenler. Kodlar yaygın ulusal gruplamayı izler.
 *
 * Alanlar: code, name (çalışma dili), name_local (Bulgarca), type,
 * control (alt defterden yazılır, elle fiş kapalı), partner (cari zorunlu).
 */
return [
    // 1 — Sermaye ve uzun vadeli yükümlülükler
    ['code' => '101', 'name' => 'Kayıtlı sermaye',              'name_local' => 'Основен капитал',                 'type' => 'equity'],
    ['code' => '117', 'name' => 'Geçmiş yıl kârı/zararı',        'name_local' => 'Неразпределена печалба',          'type' => 'equity'],
    ['code' => '123', 'name' => 'Dönem kârı/zararı',             'name_local' => 'Печалба и загуба от текущия период', 'type' => 'equity'],
    ['code' => '151', 'name' => 'Banka kredileri',               'name_local' => 'Получени заеми',                  'type' => 'liability'],

    // 2 — Duran varlıklar
    ['code' => '203', 'name' => 'Binalar',                       'name_local' => 'Сгради',                          'type' => 'asset'],
    ['code' => '204', 'name' => 'Makine ve teçhizat',            'name_local' => 'Машини и оборудване',             'type' => 'asset'],
    ['code' => '205', 'name' => 'Taşıtlar',                      'name_local' => 'Транспортни средства',            'type' => 'asset'],
    ['code' => '241', 'name' => 'Birikmiş amortisman',           'name_local' => 'Амортизация на активи',           'type' => 'asset', 'normal_balance' => 'credit'],

    // 3 — Stoklar
    ['code' => '302', 'name' => 'Hammadde',                      'name_local' => 'Материали',                       'type' => 'asset', 'control' => true],
    ['code' => '303', 'name' => 'Mamul',                         'name_local' => 'Продукция',                       'type' => 'asset', 'control' => true],
    ['code' => '304', 'name' => 'Ticari mal',                    'name_local' => 'Стоки',                           'type' => 'asset', 'control' => true],
    ['code' => '611', 'name' => 'Üretim maliyeti',               'name_local' => 'Разходи за основна дейност',      'type' => 'expense'],
    // Mal kabul edildi, fatura gelmedi: fatura gelince kapanan ara hesap.
    ['code' => '309', 'name' => 'Faturası gelmemiş mal kabulü',  'name_local' => 'Стоки без фактура',               'type' => 'liability', 'control' => true],
    ['code' => '398', 'name' => 'Sayım farkı / fire',            'name_local' => 'Липси и излишъци',                'type' => 'expense'],
    ['code' => '399', 'name' => 'Depolar arası transit',         'name_local' => 'Стоки на път',                    'type' => 'asset', 'control' => true],

    // 4 — Ticari alacak ve borçlar
    ['code' => '401', 'name' => 'Tedarikçiler',                  'name_local' => 'Доставчици',                      'type' => 'liability', 'control' => true, 'partner' => true],
    ['code' => '402', 'name' => 'Verilen avanslar',              'name_local' => 'Аванси към доставчици',           'type' => 'asset',     'control' => true, 'partner' => true],
    ['code' => '411', 'name' => 'Müşteriler',                    'name_local' => 'Клиенти',                         'type' => 'asset',     'control' => true, 'partner' => true],
    ['code' => '412', 'name' => 'Alınan avanslar',               'name_local' => 'Аванси от клиенти',               'type' => 'liability', 'control' => true, 'partner' => true],
    ['code' => '421', 'name' => 'Personele borçlar',             'name_local' => 'Персонал',                        'type' => 'liability'],
    ['code' => '453', 'name' => 'Hesaplanan ДДС (satış)',        'name_local' => 'Начислен ДДС за продажби',        'type' => 'liability'],
    ['code' => '454', 'name' => 'İndirilecek ДДС (alış)',        'name_local' => 'Начислен ДДС за покупки',         'type' => 'asset'],
    ['code' => '455', 'name' => 'ДДС mahsup hesabı',             'name_local' => 'ДДС за внасяне/възстановяване',   'type' => 'liability'],
    ['code' => '452', 'name' => 'Kurumlar vergisi',              'name_local' => 'Корпоративен данък',              'type' => 'liability'],

    // 5 — Nakit ve banka
    // Not: kasa/banka henüz kontrol hesabı değil. Banka alt defteri Faz 6'da
    // gelince işaretlenecek; şimdiden kapatmak elle kaydı imkânsız kılar.
    ['code' => '501', 'name' => 'Kasa (EUR)',                    'name_local' => 'Каса в лева/евро',                'type' => 'asset'],
    ['code' => '502', 'name' => 'Kasa (döviz)',                  'name_local' => 'Каса във валута',                 'type' => 'asset'],
    ['code' => '503', 'name' => 'Banka (EUR)',                   'name_local' => 'Разплащателна сметка',            'type' => 'asset'],
    ['code' => '504', 'name' => 'Banka (döviz)',                 'name_local' => 'Валутна сметка',                  'type' => 'asset'],

    // 6 — Giderler
    ['code' => '601', 'name' => 'Malzeme gideri',                'name_local' => 'Разходи за материали',            'type' => 'expense'],
    ['code' => '602', 'name' => 'Dışarıdan sağlanan hizmetler',  'name_local' => 'Разходи за външни услуги',        'type' => 'expense'],
    ['code' => '603', 'name' => 'Amortisman gideri',             'name_local' => 'Разходи за амортизации',          'type' => 'expense'],
    ['code' => '604', 'name' => 'Personel gideri',               'name_local' => 'Разходи за заплати',              'type' => 'expense'],
    ['code' => '605', 'name' => 'Sosyal güvenlik gideri',        'name_local' => 'Разходи за осигуровки',           'type' => 'expense'],
    ['code' => '609', 'name' => 'Diğer giderler',                'name_local' => 'Други разходи',                   'type' => 'expense'],
    ['code' => '624', 'name' => 'Kur farkı gideri',              'name_local' => 'Разходи от валутни операции',     'type' => 'expense'],
    ['code' => '691', 'name' => 'Satılan malın maliyeti',        'name_local' => 'Себестойност на продадените стоки', 'type' => 'expense'],

    // 7 — Gelirler
    ['code' => '701', 'name' => 'Ticari mal satış geliri',       'name_local' => 'Приходи от продажби на стоки',    'type' => 'revenue'],
    ['code' => '702', 'name' => 'Mamul satış geliri',            'name_local' => 'Приходи от продажби на продукция', 'type' => 'revenue'],
    ['code' => '703', 'name' => 'Hizmet geliri',                 'name_local' => 'Приходи от услуги',               'type' => 'revenue'],
    ['code' => '724', 'name' => 'Kur farkı geliri',              'name_local' => 'Приходи от валутни операции',     'type' => 'revenue'],
    ['code' => '709', 'name' => 'Diğer gelirler',                'name_local' => 'Други приходи',                   'type' => 'revenue'],
];
