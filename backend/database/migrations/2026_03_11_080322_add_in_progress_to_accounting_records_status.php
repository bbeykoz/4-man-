<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Drop existing check constraint and add new one with in_progress
        DB::statement('ALTER TABLE accounting_records DROP CONSTRAINT IF EXISTS accounting_records_status_check');
        DB::statement("ALTER TABLE accounting_records ADD CONSTRAINT accounting_records_status_check CHECK (status IN ('draft', 'pending', 'in_progress', 'approved', 'rejected', 'completed', 'cancelled'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE accounting_records DROP CONSTRAINT IF EXISTS accounting_records_status_check');
        DB::statement("ALTER TABLE accounting_records ADD CONSTRAINT accounting_records_status_check CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'completed', 'cancelled'))");
    }
};
