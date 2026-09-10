<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Company;
use App\Models\Modules\AccountingRecord;
use App\Models\Modules\ShippingRecord;
use App\Models\Modules\WarehouseRecord;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardService
{
    public function getSuperAdminStats(): array
    {
        return Cache::remember('super_admin_stats', now()->addMinutes(5), function () {
            $companiesQuery = Company::query();
            $usersQuery     = User::query();

            return [
                'companies' => [
                    'total'    => $companiesQuery->count(),
                    'active'   => $companiesQuery->where('status', 'active')->count(),
                    'new_this_month' => $companiesQuery
                        ->whereMonth('created_at', now()->month)
                        ->whereYear('created_at', now()->year)
                        ->count(),
                ],
                'users' => [
                    'total'  => $usersQuery->count(),
                    'active' => $usersQuery->where('status', 'active')->count(),
                    'online_today' => $usersQuery
                        ->whereDate('last_login_at', today())
                        ->count(),
                ],
                'modules' => \App\Models\Module::active()->count(),
                'activity_today' => ActivityLog::whereDate('created_at', today())->count(),
                'companies_by_plan' => Company::select('plan_type', DB::raw('count(*) as total'))
                    ->groupBy('plan_type')
                    ->pluck('total', 'plan_type'),
                'recent_companies' => Company::with('owner')
                    ->orderBy('created_at', 'desc')
                    ->limit(5)
                    ->get(['id', 'name', 'slug', 'status', 'plan_type', 'created_at', 'owner_id']),
            ];
        });
    }

    public function getCompanyStats(string $companyId): array
    {
        return Cache::remember("company_stats_{$companyId}", now()->addMinutes(3), function () use ($companyId) {
            $userCount       = User::where('company_id', $companyId)->count();
            $activeUserCount = User::where('company_id', $companyId)->where('status', 'active')->count();
            $deptCount       = \App\Models\Department::where('company_id', $companyId)->where('status', 'active')->count();

            // ── Accounting: this month P&L ──────────────────────────
            $incomeTypes  = ['income', 'invoice', 'receipt', 'receivable'];
            $expenseTypes = ['expense', 'payment', 'payable'];

            $monthlyIncome = AccountingRecord::where('company_id', $companyId)
                ->whereIn('type', $incomeTypes)
                ->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->sum('amount');

            $monthlyExpense = AccountingRecord::where('company_id', $companyId)
                ->whereIn('type', $expenseTypes)
                ->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->sum('amount');

            // ── Accounting: today P&L ───────────────────────────────
            $dailyIncome = AccountingRecord::where('company_id', $companyId)
                ->whereIn('type', $incomeTypes)
                ->whereDate('created_at', today())
                ->sum('amount');

            $dailyExpense = AccountingRecord::where('company_id', $companyId)
                ->whereIn('type', $expenseTypes)
                ->whereDate('created_at', today())
                ->sum('amount');

            // ── Accounting: last 6 months chart ────────────────────
            $monthlyChart = [];
            for ($i = 5; $i >= 0; $i--) {
                $date  = now()->subMonths($i);
                $month = $date->month;
                $year  = $date->year;

                $income  = AccountingRecord::where('company_id', $companyId)
                    ->whereIn('type', $incomeTypes)
                    ->whereMonth('created_at', $month)->whereYear('created_at', $year)
                    ->sum('amount');

                $expense = AccountingRecord::where('company_id', $companyId)
                    ->whereIn('type', $expenseTypes)
                    ->whereMonth('created_at', $month)->whereYear('created_at', $year)
                    ->sum('amount');

                $monthlyChart[] = [
                    'month'   => $date->format('M'),
                    'income'  => round((float) $income, 2),
                    'expense' => round((float) $expense, 2),
                    'profit'  => round((float) $income - (float) $expense, 2),
                ];
            }

            // ── Department budgets (marketing campaigns budget) ─────
            $deptBudgets = \App\Models\Modules\MarketingRecord::where('company_id', $companyId)
                ->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->whereNotNull('budget')
                ->selectRaw('SUM(budget) as total_budget, COUNT(*) as campaign_count')
                ->first();

            // ── Warehouse: monthly stock movements & budget ──────────
            $warehouseIn = WarehouseRecord::where('company_id', $companyId)
                ->where('type', 'stock_in')
                ->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->selectRaw('COALESCE(SUM(quantity), 0) as total_qty, COUNT(*) as record_count')
                ->first();

            $warehouseOut = WarehouseRecord::where('company_id', $companyId)
                ->where('type', 'stock_out')
                ->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->selectRaw('COALESCE(SUM(quantity), 0) as total_qty, COUNT(*) as record_count')
                ->first();

            $warehouseBudget = WarehouseRecord::where('company_id', $companyId)
                ->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->whereNotNull('budget')
                ->selectRaw('SUM(budget) as total_budget, COUNT(*) as record_count')
                ->first();

            // ── Pending by module ────────────────────────────────────
            $pending = [
                'Muhasebe'    => AccountingRecord::where('company_id', $companyId)->where('status', 'pending')->count(),
                'Depo'        => WarehouseRecord::where('company_id', $companyId)->where('status', 'pending')->count(),
                'Nakliye'     => ShippingRecord::where('company_id', $companyId)->where('status', 'pending')->count(),
                'Marketing'   => \App\Models\Modules\MarketingRecord::where('company_id', $companyId)->where('status', 'pending')->count(),
                'Paketleme'   => \App\Models\Modules\PackagingRecord::where('company_id', $companyId)->where('status', 'pending')->count(),
                'İade'        => \App\Models\Modules\ReturnRecord::where('company_id', $companyId)->where('status', 'pending')->count(),
                'Gümrükleme'  => \App\Models\Modules\CustomsRecord::where('company_id', $companyId)->whereIn('status', ['draft', 'submitted', 'in_review'])->count(),
            ];

            // ── Operations quick stats ───────────────────────────────
            $shippingInTransit = ShippingRecord::where('company_id', $companyId)->where('status', 'in_transit')->count();
            $shippingToday     = ShippingRecord::where('company_id', $companyId)->whereDate('created_at', today())->count();

            $returnsInProgress = \App\Models\Modules\ReturnRecord::where('company_id', $companyId)->where('status', 'in_progress')->count();
            $returnsTotal      = \App\Models\Modules\ReturnRecord::where('company_id', $companyId)->count();

            $packagingInProgress = \App\Models\Modules\PackagingRecord::where('company_id', $companyId)->whereIn('status', ['pending', 'in_progress'])->count();
            $packagingCompleted  = \App\Models\Modules\PackagingRecord::where('company_id', $companyId)->whereMonth('created_at', now()->month)->where('status', 'completed')->count();

            $customsInReview = \App\Models\Modules\CustomsRecord::where('company_id', $companyId)->whereIn('status', ['submitted', 'in_review'])->count();
            $customsTotal    = \App\Models\Modules\CustomsRecord::where('company_id', $companyId)->count();

            // ── Department user distribution ─────────────────────────
            $deptUsers = \App\Models\Department::where('company_id', $companyId)
                ->withCount('users')
                ->orderByDesc('users_count')
                ->limit(6)
                ->get(['id', 'name', 'color'])
                ->map(fn($d) => ['name' => $d->name, 'color' => $d->color, 'count' => $d->users_count]);

            return [
                'users' => ['total' => $userCount, 'active' => $activeUserCount],
                'departments' => $deptCount,
                'pending_tasks' => array_sum($pending),
                'pending_by_module' => $pending,
                'users_online_today' => User::where('company_id', $companyId)->whereDate('last_login_at', today())->count(),
                // Operations
                'shipping'   => ['pending' => $pending['Nakliye'], 'in_transit' => $shippingInTransit, 'today' => $shippingToday],
                'returns'    => ['pending' => $pending['İade'], 'in_progress' => $returnsInProgress, 'total' => $returnsTotal],
                'packaging'  => ['active' => $packagingInProgress, 'completed_month' => $packagingCompleted],
                'customs'    => ['in_review' => $customsInReview, 'total' => $customsTotal, 'pending' => $pending['Gümrükleme']],
                // Financial
                'finance' => [
                    'daily_income'    => round((float) $dailyIncome, 2),
                    'daily_expense'   => round((float) $dailyExpense, 2),
                    'daily_profit'    => round((float) $dailyIncome - (float) $dailyExpense, 2),
                    'monthly_income'  => round((float) $monthlyIncome, 2),
                    'monthly_expense' => round((float) $monthlyExpense, 2),
                    'monthly_profit'  => round((float) $monthlyIncome - (float) $monthlyExpense, 2),
                    'monthly_chart'   => $monthlyChart,
                ],
                // Marketing
                'marketing' => [
                    'monthly_budget'    => round((float) ($deptBudgets->total_budget ?? 0), 2),
                    'campaign_count'    => $deptBudgets->campaign_count ?? 0,
                ],
                // Warehouse stock movements
                'warehouse' => [
                    'stock_in_qty'    => round((float) ($warehouseIn->total_qty ?? 0), 2),
                    'stock_in_count'  => (int) ($warehouseIn->record_count ?? 0),
                    'stock_out_qty'   => round((float) ($warehouseOut->total_qty ?? 0), 2),
                    'stock_out_count' => (int) ($warehouseOut->record_count ?? 0),
                    'monthly_budget'  => round((float) ($warehouseBudget->total_budget ?? 0), 2),
                    'record_count'    => (int) ($warehouseBudget->record_count ?? 0),
                ],
                // Departments
                'dept_users' => $deptUsers,
            ];
        });
    }

    public function getModuleStats(string $companyId, string $module): array
    {
        $recordModel = $this->getRecordModel($module);
        if (!$recordModel) return [];

        $query = $recordModel::where('company_id', $companyId);

        $stats = [
            'total'       => $query->count(),
            'pending'     => (clone $query)->where('status', 'pending')->count(),
            'approved'    => (clone $query)->where('status', 'approved')->count(),
            'in_progress' => (clone $query)->where('status', 'in_progress')->count(),
            'completed'   => (clone $query)->where('status', 'completed')->count(),
            'cancelled'   => (clone $query)->where('status', 'cancelled')->count(),
            'this_month'  => (clone $query)
                ->whereMonth('created_at', now()->month)
                ->whereYear('created_at', now()->year)
                ->count(),
            'by_priority' => (clone $query)
                ->select('priority', DB::raw('count(*) as total'))
                ->groupBy('priority')
                ->pluck('total', 'priority'),
        ];

        if ($module === 'accounting') {
            $incomeTypes  = ['income', 'invoice', 'receipt', 'receivable'];
            $expenseTypes = ['expense', 'payment', 'payable'];
            $m = now()->month;
            $y = now()->year;

            $stats['total_income']  = round((float) (clone $query)->whereIn('type', $incomeTypes)->sum('amount'), 2);
            $stats['total_expense'] = round((float) (clone $query)->whereIn('type', $expenseTypes)->sum('amount'), 2);
            $stats['net_balance']   = round($stats['total_income'] - $stats['total_expense'], 2);
            $stats['total_vat']     = round((float) (clone $query)->sum('vat_amount'), 2);
            $stats['month_income']  = round((float) (clone $query)->whereIn('type', $incomeTypes)
                ->where(function ($q) use ($m, $y) {
                    $q->whereMonth('transaction_date', $m)->whereYear('transaction_date', $y);
                })->sum('amount'), 2);
            $stats['month_expense'] = round((float) (clone $query)->whereIn('type', $expenseTypes)
                ->where(function ($q) use ($m, $y) {
                    $q->whereMonth('transaction_date', $m)->whereYear('transaction_date', $y);
                })->sum('amount'), 2);
            $stats['draft']         = (clone $query)->where('status', 'draft')->count();
        }

        return $stats;
    }

    private function getRecordModel(string $module): ?string
    {
        return match($module) {
            'accounting'        => AccountingRecord::class,
            'warehouse'         => WarehouseRecord::class,
            'warehouse_control' => \App\Models\Modules\WarehouseRecord::class,
            'packaging'         => \App\Models\Modules\PackagingRecord::class,
            'returns'           => \App\Models\Modules\ReturnRecord::class,
            'customs'           => \App\Models\Modules\CustomsRecord::class,
            'shipping'          => ShippingRecord::class,
            'marketing'         => \App\Models\Modules\MarketingRecord::class,
            default             => null,
        };
    }
}
