<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** Stok kuralı ihlali (yetersiz stok, eksik depo vb.) — kullanıcıya 422 ile açıklanır. */
class StockException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $this->getMessage(),
            'code'    => 'STOCK_ERROR',
        ], 422);
    }
}
