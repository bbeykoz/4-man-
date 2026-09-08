<?php

namespace App\Traits;

trait HasRecordNumber
{
    public static function bootHasRecordNumber(): void
    {
        static::creating(function ($model) {
            if (empty($model->record_number)) {
                $model->record_number = $model->generateRecordNumber();
            }
        });
    }

    protected function generateRecordNumber(): string
    {
        $prefix = strtoupper(substr(class_basename($this), 0, 3));
        $year   = date('Y');
        $month  = date('m');

        $lastRecord = static::whereYear('created_at', $year)
            ->whereMonth('created_at', $month)
            ->orderBy('created_at', 'desc')
            ->first();

        $sequence = $lastRecord
            ? ((int) substr($lastRecord->record_number, -5)) + 1
            : 1;

        return sprintf('%s-%s%s-%05d', $prefix, $year, $month, $sequence);
    }
}
