<?php

namespace App\Repositories;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

abstract class BaseRepository
{
    public function __construct(protected Model $model) {}

    public function query(): Builder
    {
        return $this->model->newQuery();
    }

    public function all(array $columns = ['*']): Collection
    {
        return $this->query()->get($columns);
    }

    public function findById(string $id, array $with = []): ?Model
    {
        return $this->query()->with($with)->find($id);
    }

    public function findOrFail(string $id, array $with = []): Model
    {
        return $this->query()->with($with)->findOrFail($id);
    }

    public function findBy(string $field, mixed $value, array $with = []): ?Model
    {
        return $this->query()->with($with)->where($field, $value)->first();
    }

    public function findManyBy(string $field, mixed $value, array $with = []): Collection
    {
        return $this->query()->with($with)->where($field, $value)->get();
    }

    public function create(array $data): Model
    {
        return $this->query()->create($data);
    }

    public function update(Model $model, array $data): Model
    {
        $model->update($data);
        return $model->fresh();
    }

    public function delete(Model $model): bool
    {
        return (bool) $model->delete();
    }

    public function forceDelete(Model $model): bool
    {
        return (bool) $model->forceDelete();
    }

    public function paginate(
        int $perPage = 15,
        array $with = [],
        array $filters = [],
        string $orderBy = 'created_at',
        string $orderDir = 'desc'
    ): LengthAwarePaginator {
        $query = $this->query()->with($with);

        foreach ($filters as $field => $value) {
            if ($value !== null && $value !== '') {
                $query->where($field, $value);
            }
        }

        return $query->orderBy($orderBy, $orderDir)->paginate($perPage);
    }

    public function count(array $filters = []): int
    {
        $query = $this->query();
        foreach ($filters as $field => $value) {
            if ($value !== null) {
                $query->where($field, $value);
            }
        }
        return $query->count();
    }

    public function exists(array $conditions): bool
    {
        return $this->query()->where($conditions)->exists();
    }
}
