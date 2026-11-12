<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Auth\TwoFactorController;
use App\Http\Controllers\Api\V1\Company\DepartmentController;
use App\Http\Controllers\Api\V1\Company\RoleController;
use App\Http\Controllers\Api\V1\Company\UserController;
use App\Http\Controllers\Api\V1\CopilotController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\Accounting\AccountingPeriodController;
use App\Http\Controllers\Api\V1\Accounting\AccountingSetupController;
use App\Http\Controllers\Api\V1\Accounting\AuthorizationController;
use App\Http\Controllers\Api\V1\Accounting\BankingController;
use App\Http\Controllers\Api\V1\Accounting\ChartAccountController;
use App\Http\Controllers\Api\V1\Accounting\CurrencyController;
use App\Http\Controllers\Api\V1\Accounting\DocumentController;
use App\Http\Controllers\Api\V1\Accounting\InventoryBridgeController;
use App\Http\Controllers\Api\V1\Accounting\JournalEntryController;
use App\Http\Controllers\Api\V1\Accounting\LedgerReportController;
use App\Http\Controllers\Api\V1\Accounting\PartnerController;
use App\Http\Controllers\Api\V1\Accounting\TaxCodeController;
use App\Http\Controllers\Api\V1\Accounting\VatController;
use App\Http\Controllers\Api\V1\Modules\AccountingController;
use App\Http\Controllers\Api\V1\Modules\CustomsController;
use App\Http\Controllers\Api\V1\Modules\DailyCheckController;
use App\Http\Controllers\Api\V1\Modules\MarketingController;
use App\Http\Controllers\Api\V1\Modules\PackagingController;
use App\Http\Controllers\Api\V1\Modules\ReturnController;
use App\Http\Controllers\Api\V1\Modules\ShippingController;
use App\Http\Controllers\Api\V1\Modules\PurchaseOrderController;
use App\Http\Controllers\Api\V1\Modules\StockAnomalyController;
use App\Http\Controllers\Api\V1\Modules\StockController;
use App\Http\Controllers\Api\V1\Modules\StockReservationController;
use App\Http\Controllers\Api\V1\Modules\SupplierController;
use App\Http\Controllers\Api\V1\Modules\WarehouseController;
use App\Http\Controllers\Api\V1\Modules\WarehouseProductController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\MessageController;
use App\Http\Controllers\Api\V1\ActivityLogController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Controllers\Api\V1\SuperAdmin\PlatformAnalyticsController;
use App\Http\Controllers\Api\V1\SuperAdmin\PlatformIncidentController;
use App\Http\Controllers\Api\V1\SuperAdmin\CompanyAccessController;
use App\Http\Controllers\Api\V1\SuperAdmin\CompanyController;
use App\Http\Controllers\Api\V1\SuperAdmin\PlatformRoleController;
use App\Http\Controllers\Api\V1\SuperAdmin\PlatformTeamController;
use App\Http\Controllers\Api\V1\SuperAdmin\GlobalUserController;
use App\Http\Controllers\Api\V1\SuperAdmin\ModuleController as SystemModuleController;
use App\Http\Controllers\Api\V1\Company\CompanyModuleController;
use App\Http\Controllers\Api\V1\Company\SettingsController as CompanySettingsController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\TicketController;
use App\Http\Controllers\Api\V1\SuperAdmin\TicketAdminController;
use App\Http\Controllers\Api\V1\MeetingController;
use App\Http\Controllers\Api\V1\ModuleStatusController;
use App\Http\Controllers\Api\V1\PublicLeadController;
use Illuminate\Support\Facades\Route;

// ──────────────────────────────────────────────────────────────────
// AUTH (public)
// ──────────────────────────────────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::post('login',              [AuthController::class,    'login'])->middleware('throttle:10,1');
    Route::post('2fa/verify',         [AuthController::class,    'verify2FA'])->middleware('throttle:10,1');
    Route::post('forgot-password',    [AuthController::class,    'forgotPassword'])->middleware('throttle:5,1');
    Route::post('reset-password',     [AuthController::class,    'resetPassword'])->middleware('throttle:5,1');
    // Login-time 2FA setup (no auth token, protected by cache key)
    Route::post('2fa/setup-pending',  [TwoFactorController::class, 'setupPending'])->middleware('throttle:10,1');
    Route::post('2fa/setup-complete', [TwoFactorController::class, 'completePendingSetup'])->middleware('throttle:10,1');
});

// ──────────────────────────────────────────────────────────────────
// PUBLIC — tanıtım sayfası formları
// ──────────────────────────────────────────────────────────────────
Route::post('public/leads', [PublicLeadController::class, 'store'])->middleware('throttle:5,1');

// ──────────────────────────────────────────────────────────────────
// PROTECTED
// ──────────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'incident.record', 'company.access', 'log.api'])->group(function () {

    // ── Auth / Sessions ─────────────────────────────────────────
    Route::prefix('auth')->group(function () {
        Route::get('me',              [AuthController::class, 'me']);
        Route::post('logout',         [AuthController::class, 'logout']);
        Route::post('logout-all',     [AuthController::class, 'logoutAll']);
        Route::get('sessions',        [AuthController::class, 'sessions']);
        Route::delete('sessions/{id}',[AuthController::class, 'revokeSession']);

        // 2FA management (authenticated)
        Route::get('2fa/setup',   [TwoFactorController::class, 'setup']);
        Route::post('2fa/enable', [TwoFactorController::class, 'enable']);
        Route::post('2fa/disable',[TwoFactorController::class, 'disable']);
    });

    // ── Profile ─────────────────────────────────────────────────
    Route::prefix('profile')->group(function () {
        Route::get('/',                 [ProfileController::class, 'show']);
        Route::put('/',                 [ProfileController::class, 'update']);
        Route::put('password',          [ProfileController::class, 'updatePassword']);
        Route::post('avatar',           [ProfileController::class, 'updateAvatar']);
    });

    // ── Dashboard ───────────────────────────────────────────────
    Route::prefix('dashboard')->group(function () {
        Route::get('super-admin',     [DashboardController::class, 'superAdmin']);
        Route::get('company',         [DashboardController::class, 'company']);
        Route::get('activity',        [DashboardController::class, 'recentActivity']);
        Route::get('module/{module}', [DashboardController::class, 'module']);
    });

    // ── Notifications ───────────────────────────────────────────
    Route::prefix('notifications')->group(function () {
        Route::get('/',               [NotificationController::class, 'index']);
        Route::get('unread-count',    [NotificationController::class, 'unreadCount']);
        Route::patch('{id}/read',     [NotificationController::class, 'markRead']);
        Route::post('mark-all-read',  [NotificationController::class, 'markAllRead']);
        Route::delete('{id}',         [NotificationController::class, 'destroy']);
    });

    // ── Messages ────────────────────────────────────────────────
    Route::prefix('messages')->group(function () {
        Route::get('unread-count',                                    [MessageController::class, 'unreadCount']);
        Route::get('users',                                           [MessageController::class, 'searchUsers']);
        Route::get('conversations',                                   [MessageController::class, 'conversations']);
        Route::post('conversations',                                  [MessageController::class, 'findOrCreate']);
        Route::get('conversations/{id}',                              [MessageController::class, 'messages']);
        Route::post('conversations/{id}',                             [MessageController::class, 'send']);
        Route::post('conversations/{id}/read',                        [MessageController::class, 'markRead']);
        Route::delete('conversations/{id}/messages/{messageId}',      [MessageController::class, 'destroyMessage']);
    });

    // ── Tickets ─────────────────────────────────────────────────
    Route::prefix('tickets')->group(function () {
        Route::get('/',       [TicketController::class, 'index']);
        Route::post('/',      [TicketController::class, 'store']);
        Route::get('{id}',    [TicketController::class, 'show']);
    });

    Route::prefix('meetings')->group(function () {
        Route::get('/',        [MeetingController::class, 'index']);
        Route::post('/',       [MeetingController::class, 'store']);
        Route::get('{id}',     [MeetingController::class, 'show']);
        Route::delete('{id}',  [MeetingController::class, 'destroy']);
    });

    // ── AI Copilot (altyapı; sağlayıcı config/copilot.php) ─────
    Route::prefix('copilot')->group(function () {
        Route::get('status',                  [CopilotController::class, 'status']);
        Route::get('conversations',           [CopilotController::class, 'conversations']);
        Route::get('conversations/{id}',      [CopilotController::class, 'show']);
        Route::delete('conversations/{id}',   [CopilotController::class, 'destroy']);
        Route::post('messages',               [CopilotController::class, 'send'])->middleware('throttle:20,1');
    });

    // ── Activity Logs ───────────────────────────────────────────
    Route::get('activity-logs', [ActivityLogController::class, 'index']);

    // ── Settings ────────────────────────────────────────────────
    Route::get('settings',    [SettingsController::class, 'index']);
    Route::put('settings',    [SettingsController::class, 'update']);

    // ──────────────────────────────────────────────────────────────
    // SUPER ADMIN
    // ──────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────
    // PLATFORM (hizmeti veren taraf). Her uç kendi iznine bağlıdır;
    // süper admin izin kontrolünü atladığı için hepsine erişir.
    // ──────────────────────────────────────────────────────────────
    Route::prefix('admin')->group(function () {
        // Şirketler
        Route::get('companies',                [CompanyController::class, 'index'])->middleware('permission:platform.companies.view,system.settings');
        Route::get('companies/stats',          [CompanyController::class, 'stats'])->middleware('permission:platform.companies.view,system.settings');
        Route::get('companies/{id}',           [CompanyController::class, 'show'])->middleware('permission:platform.companies.view,system.settings');
        Route::get('companies/{id}/departments', [CompanyController::class, 'departments'])->middleware('permission:platform.companies.view,system.settings');
        Route::get('companies/{id}/roles',     [CompanyController::class, 'roles'])->middleware('permission:platform.companies.view,system.settings');
        Route::post('companies',               [CompanyController::class, 'store'])->middleware('permission:platform.companies.create,system.settings');
        Route::put('companies/{id}',           [CompanyController::class, 'update'])->middleware('permission:platform.companies.edit,system.settings');
        Route::patch('companies/{id}',         [CompanyController::class, 'update'])->middleware('permission:platform.companies.edit,system.settings');
        Route::delete('companies/{id}',        [CompanyController::class, 'destroy'])->middleware('permission:platform.companies.delete,system.settings');
        Route::post('companies/{id}/suspend',  [CompanyController::class, 'suspend'])->middleware('permission:platform.companies.suspend,system.settings');
        Route::post('companies/{id}/activate', [CompanyController::class, 'activate'])->middleware('permission:platform.companies.suspend,system.settings');

        // Şirket içi görünüm ve şirkete bağlanma
        Route::get('companies/{id}/overview',  [CompanyAccessController::class, 'overview'])->middleware('permission:platform.companies.view,system.settings');
        Route::get('companies/{id}/users',     [CompanyAccessController::class, 'users'])->middleware('permission:platform.companies.view,system.settings');
        Route::get('companies/{id}/activity',  [CompanyAccessController::class, 'activity'])->middleware('permission:platform.companies.view,system.settings');
        Route::get('companies/{id}/conversations', [CompanyAccessController::class, 'conversations'])->middleware('permission:platform.companies.messages,system.settings');
        Route::get('companies/{id}/conversations/{conversationId}', [CompanyAccessController::class, 'messages'])->middleware('permission:platform.companies.messages,system.settings');
        Route::post('companies/{id}/impersonate', [CompanyAccessController::class, 'impersonate'])->middleware('permission:platform.companies.impersonate,system.settings');

        // Platform ekibi ve rolleri
        Route::get('team',                [PlatformTeamController::class, 'index'])->middleware('permission:platform.team.view,platform.team.manage,system.settings');
        Route::post('team',               [PlatformTeamController::class, 'store'])->middleware('permission:platform.team.manage,system.settings');
        Route::patch('team/{id}',         [PlatformTeamController::class, 'update'])->middleware('permission:platform.team.manage,system.settings');
        Route::delete('team/{id}',        [PlatformTeamController::class, 'destroy'])->middleware('permission:platform.team.manage,system.settings');

        Route::get('platform-roles',              [PlatformRoleController::class, 'index'])->middleware('permission:platform.team.view,platform.roles.manage,system.settings');
        Route::get('platform-roles/permissions',  [PlatformRoleController::class, 'permissions'])->middleware('permission:platform.roles.manage,system.settings');
        Route::post('platform-roles',             [PlatformRoleController::class, 'store'])->middleware('permission:platform.roles.manage,system.settings');
        Route::patch('platform-roles/{id}',       [PlatformRoleController::class, 'update'])->middleware('permission:platform.roles.manage,system.settings');
        Route::delete('platform-roles/{id}',      [PlatformRoleController::class, 'destroy'])->middleware('permission:platform.roles.manage,system.settings');

        // Kullanıcılar (tüm şirketler)
        Route::get('users',              [GlobalUserController::class, 'index'])->middleware('permission:platform.users.view,system.settings');
        Route::get('users/by-company',   [GlobalUserController::class, 'byCompany'])->middleware('permission:platform.users.view,system.settings');
        Route::get('users/{id}',         [GlobalUserController::class, 'show'])->middleware('permission:platform.users.view,system.settings');
        Route::post('users',             [GlobalUserController::class, 'store'])->middleware('permission:platform.users.manage,system.settings');
        Route::patch('users/{id}',       [GlobalUserController::class, 'update'])->middleware('permission:platform.users.manage,system.settings');
        Route::post('users/{id}/impersonate',  [GlobalUserController::class, 'impersonate'])->middleware('permission:platform.companies.impersonate,system.settings');
        Route::post('users/{id}/suspend',      [GlobalUserController::class, 'suspend'])->middleware('permission:platform.users.manage,system.settings');
        Route::post('users/{id}/activate',     [GlobalUserController::class, 'activate'])->middleware('permission:platform.users.manage,system.settings');
        Route::post('users/{id}/enable-2fa',   [GlobalUserController::class, 'enable2FA'])->middleware('permission:platform.users.manage,system.settings');
        Route::post('users/{id}/disable-2fa',  [GlobalUserController::class, 'disable2FA'])->middleware('permission:platform.users.manage,system.settings');
        Route::post('users/{id}/reset-2fa',    [GlobalUserController::class, 'reset2FA'])->middleware('permission:platform.users.manage,system.settings');
        Route::delete('users/{id}',            [GlobalUserController::class, 'destroy'])->middleware('permission:platform.users.manage,system.settings');

        Route::get('logs',               [ActivityLogController::class, 'globalIndex'])->middleware('permission:platform.logs.view,system.logs,system.settings');

        // Panel raporları: kendi ekibimiz ve kiracı şirketlerin işlem hacmi.
        Route::prefix('analytics')->middleware('permission:platform.logs.view,system.logs,system.settings')->group(function () {
            Route::get('staff',           [PlatformAnalyticsController::class, 'staff']);
            Route::get('staff/{id}',      [PlatformAnalyticsController::class, 'staffDetail'])->where('id', '[0-9a-fA-F-]{36}');
            Route::get('companies',       [PlatformAnalyticsController::class, 'companies']);
        });

        // Kiracı şirketlerde oluşan hatalar. Yalnız platform tarafında okunur;
        // şirket uçlarında bu kayıtları döndüren bir rota yok.
        Route::prefix('incidents')->middleware('permission:platform.logs.view,system.logs,system.settings')->group(function () {
            Route::get('/',       [PlatformIncidentController::class, 'index']);
            Route::post('/',      [PlatformIncidentController::class, 'store']);
            Route::get('{id}',    [PlatformIncidentController::class, 'show'])->where('id', '[0-9a-fA-F-]{36}');
            Route::patch('{id}',  [PlatformIncidentController::class, 'update'])->where('id', '[0-9a-fA-F-]{36}');
            Route::delete('{id}', [PlatformIncidentController::class, 'destroy'])->where('id', '[0-9a-fA-F-]{36}');
        });
        Route::post('notifications/broadcast', [NotificationController::class, 'broadcast'])->middleware('permission:platform.notifications.send,system.settings');

        // Destek talepleri
        Route::get('tickets',            [TicketAdminController::class, 'index'])->middleware('permission:platform.tickets.view,system.settings');
        Route::get('tickets/counts',     [TicketAdminController::class, 'counts'])->middleware('permission:platform.tickets.view,system.settings');
        Route::get('tickets/{id}',       [TicketAdminController::class, 'show'])->middleware('permission:platform.tickets.view,system.settings');
        Route::patch('tickets/{id}',     [TicketAdminController::class, 'update'])->middleware('permission:platform.tickets.manage,system.settings');

        // Departman modülleri
        Route::get('modules',            [SystemModuleController::class, 'index'])->middleware('permission:platform.modules.manage,system.modules,system.settings');
        Route::post('modules',           [SystemModuleController::class, 'store'])->middleware('permission:platform.modules.manage,system.settings');
        Route::patch('modules/{id}',     [SystemModuleController::class, 'update'])->middleware('permission:platform.modules.manage,system.settings');
    });

    // ──────────────────────────────────────────────────────────────
    // COMPANY
    // ──────────────────────────────────────────────────────────────
    Route::prefix('company')->group(function () {
        Route::apiResource('users',       UserController::class);
        Route::post('users/{id}/activate',   [UserController::class, 'activate']);
        Route::post('users/{id}/deactivate', [UserController::class, 'deactivate']);

        Route::get('departments/list',  [DepartmentController::class, 'list']);
        Route::apiResource('departments', DepartmentController::class);

        Route::get('roles/permissions',   [RoleController::class, 'permissions']);
        Route::apiResource('roles',       RoleController::class);

        Route::get('modules',            [CompanyModuleController::class, 'index']);
        Route::patch('modules/{id}',     [CompanyModuleController::class, 'update']);

        Route::get('settings',           [CompanySettingsController::class, 'index']);
        Route::put('settings',           [CompanySettingsController::class, 'update']);
    });

    // ──────────────────────────────────────────────────────────────
    // MODULES  (ortak pattern: BaseModuleController)
    // ──────────────────────────────────────────────────────────────
    // Tüm modül kayıtlarının kimliği UUID. Desen kısıtı olmadan
    // /modules/accounting/chart-accounts gibi bir alt yol {id} ile eşleşip
    // veritabanına "chart-accounts" kimliğiyle gidiyor ve 500 dönüyor.
    $uuid = '[0-9a-fA-F-]{36}';

    $moduleRoutes = function (string $controller) use ($uuid) {
        Route::get('/',              [$controller, 'index']);
        Route::post('/',             [$controller, 'store']);
        Route::get('{id}',           [$controller, 'show'])->where('id', $uuid);
        Route::put('{id}',           [$controller, 'update'])->where('id', $uuid);
        Route::delete('{id}',        [$controller, 'destroy'])->where('id', $uuid);
        Route::patch('{id}/status',  [$controller, 'updateStatus'])->where('id', $uuid);
        Route::get('{id}/comments',  [$controller, 'comments'])->where('id', $uuid);
        Route::post('{id}/comments', [$controller, 'addComment'])->where('id', $uuid);
        Route::post('{id}/attachments', [$controller, 'addAttachment'])->where('id', $uuid);
        Route::get('{id}/history',   [$controller, 'history'])->where('id', $uuid);
    };

    Route::prefix('modules')->group(function () use ($moduleRoutes) {
        Route::get('status', ModuleStatusController::class);

        Route::prefix('accounting')->middleware('module.enabled:accounting')->group(function () use ($moduleRoutes) {
            $moduleRoutes(AccountingController::class);
            Route::post('import',            [AccountingController::class, 'import']);
            Route::get('template/download',  [AccountingController::class, 'downloadTemplate']);
        });

        Route::prefix('marketing')->middleware('module.enabled:marketing')
            ->group(fn() => $moduleRoutes(MarketingController::class));

        // Kalite kontrol: sonradan onay + görsel (depo müdürü ve depo kontrolcüsü)
        $qualityCheckRoutes = function () {
            // Imza ekraninin personel listesi; iki depo modulunde de ayni.
            Route::get('signers',                  [WarehouseController::class, 'signers']);
            Route::post('{id}/quality-check',      [WarehouseController::class, 'qualityCheck']);
            Route::get('{id}/quality-check/photo', [WarehouseController::class, 'qualityCheckPhoto']);
            Route::post('{id}/signature',          [WarehouseController::class, 'storeSignature']);
            Route::get('{id}/signature',           [WarehouseController::class, 'signature']);
        };

        Route::prefix('warehouse')->middleware('module.enabled:warehouse')->group(function () use ($moduleRoutes, $qualityCheckRoutes) {
            $moduleRoutes(WarehouseController::class);
            $qualityCheckRoutes();
            Route::get('summary',           [WarehouseController::class, 'summary']);
            Route::post('import',           [WarehouseController::class, 'import']);
            Route::get('template/download', [WarehouseController::class, 'downloadTemplate']);
        });

        Route::prefix('warehouse-control')->middleware('module.enabled:warehouse_control')->group(function () use ($moduleRoutes, $qualityCheckRoutes) {
            $moduleRoutes(WarehouseController::class);
            $qualityCheckRoutes();
        });

        // Stok defteri: depo tanımları ve bakiyeler (depo müdürü + depo kontrolcüsü)
        Route::prefix('stock')->middleware('module.enabled:warehouse,warehouse_control')->group(function () {
            Route::get('warehouses',         [StockController::class, 'warehouses']);
            Route::post('warehouses',        [StockController::class, 'storeWarehouse']);
            Route::put('warehouses/{id}',    [StockController::class, 'updateWarehouse']);
            Route::delete('warehouses/{id}', [StockController::class, 'destroyWarehouse']);
            Route::get('balances',           [StockController::class, 'balances']);
            Route::get('products/{id}',      [StockController::class, 'product']);
            Route::get('risk',               [StockController::class, 'risk']);
            Route::get('risk/trend',         [StockController::class, 'riskTrend']);
            Route::get('expiry',             [StockController::class, 'expiry']);
            Route::post('expiry/actions',    [StockController::class, 'expiryAction']);
            Route::get('dead-stock',         [StockController::class, 'deadStock']);
            Route::post('dead-stock/reorder-block', [StockController::class, 'blockReorder']);
            Route::get('transfers/suggestions',     [StockController::class, 'transferSuggestions']);
            Route::post('transfers/orders',         [StockController::class, 'createTransfers']);
            Route::get('anomalies',                 [StockAnomalyController::class, 'index']);
            Route::post('anomalies/scan',           [StockAnomalyController::class, 'scan']);
            Route::patch('anomalies/{id}',          [StockAnomalyController::class, 'review']);
            Route::post('what-if',                  [StockController::class, 'whatIf']);
            Route::get('what-if/options',           [StockController::class, 'whatIfOptions']);
            Route::get('kpis',                      [StockController::class, 'kpis']);
            Route::get('abc-xyz',                   [StockController::class, 'abcXyz']);
            Route::post('abc-xyz/apply-safety',     [StockController::class, 'applySafetyStock']);
            Route::get('reports/overview',          [StockController::class, 'reportOverview']);
            Route::get('reports/export',            [StockController::class, 'reportExport']);

            // Ana sayfa özeti: depo bölümlerinin tek istekte toplanmış hâli
            Route::get('summary',                   [StockController::class, 'summary']);

            // Workstation raporu: bölüm / personel / depo bazında iş hacmi
            Route::get('workstation',               [StockController::class, 'workstation']);

            // Booked: siparişe ayrılan stok
            Route::get('reservations',                   [StockReservationController::class, 'index']);
            Route::post('reservations/{id}/deliver',     [StockReservationController::class, 'deliver']);
            Route::post('reservations/{id}/cancel',      [StockReservationController::class, 'cancel']);
            Route::post('reservations/{id}/top-up',      [StockReservationController::class, 'topUp']);
        });

        // Satın alma: tedarikçiler, siparişler, otomatik öneriler
        Route::prefix('purchasing')->middleware('module.enabled:warehouse,warehouse_control')->group(function () {
            Route::get('suppliers',            [SupplierController::class, 'index']);
            Route::post('suppliers',           [SupplierController::class, 'store']);
            Route::put('suppliers/{id}',       [SupplierController::class, 'update']);
            Route::delete('suppliers/{id}',    [SupplierController::class, 'destroy']);
            Route::get('performance',          [SupplierController::class, 'performance']);
            Route::post('suppliers/{id}/apply-lead-time', [SupplierController::class, 'applyActualLeadTime']);

            Route::get('suggestions',          [PurchaseOrderController::class, 'suggestions']);
            Route::post('suggestions/orders',  [PurchaseOrderController::class, 'fromSuggestions']);

            Route::get('orders',               [PurchaseOrderController::class, 'index']);
            Route::post('orders',              [PurchaseOrderController::class, 'store']);
            Route::get('orders/{id}',          [PurchaseOrderController::class, 'show']);
            Route::put('orders/{id}',          [PurchaseOrderController::class, 'update']);
            Route::post('orders/{id}/send',    [PurchaseOrderController::class, 'send']);
            Route::post('orders/{id}/cancel',  [PurchaseOrderController::class, 'cancel']);
            Route::post('orders/{id}/receive', [PurchaseOrderController::class, 'receive']);
            Route::get('orders/{id}/invoice-pdf', [PurchaseOrderController::class, 'invoicePdf']);
            Route::post('orders/{id}/items/{itemId}/receipt',   [PurchaseOrderController::class, 'uploadReceipt']);
            Route::get('orders/{id}/items/{itemId}/receipt',    [PurchaseOrderController::class, 'receiptFile']);
            Route::delete('orders/{id}/items/{itemId}/receipt', [PurchaseOrderController::class, 'deleteReceipt']);
        });

        // Ürün kataloğu (warehouse veya warehouse-control aktif olanlara açık)
        Route::prefix('warehouse-products')->middleware('module.enabled:warehouse,warehouse_control')->group(function () {
            Route::get('search',     [WarehouseProductController::class, 'search']);
            Route::get('stats',      [WarehouseProductController::class, 'stats']);
            Route::get('/',          [WarehouseProductController::class, 'index']);
            Route::post('/',         [WarehouseProductController::class, 'store']);
            Route::get('{id}',       [WarehouseProductController::class, 'show']);
            Route::put('{id}',       [WarehouseProductController::class, 'update']);
            Route::delete('{id}',    [WarehouseProductController::class, 'destroy']);
        });

        // Günlük kontrol listesi (ürünler + genel görevler) — warehouse veya warehouse-control aktif olanlara açık
        Route::prefix('daily-check')->middleware('module.enabled:warehouse,warehouse_control')->group(function () {
            Route::get('/',                   [DailyCheckController::class, 'index']);
            Route::post('products/{id}',      [DailyCheckController::class, 'checkProduct']);
            Route::post('tasks/{id}/check',    [DailyCheckController::class, 'checkTask']);
            Route::post('tasks',              [DailyCheckController::class, 'storeTask']);
            Route::put('tasks/{id}',          [DailyCheckController::class, 'updateTask']);
            Route::delete('tasks/{id}',       [DailyCheckController::class, 'destroyTask']);
        });

        // ─── Muhasebe: genel muhasebe çekirdeği ──────────────────────
        // Modül pasifken de süper admin erişebilir (module.enabled kuralı).
        Route::prefix('accounting')->middleware('module.enabled:accounting')->group(function () {

            Route::prefix('chart-accounts')->group(function () {
                Route::get('/',                   [ChartAccountController::class, 'index']);
                Route::get('tree',                [ChartAccountController::class, 'tree']);
                Route::post('install-template',   [ChartAccountController::class, 'installTemplate']);
                Route::post('/',                  [ChartAccountController::class, 'store']);
                Route::get('{id}',                [ChartAccountController::class, 'show']);
                Route::put('{id}',                [ChartAccountController::class, 'update']);
                Route::delete('{id}',             [ChartAccountController::class, 'destroy']);
                Route::post('{id}/deactivate',    [ChartAccountController::class, 'deactivate']);
            });

            Route::prefix('periods')->group(function () {
                Route::get('/',                   [AccountingPeriodController::class, 'index']);
                Route::post('generate',           [AccountingPeriodController::class, 'generate']);
                Route::get('{id}',                [AccountingPeriodController::class, 'show']);
                Route::post('{id}/start-closing', [AccountingPeriodController::class, 'startClosing']);
                Route::post('{id}/close',         [AccountingPeriodController::class, 'close']);
                Route::post('{id}/reopen',        [AccountingPeriodController::class, 'reopen']);
                Route::post('{id}/lock',          [AccountingPeriodController::class, 'lock']);
            });

            // Kurulum: hesap rolleri, numara serileri, tek adımda kurulum
            // Muhasebe özeti (müdür ekranı ve özet sekmesi)
            Route::get('dashboard', [AccountingSetupController::class, 'dashboard']);

            Route::prefix('setup')->group(function () {
                Route::get('status',     [AccountingSetupController::class, 'status']);
                Route::post('bootstrap', [AccountingSetupController::class, 'bootstrap']);
                Route::get('roles',      [AccountingSetupController::class, 'roleListing']);
                Route::post('roles',     [AccountingSetupController::class, 'setRole']);
                Route::get('series',     [AccountingSetupController::class, 'seriesIndex']);
                Route::post('series',    [AccountingSetupController::class, 'seriesStore']);
                Route::put('series/{id}',    [AccountingSetupController::class, 'seriesUpdate']);
                Route::delete('series/{id}', [AccountingSetupController::class, 'seriesDestroy']);
                Route::get('series/{id}/gap-check', [AccountingSetupController::class, 'seriesGapCheck']);
            });

            // Çoklu para: kur tablosu, çevrim, dönem sonu değerleme
            Route::prefix('currency')->group(function () {
                Route::get('overview',          [CurrencyController::class, 'overview']);
                Route::get('rates',             [CurrencyController::class, 'rates']);
                Route::post('rates',            [CurrencyController::class, 'storeRate']);
                Route::post('rates/install-fixed', [CurrencyController::class, 'installFixed']);
                Route::post('convert',          [CurrencyController::class, 'convert']);
                Route::get('revaluations',      [CurrencyController::class, 'revaluations']);
                Route::get('revaluations/preview', [CurrencyController::class, 'revaluationPreview']);
                Route::post('revaluations',     [CurrencyController::class, 'runRevaluation']);
                Route::post('revaluations/{id}/reverse', [CurrencyController::class, 'reverseRevaluation']);
            });

            // Yetkilendirme: roller, görev ayrılığı, onay matrisi
            Route::prefix('authorization')->group(function () {
                Route::get('roles',           [AuthorizationController::class, 'roles']);
                Route::post('roles/install',  [AuthorizationController::class, 'installRoles']);
                Route::get('duty-report',     [AuthorizationController::class, 'dutyReport']);
                Route::get('users/{userId}/conflicts',  [AuthorizationController::class, 'userConflicts']);
                Route::post('users/{userId}/preview-role', [AuthorizationController::class, 'previewRole']);
                Route::post('users/{userId}/exceptions',   [AuthorizationController::class, 'grantException']);
                Route::delete('exceptions/{id}', [AuthorizationController::class, 'revokeException']);
                Route::get('approval-matrix',    [AuthorizationController::class, 'matrix']);
                Route::post('approval-matrix/install', [AuthorizationController::class, 'installMatrix']);
                Route::post('approval-matrix',        [AuthorizationController::class, 'storeRule']);
                Route::put('approval-matrix/{id}',    [AuthorizationController::class, 'updateRule']);
                Route::delete('approval-matrix/{id}', [AuthorizationController::class, 'destroyRule']);
            });

            // KDV merkezi: defterler, VIES, beyan
            Route::prefix('vat')->group(function () {
                Route::get('overview',       [VatController::class, 'overview']);
                Route::get('sales-book',     [VatController::class, 'salesBook']);
                Route::get('purchase-book',  [VatController::class, 'purchaseBook']);
                Route::get('vies',           [VatController::class, 'vies']);
                Route::get('returns',        [VatController::class, 'returns']);
                Route::post('returns',       [VatController::class, 'prepare']);
                Route::get('returns/{id}',   [VatController::class, 'showReturn']);
                Route::post('returns/{id}/validate', [VatController::class, 'validateReturn']);
                Route::post('returns/{id}/submit',   [VatController::class, 'submit']);
                Route::post('returns/{id}/response', [VatController::class, 'markResponse']);
            });

            // Depo–muhasebe köprüsü: olay kuyruğu ve çift yönlü drill-down
            Route::prefix('inventory-bridge')->group(function () {
                Route::get('status',        [InventoryBridgeController::class, 'status']);
                Route::get('events',        [InventoryBridgeController::class, 'index']);
                Route::post('process',      [InventoryBridgeController::class, 'process']);
                Route::get('events/{id}',   [InventoryBridgeController::class, 'show']);
                Route::post('events/{id}/retry', [InventoryBridgeController::class, 'retry']);
                Route::get('by-record/{recordId}', [InventoryBridgeController::class, 'forWarehouseRecord']);
                Route::get('by-entry/{entryId}',   [InventoryBridgeController::class, 'forJournalEntry']);
            });

            // Banka, kasa, tahsilat/ödeme, ekstre ve mutabakat
            Route::prefix('banking')->group(function () {
                Route::get('accounts',             [BankingController::class, 'accounts']);
                Route::post('accounts',            [BankingController::class, 'storeAccount']);
                Route::put('accounts/{id}',        [BankingController::class, 'updateAccount']);
                Route::get('accounts/{id}/balance',[BankingController::class, 'accountBalance']);
                Route::get('accounts/{id}/reconcile', [BankingController::class, 'reconcile']);
                Route::get('accounts/{id}/cash-status', [BankingController::class, 'cashStatus']);
                Route::get('accounts/{id}/cash-counts', [BankingController::class, 'cashCounts']);
                Route::post('accounts/{id}/cash-counts', [BankingController::class, 'recordCashCount']);

                Route::get('payments',             [BankingController::class, 'payments']);
                Route::post('payments',            [BankingController::class, 'storePayment']);
                Route::get('payments/{id}',        [BankingController::class, 'showPayment']);
                Route::post('payments/{id}/allocate', [BankingController::class, 'allocatePayment']);
                Route::post('payments/{id}/submit',   [BankingController::class, 'submitPayment']);
                Route::post('payments/{id}/approve',  [BankingController::class, 'approvePayment']);
                Route::post('payments/{id}/post',     [BankingController::class, 'postPayment']);
                Route::post('payments/{id}/cancel',   [BankingController::class, 'cancelPayment']);

                Route::get('statements',           [BankingController::class, 'statements']);
                Route::post('statements/import',   [BankingController::class, 'importStatement']);
                Route::post('statements/{id}/suggest', [BankingController::class, 'suggestForStatement']);

                Route::get('transactions',                 [BankingController::class, 'transactions']);
                Route::get('transactions/{id}/suggestions',[BankingController::class, 'suggestMatches']);
                Route::post('transactions/{id}/match',     [BankingController::class, 'confirmMatch']);
                Route::post('transactions/{id}/ignore',    [BankingController::class, 'ignoreTransaction']);
                Route::post('transactions/{id}/unmatch',   [BankingController::class, 'unmatchTransaction']);
            });

            Route::prefix('partners')->group(function () {
                Route::get('/',                  [PartnerController::class, 'index']);
                Route::post('/',                 [PartnerController::class, 'store']);
                Route::get('ageing',             [PartnerController::class, 'ageing']);
                Route::get('{id}',               [PartnerController::class, 'show']);
                Route::put('{id}',               [PartnerController::class, 'update']);
                Route::delete('{id}',            [PartnerController::class, 'destroy']);
                Route::post('{id}/block',        [PartnerController::class, 'block']);
                Route::post('{id}/unblock',      [PartnerController::class, 'unblock']);
                Route::get('{id}/addresses',     [PartnerController::class, 'addresses']);
                Route::post('{id}/addresses',    [PartnerController::class, 'storeAddress']);
                Route::delete('{id}/addresses/{addressId}', [PartnerController::class, 'destroyAddress']);
                Route::get('{id}/statement',     [PartnerController::class, 'statement']);
                Route::get('{id}/open-items',    [PartnerController::class, 'openItems']);
                Route::get('{id}/credit-check',  [PartnerController::class, 'creditCheck']);
                Route::get('{id}/offset-proposal', [PartnerController::class, 'offsetProposal']);
                Route::post('{id}/offset',       [PartnerController::class, 'offset']);
            });

            Route::prefix('documents')->group(function () {
                Route::get('/',             [DocumentController::class, 'index']);
                Route::post('/',            [DocumentController::class, 'store']);
                Route::get('{id}',          [DocumentController::class, 'show']);
                Route::put('{id}',          [DocumentController::class, 'update']);
                Route::delete('{id}',       [DocumentController::class, 'destroy']);
                Route::post('{id}/issue',   [DocumentController::class, 'issue']);
                Route::post('{id}/post',    [DocumentController::class, 'post']);
                Route::post('{id}/cancel',  [DocumentController::class, 'cancel']);
                Route::post('{id}/correct', [DocumentController::class, 'correct']);
            });

            Route::prefix('tax-codes')->group(function () {
                Route::get('/',                 [TaxCodeController::class, 'index']);
                Route::post('/',                [TaxCodeController::class, 'store']);
                Route::post('install-template', [TaxCodeController::class, 'installTemplate']);
                Route::post('calculate',        [TaxCodeController::class, 'calculate']);
                Route::get('threshold',         [TaxCodeController::class, 'thresholdStatus']);
                Route::get('{id}',              [TaxCodeController::class, 'show']);
                Route::put('{id}',              [TaxCodeController::class, 'update']);
                Route::delete('{id}',           [TaxCodeController::class, 'destroy']);
                Route::post('{id}/approve',     [TaxCodeController::class, 'approve']);
                Route::post('{id}/change-rate', [TaxCodeController::class, 'changeRate']);
            });

            // Defter raporları — salt okunur
            Route::prefix('reports')->group(function () {
                Route::get('trial-balance',          [LedgerReportController::class, 'trialBalance']);
                Route::get('general-ledger',         [LedgerReportController::class, 'generalLedger']);
                Route::get('journal-book',           [LedgerReportController::class, 'journalBook']);
                Route::get('account-statement/{id}', [LedgerReportController::class, 'accountStatement']);
            });

            Route::prefix('journal-entries')->group(function () {
                Route::get('/',                   [JournalEntryController::class, 'index']);
                Route::post('/',                  [JournalEntryController::class, 'store']);
                Route::get('{id}',                [JournalEntryController::class, 'show']);
                Route::put('{id}',                [JournalEntryController::class, 'update']);
                Route::delete('{id}',             [JournalEntryController::class, 'destroy']);
                Route::post('{id}/check',         [JournalEntryController::class, 'check']);
                Route::post('{id}/validate',      [JournalEntryController::class, 'validateEntry']);
                Route::post('{id}/submit-approval', [JournalEntryController::class, 'submitApproval']);
                Route::post('{id}/approve',       [JournalEntryController::class, 'approve']);
                Route::post('{id}/return-draft',  [JournalEntryController::class, 'returnToDraft']);
                Route::post('{id}/post',          [JournalEntryController::class, 'post']);
                Route::post('{id}/reverse',       [JournalEntryController::class, 'reverse']);
                Route::post('{id}/cancel',        [JournalEntryController::class, 'cancel']);
            });
        });

        Route::prefix('packaging')->middleware('module.enabled:packaging')
            ->group(fn() => $moduleRoutes(PackagingController::class));

        Route::prefix('returns')->middleware('module.enabled:returns')
            ->group(fn() => $moduleRoutes(ReturnController::class));

        Route::prefix('customs')->middleware('module.enabled:customs')
            ->group(fn() => $moduleRoutes(CustomsController::class));

        Route::prefix('shipping')->middleware('module.enabled:shipping')
            ->group(fn() => $moduleRoutes(ShippingController::class));
    });
});
