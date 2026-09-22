# Laravel 12 (PHP 8.4) — php-fpm. Kod bind mount ile gelir, vendor deploy sırasında kurulur.
FROM php:8.4-fpm-alpine

RUN apk add --no-cache \
        postgresql-dev libzip-dev icu-dev oniguruma-dev freetype-dev libjpeg-turbo-dev libpng-dev \
        git unzip bash tzdata \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql pgsql zip gd intl bcmath exif opcache pcntl posix \
    && rm -rf /var/cache/apk/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV TZ=Europe/Istanbul \
    COMPOSER_ALLOW_SUPERUSER=1

COPY opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY php.ini /usr/local/etc/php/conf.d/zz-app.ini

WORKDIR /app
