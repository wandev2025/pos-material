// lib/printing/escpos.ts
// Builds raw ESC/POS bytes for a thermal receipt at the configured paper width
// (58 / 76 / 80 mm). The encoder package is browser/Chromium oriented and may
// not be installed, so it is imported lazily and any failure resolves to `null`
// (callers then fall back to an HTML transport).

import type { PaperProfile, SaleItemLike, SaleLike, ShopSettings } from './types';
import { PAPER_COLUMNS } from './types';

const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n || 0);

export async function buildThermalEscPos(
  settings: ShopSettings,
  sale: SaleLike,
  items: SaleItemLike[],
  paper: PaperProfile = '80mm'
): Promise<Uint8Array | null> {
 let ReceiptPrinterEncoder: any;
  try {
    const mod: any = await import('@point-of-sale/receipt-printer-encoder');
    ReceiptPrinterEncoder = mod?.default ?? mod;
    if (!ReceiptPrinterEncoder) {
      console.error('ESC/POS: encoder module resolved but has no default export', mod);
      return null;
    }
  } catch (err) {
    console.error('ESC/POS: failed to import encoder package:', err);
    return null;
  }

  try {
    // Columns follow the paper profile (58mm=32, 76mm=40, 80mm=48) — never
    // hardcoded — so swapping paper/printer in Setup needs no code change.
    const columns = PAPER_COLUMNS[paper];
    const priceWidth = paper === '58mm' ? 10 : 12;
    const marginRight = 2;
    const nameWidth = Math.max(8, columns - priceWidth - marginRight);

    const encoder = new ReceiptPrinterEncoder({ columns, language: 'esc-pos' });

    let chain = encoder
      .initialize()
      .align('center')
      .bold(true)
      .size(2)
      .line(settings.shop_name || 'TOKO')
      .size(1)
      .bold(false);

    if (settings.shop_address) {
      chain = chain.font('B').line(settings.shop_address).font('A');
    }
    if (settings.shop_phone) {
      chain = chain
        .font('B')
        .line('Telp: ' + settings.shop_phone)
        .font('A');
    }

    const columnsDef = [
      { width: nameWidth, marginRight, align: 'left' },
      { width: priceWidth, align: 'right' },
    ];

    chain = chain
      .align('left')
      .rule({ style: 'single' })
      .table(
        columnsDef,
        items.map(i => [`${i.quantity}x ${i.item_name}`, formatRupiah(i.price_at_sale * i.quantity)])
      )
      .rule({ style: 'single' })
      .table(columnsDef, [
        [
          (enc: any) => enc.bold(true).text('TOTAL').bold(false),
          (enc: any) => enc.bold(true).text(formatRupiah(sale.total_amount)).bold(false),
        ],
      ]);

    if (settings.thermal_footer) {
      chain = chain.newline().align('center').italic(true).line(settings.thermal_footer).italic(false);
    }

return chain.newline(2).cut().encode() as Uint8Array;
  } catch (err) {
    console.error('ESC/POS: failed while building/encoding receipt:', err);
    return null;
  }
}
