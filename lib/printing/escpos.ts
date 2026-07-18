import type { PaperProfile, SaleItemLike, SaleLike, ShopSettings } from './types';
import { PAPER_COLUMNS, resolvePaperProfile } from './types';

const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n || 0).replace(/\u00A0/g, ' ');

const SIDE_MARGIN_COLUMNS = 1;

export async function buildThermalEscPos(
  settings: ShopSettings,
  sale: SaleLike,
  items: SaleItemLike[],
  paper: PaperProfile = '76mm'
): Promise<Uint8Array | null> {
  let ReceiptPrinterEncoder: any;
  try {
    const mod: any = await import('@point-of-sale/receipt-printer-encoder');
    ReceiptPrinterEncoder = mod?.default ?? mod;
  } catch (err) {
    console.error('ESC/POS: failed to import encoder package:', err);
    return null;
  }

  try {
    const resolvedPaper = resolvePaperProfile(paper, 'buildThermalEscPos');
    const rawColumns = PAPER_COLUMNS[resolvedPaper];

    // FIX: Use rawColumns here (42), not the subtracted value (40)
    const encoder = new ReceiptPrinterEncoder({ columns: rawColumns, language: 'esc-pos' });

    // Use usableColumns for layout calculations only
    const usableColumns = rawColumns - (SIDE_MARGIN_COLUMNS * 2);
    const priceWidth = resolvedPaper === '58mm' ? 10 : 12;
    const marginRight = 2;
    const nameWidth = Math.max(8, usableColumns - priceWidth - marginRight);

    let chain = encoder
      .initialize()
      .align('center')
      .bold(true)
      .size(2)
      .line(settings.shop_name || 'TOKO')
      .size(1)
      .bold(false);

    if (settings.shop_address) {
      chain = chain.font('B').bold(true).line(settings.shop_address).bold(false).font('A');
    }
    
    if (settings.shop_phone) {
      chain = chain.font('B').bold(true).line('Telp: ' + settings.shop_phone).bold(false).font('A');
    }

    const columnsDef = [
      { width: nameWidth, marginRight, align: 'left' },
      { width: priceWidth, align: 'right' },
    ];

    chain = chain
      .align('left')
      .rule({ style: 'single' })
      // Apply manual padding by adding spaces to the table if needed, 
      // or simply rely on the width calculations above.
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
      chain = chain.newline().align('center').bold(true).line(settings.thermal_footer).bold(false);
    }

    return chain.newline(2).cut().encode() as Uint8Array;
  } catch (err) {
    console.error('ESC/POS: failed while building/encoding receipt:', err);
    return null;
  }
}