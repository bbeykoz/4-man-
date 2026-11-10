<?php

namespace App\Providers;

use App\Support\AppTime;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // AppTime, çözdüğü saat dilimini statik olarak saklıyor. Web isteğinde
        // bu sorun değil (süreç istek sonunda biter) ama kuyruk işçisi uzun
        // yaşıyor: bir şirketin saat dilimi sonraki işe sızabilir. Her işin
        // başında ve sonunda temizliyoruz.
        Event::listen(JobProcessing::class, fn () => AppTime::forget());
        Event::listen(JobProcessed::class,  fn () => AppTime::forget());
    }
}
