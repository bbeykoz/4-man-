<?php

/**
 * Muhasebe izinleri ve rol şablonları.
 *
 * Mevcut izin altyapısına ekleniyor; ayrı bir yetki sistemi kurmuyoruz.
 * İzin adları "accounting.<kaynak>.<eylem>" kalıbını izliyor, böylece
 * CheckPermission middleware'i olduğu gibi çalışıyor.
 */
return [

    // ─── İzinler ─────────────────────────────────────────────────────
    'permissions' => [
        // Hesap planı ve kurulum
        'accounting.chart.view'        => 'Hesap planını görüntüle',
        'accounting.chart.manage'      => 'Hesap planını düzenle',
        'accounting.setup.manage'      => 'Muhasebe kurulumunu yönet',

        // Dönem
        'accounting.period.view'       => 'Dönemleri görüntüle',
        'accounting.period.close'      => 'Dönem kapat',
        'accounting.period.reopen'     => 'Kapalı dönemi yeniden aç',

        // Fiş
        'accounting.journal.view'      => 'Fişleri görüntüle',
        'accounting.journal.create'    => 'Fiş oluştur',
        'accounting.journal.approve'   => 'Fiş onayla',
        'accounting.journal.post'      => 'Fişi deftere işle',
        'accounting.journal.reverse'   => 'Ters kayıt oluştur',

        // Belge
        'accounting.document.view'     => 'Belgeleri görüntüle',
        'accounting.document.create'   => 'Belge oluştur',
        'accounting.document.issue'    => 'Belge kes (numara ver)',
        'accounting.document.post'     => 'Belgeyi deftere işle',
        'accounting.document.correct'  => 'İade / düzeltme belgesi düzenle',

        // Cari
        'accounting.partner.view'      => 'Carileri görüntüle',
        'accounting.partner.manage'    => 'Cari kartı oluştur / düzenle',
        'accounting.partner.offset'    => 'Cari mahsup yap',

        // Banka ve kasa
        'accounting.bank.view'         => 'Banka ve kasayı görüntüle',
        'accounting.bank.manage'       => 'Banka/kasa hesabı yönet',
        'accounting.payment.create'    => 'Tahsilat / ödeme hazırla',
        'accounting.payment.approve'   => 'Ödeme onayla',
        'accounting.payment.post'      => 'Ödemeyi deftere işle',
        'accounting.statement.import'  => 'Banka ekstresi yükle',
        'accounting.statement.match'   => 'Ekstre eşleştirmesini onayla',
        'accounting.cash.count'        => 'Kasa sayımı yap',

        // Vergi
        'accounting.tax.view'          => 'Vergi kodlarını görüntüle',
        'accounting.tax.manage'        => 'Vergi kodu tanımla',
        'accounting.tax.approve'       => 'Vergi kodunu onayla',
        'accounting.vat.view'          => 'KDV defter ve beyanlarını görüntüle',
        'accounting.vat.prepare'       => 'KDV beyanı hazırla',
        'accounting.vat.submit'        => 'KDV beyanı gönder',

        // Raporlar ve denetim
        'accounting.report.view'       => 'Muhasebe raporlarını görüntüle',
        'accounting.audit.view'        => 'Denetim kaydını görüntüle',

        // Depo köprüsü
        'accounting.inventory.view'    => 'Depo olay kuyruğunu görüntüle',
        'accounting.inventory.resolve' => 'Depo olay istisnasını çöz',
    ],

    /**
     * Rol şablonları (doküman §16'daki rol tablosu).
     *
     * Şablon; şirket kendi rollerini düzenleyebilir. level alanı mevcut
     * hiyerarşiyle uyumlu: 3 = departman müdürü, 4 = personel.
     */
    /**
     * Rol şablonları.
     *
     * Yalnız iki rol var: muhasebe personeli ve muhasebe müdürü. Kasa
     * operatörü, denetçi, finans yöneticisi gibi ara roller kaldırıldı —
     * izinler buradan sabitlenmiyor, şirket sahibi kendi yapısına göre
     * Şirket → Roller ekranından ayarlıyor. Bu şablonlar yalnız makul bir
     * başlangıç verir; is_system false olduğu için her ikisi de düzenlenebilir
     * ve istisnası olan şirket kendi rolünü ayrıca açar.
     */
    'role_templates' => [
        'accounting-staff' => [
            'display_name' => 'Muhasebe Personeli',
            'level'        => 4,
            'color'        => 'blue',
            'description'  => 'Günlük muhasebe işi: belge işler, fiş taslağı hazırlar, tahsilat alır, '
                . 'kasa sayar, mutabakat yapar. Onay ve dönem kapama yetkisi başlangıçta yok.',
            'permissions'  => [
                'accounting.chart.view', 'accounting.period.view',
                'accounting.journal.view', 'accounting.journal.create',
                'accounting.document.view', 'accounting.document.create', 'accounting.document.issue',
                'accounting.partner.view', 'accounting.partner.manage',
                'accounting.bank.view', 'accounting.payment.create',
                'accounting.cash.count', 'accounting.statement.import',
                'accounting.tax.view', 'accounting.vat.view',
                'accounting.report.view', 'accounting.inventory.view',
            ],
        ],

        'accounting-manager' => [
            'display_name' => 'Muhasebe Müdürü',
            'level'        => 3,
            'color'        => 'indigo',
            'description'  => 'Fiş, ödeme ve beyan onaylar; dönem kapatır, vergi kodu onaylar, '
                . 'tüm muhasebe ekranlarını görür.',
            'permissions'  => '*',   // muhasebe izinlerinin tamamı
        ],
    ],

    /**
     * Görev ayrılığı çakışmaları (doküman §16).
     *
     * "Aynı kişi tedarikçi oluşturma + ödeme hazırlama + ödeme onaylama
     * adımlarını tek başına yapamamalı."
     *
     * severity: blocking = işlem engellenir, warning = kaydedilir ve raporlanır.
     */
    'duty_conflicts' => [
        'PREPARE_APPROVE_PAYMENT' => [
            'label'       => 'Ödemeyi hazırlayan onaylıyor',
            'permissions' => ['accounting.payment.create', 'accounting.payment.approve'],
            'severity'    => 'blocking',
            'explanation' => 'Aynı kişi ödemeyi hem hazırlayıp hem onaylarsa kontrol ortadan kalkar.',
        ],
        'PARTNER_AND_PAYMENT' => [
            'label'       => 'Cari açan ödeme onaylıyor',
            'permissions' => ['accounting.partner.manage', 'accounting.payment.approve'],
            'severity'    => 'warning',
            'explanation' => 'Sahte tedarikçi açıp ödeme onaylama riski; ayrı kişilerde olmalı.',
        ],
        'PREPARE_APPROVE_JOURNAL' => [
            'label'       => 'Fişi hazırlayan onaylıyor',
            'permissions' => ['accounting.journal.create', 'accounting.journal.approve'],
            'severity'    => 'blocking',
            'explanation' => 'Fişin içeriğini yazan kişi onayını da veremez.',
        ],
        'POST_AND_CLOSE' => [
            'label'       => 'Fiş işleyen dönem kapatıyor',
            'permissions' => ['accounting.journal.post', 'accounting.period.close'],
            'severity'    => 'warning',
            'explanation' => 'Dönemi kapatan kişi kendi kayıtlarını denetlemiş olur.',
        ],
        'TAX_SELF_APPROVAL' => [
            'label'       => 'Vergi kodu tanımlayan onaylıyor',
            'permissions' => ['accounting.tax.manage', 'accounting.tax.approve'],
            'severity'    => 'warning',
            'explanation' => 'Oran ve kapsam kararı ikinci bir gözden geçmeli.',
        ],
        'REOPEN_AND_POST' => [
            'label'       => 'Dönem açan fiş işliyor',
            'permissions' => ['accounting.period.reopen', 'accounting.journal.post'],
            'severity'    => 'blocking',
            'explanation' => 'Kapalı dönemi açıp kayıt girmek denetim izini anlamsızlaştırır.',
        ],
    ],

    /**
     * Varsayılan onay matrisi.
     *
     * Tutarlar şirketin defter para biriminde. Şirket kendi eşiklerini
     * tanımlayabilir; bunlar kurulum şablonu.
     */
    'approval_rules' => [
        ['action' => 'payment.post',      'min_amount' => 0,     'max_amount' => 1000,  'required_approvals' => 0],
        ['action' => 'payment.post',      'min_amount' => 1000,  'max_amount' => 10000, 'required_approvals' => 1,
         'required_permission' => 'accounting.payment.approve'],
        ['action' => 'payment.post',      'min_amount' => 10000, 'max_amount' => null,  'required_approvals' => 2,
         'required_permission' => 'accounting.payment.approve', 'note' => 'Yüksek tutarda çift imza'],

        ['action' => 'journal.post',      'min_amount' => 0,     'max_amount' => 50000, 'required_approvals' => 1,
         'required_permission' => 'accounting.journal.approve'],
        ['action' => 'journal.post',      'min_amount' => 50000, 'max_amount' => null,  'required_approvals' => 2,
         'required_permission' => 'accounting.journal.approve'],

        ['action' => 'period.close',      'min_amount' => 0,     'max_amount' => null,  'required_approvals' => 1,
         'required_permission' => 'accounting.period.close'],
        ['action' => 'vat_return.submit', 'min_amount' => 0,     'max_amount' => null,  'required_approvals' => 1,
         'required_permission' => 'accounting.vat.submit'],
    ],
];
