<?php

namespace App\Repositories;

use App\Models\ActivityLog;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class ActivityLogRepository extends BaseRepository
{
    public function __construct()
    {
        parent::__construct(new ActivityLog());
    }

    public function paginate(
        int $perPage = 15,
        array $with = [],
        array $filters = [],
        string $orderBy = 'created_at',
        string $orderDir = 'desc'
    ): LengthAwarePaginator {
        $query = $this->query()->with(['user']);

        if (!empty($filters['company_id'])) {
            $query->where('company_id', $filters['company_id']);
        }

        if (!empty($filters['user_id'])) {
            $query->where('user_id', $filters['user_id']);
        }

        if (!empty($filters['action'])) {
            $likeOp = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
            $query->where('action', $likeOp, "%{$filters['action']}%");
        }

        if (!empty($filters['model_type'])) {
            $query->where('model_type', $filters['model_type']);
        }

        if (!empty($filters['date_from'])) {
            $query->where('created_at', '>=', $filters['date_from']);
        }

        if (!empty($filters['date_to'])) {
            $query->where('created_at', '<=', $filters['date_to'] . ' 23:59:59');
        }

        return $query->orderBy($orderBy, $orderDir)->paginate($perPage);
    }

    public function getRecentForCompany(string $companyId, int $limit = 20): \Illuminate\Database\Eloquent\Collection
    {
        return $this->query()
            ->where('company_id', $companyId)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->get();
    }
}
