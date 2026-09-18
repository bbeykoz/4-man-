<?php

namespace App\Traits;

use App\Models\RecordAttachment;
use App\Models\RecordComment;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

trait HasRecordRelations
{
    public function company(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Company::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Department::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'updated_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'approved_by');
    }

    public function comments(): MorphMany
    {
        return $this->morphMany(RecordComment::class, 'commentable')->latest();
    }

    public function attachments(): MorphMany
    {
        return $this->morphMany(RecordAttachment::class, 'attachable')->latest();
    }

    // ─── Common Scopes ──────────────────────────────────────────────

    public function scopeForCompany($query, string $companyId)
    {
        return $query->where('company_id', $companyId);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeByPriority($query, string $priority)
    {
        return $query->where('priority', $priority);
    }

    public function scopeSearch($query, string $term)
    {
        // 'ilike' sadece PostgreSQL'de var; SQLite/MySQL'de 'like' zaten case-insensitive.
        $operator = $query->getModel()->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

        return $query->where(fn($q) => $q
            ->where('title', $operator, "%{$term}%")
            ->orWhere('description', $operator, "%{$term}%")
            ->orWhere('record_number', $operator, "%{$term}%")
        );
    }
}
