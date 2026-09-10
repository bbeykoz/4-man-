<?php

/*
|--------------------------------------------------------------------------
| Stok analitiği varsayılanları
|--------------------------------------------------------------------------
*/

return [
    // Üründe tedarik süresi girilmemişse kullanılır (sonuç "tahmini" işaretlenir)
    'default_lead_time_days' => (int) env('STOCK_DEFAULT_LEAD_TIME_DAYS', 7),

    // Sipariş önerisinde tedarik süresine eklenen gözden geçirme periyodu
    'review_period_days' => (int) env('STOCK_REVIEW_PERIOD_DAYS', 7),

    // Tüketim hızı pencereleri (gün)
    'consumption_short_window' => 30,
    'consumption_long_window'  => 90,

    // Çok yeni üründe günlük ortalamayı şişirmemek için en az bu kadar gün bölünür
    'min_consumption_days' => 7,

    // SKT seviyeleri: kalan gün <= eşik
    'expiry_levels' => [
        'critical' => 30,
        'warning'  => 60,
        'watch'    => 90,
    ],

    // Hareket sınıfları (stokta kalma günü = eldeki / günlük tüketim)
    'movement_classes' => [
        'fast_max_days_of_supply' => 30,   // ≤ 30 gün: hızlı
        'slow_min_days_of_supply' => 180,  // > 180 gün: yavaş
        'dead_no_consumption_days'=> 90,   // 90 gündür çıkış yok: ölü
        'new_product_days'        => 30,   // ilk hareketi 30 günden yeni: sınıflanmaz
        'excess_cover_days'       => 90,   // bu kadar günlük ihtiyacın üstü "fazla stok"
    ],

    // Anomali tespiti
    'anomaly' => [
        'scan_days'            => 14,   // son kaç gün taranır
        'baseline_days'        => 90,   // karşılaştırma dönemi
        'spike_min_ratio'      => 3.0,  // çıkış >= ortalama × 3
        'spike_min_sigma'      => 3.0,  // ve >= ortalama + 3σ
        'spike_min_qty'        => 5,
        'large_record_ratio'   => 5.0,  // tek kayıt >= tipik (medyan) kayıt × 5
        'large_record_min_qty' => 10,
        'damage_min_ratio'     => 2.0,  // son 30 gün hasar >= önceki 30 gün ortalaması × 2
        'damage_min_qty'       => 5,
        'count_variance_pct'   => 10,   // sayım farkı >= %10
        'count_variance_min'   => 5,
        'frequent_adjustments' => 3,    // 30 günde >= 3 azalış düzeltmesi
        'user_min_events'      => 3,
        'user_sigma'           => 2.0,
        'business_timezone'    => 'Europe/Istanbul',
        'business_hours'       => [7, 22], // [başlangıç, bitiş) saat
        'notify_min_severity'  => 70,
    ],

    // Risk seviyesi eşikleri (skor >= eşik)
    'risk_levels' => [
        'critical' => 80,
        'high'     => 60,
        'medium'   => 30,
    ],
];
