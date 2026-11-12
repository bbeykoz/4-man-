<?php

/**
 * Depo rol şablonları.
 *
 * Muhasebedeki gibi iki rol: sorumlu ve müdür. Şablon yalnız makul bir
 * başlangıç verir — roller is_system değil, şirket sahibi izinleri kendi
 * yapısına göre Şirket → Roller ekranından değiştirir.
 */
return [
    'role_templates' => [
        'warehouse-staff' => [
            'display_name' => 'Depo Sorumlusu',
            'level'        => 4,
            'color'        => 'green',
            'description'  => 'Günlük depo işi: kayıt açar, düzenler, listeyi dışa aktarır. '
                . 'Onay ve silme yetkisi başlangıçta yok.',
            'permissions'  => [
                'warehouse.records.view', 'warehouse.records.create',
                'warehouse.records.edit', 'warehouse.records.export',
                'warehouse_control.records.view', 'warehouse_control.records.create',
                'warehouse_control.records.edit',
            ],
        ],

        'warehouse-manager' => [
            'display_name' => 'Depo Müdürü',
            'level'        => 3,
            'color'        => 'blue',
            'description'  => 'Kayıtları onaylar ve siler, stok kontrolünün tamamını görür.',
            'permissions'  => [
                'warehouse.records.view', 'warehouse.records.create',
                'warehouse.records.edit', 'warehouse.records.delete',
                'warehouse.records.export', 'warehouse.records.approve',
                'warehouse_control.records.view', 'warehouse_control.records.create',
                'warehouse_control.records.edit', 'warehouse_control.records.export',
            ],
        ],
    ],
];
