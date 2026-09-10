<?php

namespace App\Repositories;

use App\Models\Company;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class CompanyRepository extends BaseRepository
{
    public function __construct()
    {
        parent::__construct(new Company());
    }

    public function paginate(
        int $perPage = 15,
        array $with = [],
        array $filters = [],
        string $orderBy = 'created_at',
        string $orderDir = 'desc'
    ): LengthAwarePaginator {
        $query = $this->query()->with($with ?: ['owner']);

        if (!empty($filters['search'])) {
            $query->where(fn($q) => $q
                ->where('name', 'ilike', "%{$filters['search']}%")
                ->orWhere('email', 'ilike', "%{$filters['search']}%")
                ->orWhere('slug', 'ilike', "%{$filters['search']}%")
            );
        }

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (!empty($filters['plan_type'])) {
            $query->where('plan_type', $filters['plan_type']);
        }

        return $query->withCount(['users', 'departments'])
            ->orderBy($orderBy, $orderDir)
            ->paginate($perPage);
    }

    public function findBySlug(string $slug): ?Company
    {
        return $this->query()->where('slug', $slug)->first();
    }

    public function getStats(): array
    {
        return [
            'total'    => $this->query()->count(),
            'active'   => $this->query()->where('status', 'active')->count(),
            'inactive' => $this->query()->where('status', 'inactive')->count(),
            'suspended'=> $this->query()->where('status', 'suspended')->count(),
        ];
    }
}
