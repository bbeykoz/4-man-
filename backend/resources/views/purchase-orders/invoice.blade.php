<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: DejaVu Sans, sans-serif; font-size: 13px; color: #222; }
  .company { font-size: 20px; font-weight: bold; color: #1d4ed8; }
  .muted { color: #666; font-size: 11px; line-height: 1.6; }
  .title { font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #111; text-align: right; }
  .meta { font-size: 11px; color: #444; text-align: right; line-height: 1.6; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 20px; }
  table.items th { background: #1d4ed8; color: #fff; text-align: left; padding: 8px 10px; font-size: 11px; }
  table.items td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  table.items th.num, table.items td.num { text-align: right; }
  table.totals { width: 260px; margin-left: auto; margin-top: 16px; border-collapse: collapse; }
  table.totals td { padding: 5px 8px; font-size: 12px; }
  table.totals td.num { text-align: right; }
  table.totals tr.grand td { font-weight: bold; font-size: 15px; border-top: 2px solid #1d4ed8; color: #1d4ed8; }
  .footer { margin-top: 40px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  .status { display: inline-block; font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 4px; background: #dbeafe; color: #1d4ed8; }
</style>
</head>
<body>
  <table style="width:100%; margin-bottom:20px;">
    <tr>
      <td style="width:60%;">
        <div class="company">{{ $po->supplier->name ?? '—' }}</div>
        <div class="muted">
          @if($po->supplier?->code) {{ $po->supplier->code }}<br>@endif
          @if($po->supplier?->tax_number) Vergi No: {{ $po->supplier->tax_number }}<br>@endif
          @if($po->supplier?->address) {{ $po->supplier->address }}<br>@endif
          @if($po->supplier?->phone || $po->supplier?->email)
            {{ collect([$po->supplier?->phone, $po->supplier?->email])->filter()->implode(' - ') }}
          @endif
        </div>
      </td>
      <td style="width:40%;">
        <div class="title">FATURA</div>
        <div class="meta">
          Sipariş No: {{ $po->po_number }}<br>
          @if($po->order_date) Sipariş Tarihi: {{ $po->order_date->format('d.m.Y') }}<br>@endif
          @if($po->expected_date) Beklenen Teslim: {{ $po->expected_date->format('d.m.Y') }}<br>@endif
          <span class="status">{{ $statusLabel }}</span>
        </div>
      </td>
    </tr>
  </table>

  <div class="muted">
    <strong>Alıcı:</strong> {{ $company->name ?? '—' }}{{ $company->address ? ' - '.$company->address : '' }}<br>
    <strong>Teslimat:</strong> {{ $po->warehouse->name ?? '—' }}
  </div>

  <table class="items">
    <thead>
      <tr><th>Ürün</th><th>SKU</th><th class="num">Miktar</th><th class="num">Birim Fiyat</th><th class="num">Tutar</th></tr>
    </thead>
    <tbody>
      @foreach($po->items as $item)
        <tr>
          <td>{{ $item->product->name ?? '—' }}</td>
          <td>{{ $item->product->sku ?? '—' }}</td>
          <td class="num">{{ rtrim(rtrim(number_format($item->quantity, 3, ',', '.'), '0'), ',') }} {{ $item->product->unit }}</td>
          <td class="num">{{ $item->unit_price !== null ? number_format($item->unit_price, 2, ',', '.').' '.$po->currency : '—' }}</td>
          <td class="num">{{ $item->unit_price !== null ? number_format($item->unit_price * $item->quantity, 2, ',', '.').' '.$po->currency : '—' }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>

  <table class="totals">
    <tr class="grand"><td>Genel Toplam</td><td class="num">{{ number_format($po->total_amount, 2, ',', '.') }} {{ $po->currency }}</td></tr>
  </table>

  @if($po->notes)
    <p class="muted" style="margin-top:20px;"><strong>Not:</strong> {{ $po->notes }}</p>
  @endif

  <div class="footer">
    Bu fatura, BytePanel Satın Alma modülünde kayıtlı sipariş verilerinden otomatik oluşturulmuştur. Oluşturulma: {{ now()->format('d.m.Y H:i') }}
  </div>
</body>
</html>
