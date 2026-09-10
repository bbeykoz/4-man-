<?php

return [
    'system' => [
        'super_admin' => [
            'companies.view', 'companies.create', 'companies.edit', 'companies.delete',
            'system.settings', 'system.modules', 'system.logs',
            'users.view', 'users.create', 'users.edit', 'users.delete',
        ],
        'company_owner' => [
            'company.settings', 'company.users.view', 'company.users.create',
            'company.users.edit', 'company.users.delete',
            'company.departments.view', 'company.departments.create',
            'company.departments.edit', 'company.departments.delete',
            'company.roles.view', 'company.roles.create',
            'company.roles.edit', 'company.roles.delete',
            'company.modules.manage',
            'company.reports.view', 'company.reports.export',
        ],
        'department_manager' => [
            'department.users.view', 'department.users.edit',
            'department.reports.view',
        ],
    ],

    'role_levels' => [
        'super_admin'        => 1,
        'company_owner'      => 2,
        'department_manager' => 3,
        'staff'              => 4,
        'viewer'             => 5,
    ],

    'actions' => ['view', 'create', 'edit', 'delete', 'export', 'approve'],
];
