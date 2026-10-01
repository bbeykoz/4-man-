<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Auth\TwoFactorController;
use App\Http\Controllers\Api\V1\Company\DepartmentController;
use App\Http\Controllers\Api\V1\Company\RoleController;
use App\Http\Controllers\Api\V1\Company\UserController;
use App\Http\Controllers\Api\V1\CopilotController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\Modules\AccountingController;
use App\Http\Controllers\Api\V1\Modules\CustomsController;
use App\Http\Controllers\Api\V1\Modules\MarketingController;
use App\Http\Controllers\Api\V1\Modules\PackagingController;
use App\Http\Controllers\Api\V1\Modules\ReturnController;
use App\Http\Controllers\Api\V1\Modules\ShippingController;
use App\Http\Controllers\Api\V1\Modules\PurchaseOrderController;
use App\Http\Controllers\Api\V1\Modules\StockAnomalyController;
use App\Http\Controllers\Api\V1\Modules\StockController;
use App\Http\Controllers\Api\V1\Modules\SupplierController;
use App\Http\Controllers\Api\V1\Modules\WarehouseController;
use App\Http\Controllers\Api\V1\Modules\WarehouseProductController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\MessageController;
use App\Http\Controllers\Api\V1\ActivityLogController;
use App\Http\Controllers\Api\V1\SettingsController;
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
Route::middleware(['auth:sanctum', 'company.access', 'log.api'])->group(function () {

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
    $moduleRoutes = function (string $controller) {
        Route::get('/',              [$controller, 'index']);
        Route::post('/',             [$controller, 'store']);
        Route::get('{id}',           [$controller, 'show']);
        Route::put('{id}',           [$controller, 'update']);
        Route::delete('{id}',        [$controller, 'destroy']);
        Route::patch('{id}/status',  [$controller, 'updateStatus']);
        Route::get('{id}/comments',  [$controller, 'comments']);
        Route::post('{id}/comments', [$controller, 'addComment']);
        Route::post('{id}/attachments', [$controller, 'addAttachment']);
        Route::get('{id}/history',   [$controller, 'history']);
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
            Route::post('{id}/quality-check',      [WarehouseController::class, 'qualityCheck']);
            Route::get('{id}/quality-check/photo', [WarehouseController::class, 'qualityCheckPhoto']);
            Route::post('{id}/signature',          [WarehouseController::class, 'storeSignature']);
            Route::get('{id}/signature',           [WarehouseController::class, 'signature']);
        };

        Route::prefix('warehouse')->middleware('module.enabled:warehouse')->group(function () use ($moduleRoutes, $qualityCheckRoutes) {
            $moduleRoutes(WarehouseController::class);
            $qualityCheckRoutes();
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
