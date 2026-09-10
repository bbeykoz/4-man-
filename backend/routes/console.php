<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Stok risk trendi için günlük kayıt (yerelde: php artisan schedule:work)
Schedule::command('stock:snapshot-risk')->dailyAt('23:50')->withoutOverlapping();
// Anomali taraması her sabah (İstanbul 06:00 = UTC 03:00)
Schedule::command('stock:detect-anomalies')->dailyAt('03:00')->withoutOverlapping();
