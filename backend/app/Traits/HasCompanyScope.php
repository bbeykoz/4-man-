<?php

namespace App\Traits;

use Illuminate\Database\Eloquent\Builder;

trait HasCompanyScope
{
    public function scopeForCompany(Builder $query, string $companyId): Builder
    {
        return $query->where($this->getTable() . '.company_id', $companyId);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where($this->getTable() . '.status', 'active');
    }
}
