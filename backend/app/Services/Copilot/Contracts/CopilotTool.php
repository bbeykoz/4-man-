<?php

namespace App\Services\Copilot\Contracts;

use App\Models\User;

/**
 * Copilot'un ERP verisini okumak için çağırdığı araç. Araçlar sadece okur;
 * stok değiştiren işlemler öneri olarak döner ve kullanıcı onayıyla ayrı akışta yapılır.
 */
interface CopilotTool
{
    /** snake_case, modelin çağıracağı ad */
    public function name(): string;

    public function description(): string;

    /** JSON Schema (object) */
    public function inputSchema(): array;

    /** Kullanıcı bu aracı çalıştırabilir mi (izin + şirket) */
    public function authorize(User $user): bool;

    public function run(User $user, array $input): array;
}
