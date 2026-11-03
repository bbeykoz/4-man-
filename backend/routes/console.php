<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Saatler Türkiye saatine göre; uygulama UTC çalışsa da görevler yerel saatte tetiklenir
$tz = config('app.display_timezone', 'Europe/Istanbul');

// Stok risk trendi için günlük kayıt (yerelde: php artisan schedule:work)
Schedule::command('stock:snapshot-risk')->dailyAt('23:50')->timezone($tz)->withoutOverlapping();
// Anomali taraması her sabah
Schedule::command('stock:detect-anomalies')->dailyAt('06:00')->timezone($tz)->withoutOverlapping();
