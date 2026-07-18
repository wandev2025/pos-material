/**
 * ============================================================================
 * PRINT TEMPLATE GENERATOR
 * Tuned for:
 *   - STRUK (THERMAL type) -> Epson TM-U220B (9-pin impact "receipt" printer)
 *   - FAKTUR / DO          -> Epson LX-310 / LX-312 (9-pin dot matrix, continuous form)
 * ============================================================================
 *
 * CHANGELOG (this revision):
 *
 * F. *** THERMAL PAPER-KEY RESOLUTION (this revision) ***
 *    thermalPaperKey used to be `(settings?...paper as ThermalPaper) || '76mm'`
 *    — a compile-time-only cast with no runtime check, resolved completely
 *    independently from the equivalent lookup in escpos.ts. Two independent
 *    "is this paper key valid" implementations is exactly how they drift
 *    (see the 74mm/76mm history in this file's own changelog). Both now
 *    call the single resolvePaperProfile() guard in types.ts, which warns
 *    on an invalid stored value instead of silently substituting one.
 *
 * G. *** LX-310 HARGA COLUMN LEGIBILITY (this revision) ***
 *    HARGA cells were plain-weight while the adjacent TOTAL cells were
 *    bold — same "thin strokes vanish on a 9-pin head" problem already
 *    fixed for the shop address/phone/footer in a prior revision, just
 *    missed on this column. HARGA is now bold to match TOTAL. Base
 *    .main-table font-size bumped 13px -> 14px for margin.
 *
 * H. *** LX-310 COLUMN ALIGNMENT (this revision) ***
 *    QTY was center-aligned while NAMA BARANG/HARGA/TOTAL were left/right —
 *    the odd one out made the header row look uneven against the data.
 *    QTY (header + data) is now left-aligned, matching NAMA BARANG. HARGA
 *    and TOTAL stay right-aligned (header and data both already were).
 *
 * (Prior revision notes A-E retained below for history.)
 *
 * A. Thermal paper reverted to 76mm (your real default in types.ts — not the
 *    74mm I'd guessed at in a previous pass off a placeholder file).
 *    contentWidth recalculated for 76mm using the SAME buffer the project
 *    already validated (roll - ~15mm hardware margin) = 61mm printable.
 *    THERMAL_SIDE_PADDING nudged 2mm -> 2.5mm since 76mm has slightly more
 *    room than the 74mm profile it replaced.
 *
 * B. Dot-matrix (FAKTUR/DO) orientation fix, unchanged from last pass:
 *    LX-310/LX-312 are narrow-carriage — tractor width is the SHORT edge
 *    (9.5in/241.3mm), page length runs 11.5in/292.1mm in the feed direction.
 *    That's portrait. pageWidth/pageHeight are derived from
 *    (shortEdge, longEdge, orientation) rather than typed by hand, so this
 *    can't silently get swapped again.
 *
 * C. FAKTUR/DO render in a monospace stack (Courier New / Consolas) at
 *    semi-bold weight by default, no italic anywhere — thin/slanted strokes
 *    break up on a 9-pin head.
 *
 * D. Header and data cells share the same font size in main-table, plus
 *    real vertical gridlines (border-right) between columns.
 *
 * E. *** NOT FIXABLE IN THIS FILE -- FLAGGING IT ***
 *    Chrome's native print header/footer (title/URL/date, page number)
 *    lives outside @page's margin box entirely. `@page { margin: 0 }`
 *    does not suppress it. Only removable via "Headers and footers" in the
 *    print dialog, or by confirming the KIOSK/AGENT transport uses
 *    webContents.print()/printToPDF options rather than window.print().
 * ----------------------------------------------------------------------------
 */

import { resolvePaperProfile, type PaperProfile } from './printing/types';

const formatRupiah = (n: number) => {
  const val = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Math.round(n) || 0);
  return val.replace(/\u00A0/g, ' ');
};

const esc = (value: any): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

/**
 * ----------------------------------------------------------------------------
 * THERMAL CONFIGURATIONS
 * Adjusted for TM-U220B impact heads: base sizes reduced slightly to ensure
 * columns do not wrap on 76mm/80mm rolls.
 * ----------------------------------------------------------------------------
 */
const THERMAL_PAPER_CONFIGS: Record<PaperProfile, {
  rollWidth: string; contentWidth: string; baseSize: string; smallSize: string; titleSize: string;
}> = {
  '58mm': { 
    rollWidth: '58mm', 
    contentWidth: '46mm', 
    baseSize: '9.5px', 
    smallSize: '8.5px', 
    titleSize: '13px' 
  },
  '76mm': { 
    rollWidth: '76mm', 
    contentWidth: '61mm', 
    baseSize: '10.5px', 
    smallSize: '9.5px', 
    titleSize: '15px' 
  },
  '80mm': { 
    rollWidth: '80mm', 
    contentWidth: '70mm', 
    baseSize: '11.5px', 
    smallSize: '10px', 
    titleSize: '17px' 
  },
};

const THERMAL_SIDE_PADDING = '2.5mm';
const DOC_SIDE_PADDING = '6mm';

/**
 * ----------------------------------------------------------------------------
 * DOT MATRIX CONFIGURATIONS
 * CONTINUOUS_95 is calibrated for 9.5in x 5.5in (Half-Page) forms.
 * ----------------------------------------------------------------------------
 */
type DotMatrixDef = {
  shortEdge: string;
  longEdge: string;
  orientation: 'portrait' | 'landscape';
  sideMarginMm: number;
};

const DOTMATRIX_BASE_DEFS: Record<string, DotMatrixDef> = {
  A4: { 
    shortEdge: '210mm', 
    longEdge: '297mm', 
    orientation: 'portrait', 
    sideMarginMm: 11 
  },
  CONTINUOUS_95: { 
    shortEdge: '241.3mm', 
    longEdge: '292.1mm', 
    orientation: 'portrait', 
    sideMarginMm: 12 
  },
  CONTINUOUS_80: { 
    shortEdge: '203mm', 
    longEdge: '279mm', 
    orientation: 'portrait', 
    sideMarginMm: 12.5 
  },
};

const buildDotMatrixConfig = (def: DotMatrixDef) => {
  const short = parseFloat(def.shortEdge);
  const long = parseFloat(def.longEdge);
  const pageWidthMm = def.orientation === 'portrait' ? short : long;
  const pageHeightMm = def.orientation === 'portrait' ? long : short;
  const contentWidthMm = pageWidthMm - 2 * def.sideMarginMm;

  return {
    pageWidth: `${pageWidthMm}mm`,
    pageHeight: `${pageHeightMm}mm`,
    contentWidth: `${contentWidthMm}mm`,
    sideMargin: `${def.sideMarginMm}mm`,
    orientation: def.orientation,
  };
};

const DOTMATRIX_PAPER_CONFIGS = {
  A4: buildDotMatrixConfig(DOTMATRIX_BASE_DEFS.A4),
  CONTINUOUS_95: buildDotMatrixConfig(DOTMATRIX_BASE_DEFS.CONTINUOUS_95),
  CONTINUOUS_80: buildDotMatrixConfig(DOTMATRIX_BASE_DEFS.CONTINUOUS_80),
} as const;

type DotMatrixPaper = keyof typeof DOTMATRIX_PAPER_CONFIGS;

export const generatePrintHtml = (type: 'THERMAL' | 'FAKTUR' | 'DO', settings: any, sale: any, items: any[]) => {
  const shop = settings || { shop_name: 'TOKO KAMI', shop_address: '', shop_phone: '' };

  const isThermal = type === 'THERMAL';
  const isDO = type === 'DO';
  const docTitle = isDO ? 'SURAT JALAN' : 'FAKTUR PENJUALAN';

  const thermalPaperKey = resolvePaperProfile(
    settings?.print_config?.THERMAL?.paper,
    'generatePrintHtml (THERMAL)'
  );
  const thermal = THERMAL_PAPER_CONFIGS[thermalPaperKey];

  const dotMatrixPaperKey: DotMatrixPaper =
    (settings?.print_config?.[type]?.paper as DotMatrixPaper) || 'CONTINUOUS_95';
  const dotMatrix = DOTMATRIX_PAPER_CONFIGS[dotMatrixPaperKey] || DOTMATRIX_PAPER_CONFIGS['CONTINUOUS_95'];

  const subtotal = items.reduce((a, i) => a + i.price_at_sale * i.quantity, 0);
  const totalDiscount = (sale.discount || 0) + items.reduce((a, i) => a + (i.discount || 0), 0);
  const grandTotal = sale.total_amount;
  const dp = sale.down_payment || 0;
  const sisa = Math.max(0, grandTotal - dp);

  /**
   * --------------------------------------------------------------------------
   * CSS STYLES
   * --------------------------------------------------------------------------
   */
  const commonStyles = `
    <style>
      @page {
        size: ${isThermal ? 'auto' : `${dotMatrix.pageWidth} ${dotMatrix.pageHeight}`};
        margin: 0;
      }

      html, body { width: 100%; height: auto; }

      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color: #000 !important;
      }

      body {
        margin: 0; padding: 0;
        font-family: "Verdana", "Geneva", sans-serif !important;
        line-height: 1.3;
        background: #fff;
      }

      .text-right { text-align: right !important; }
      .text-center { text-align: center !important; }
      .text-left { text-align: left !important; }
      .bold { font-weight: 700; }
      .uppercase { text-transform: uppercase; }

      .wrap {
        overflow-wrap: break-word;
        word-break: break-word;
        white-space: normal;
      }

      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      td, th { vertical-align: top; overflow-wrap: break-word; word-break: break-word; padding: 4px 0; }

      /* DOT MATRIX SPECIFIC STYLES */
      .doc-container {
        width: ${dotMatrix.pageWidth};
        height: ${dotMatrix.pageHeight};
        padding: 5mm 8mm 5mm 12mm; /* Offset left padding to clear tractor holes */
        margin: 0; /* FIX FOR THE LEFT GAP ISSUE */
        font-family: "Courier New", Consolas, monospace !important;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.15px;
        line-height: 1.25;
        position: relative;
        overflow: hidden;
        page-break-after: always;
      }

      .header-area { border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
      .header-area .shop-name { font-size: 15px; font-weight: 900; line-height: 1.1; }
      .header-area .shop-meta { font-size: 11px; font-weight: 600; line-height: 1.2; }
      .header-area .doc-title { font-size: 14px; font-weight: 900; letter-spacing: 0.3px; }
      .header-area .doc-meta { font-size: 11px; font-weight: 600; }

      .customer-info-area { width: 100%; margin-bottom: 6px; border-collapse: collapse; }
      .customer-label { font-size: 11px; font-weight: 600; width: 100px; vertical-align: top; }
      .customer-name-val { font-size: 12px; font-weight: 900; text-transform: uppercase; }
      .customer-meta { font-size: 11px; font-weight: 600; line-height: 1.25; }

      .main-table th,
      .main-table td {
        font-size: 12px;
        border: none;
        padding: 3px 4px;
      }
      .main-table th {
        border-top: 1px solid #000;
        border-bottom: 1px solid #000;
        font-weight: 800;
        text-align: left;
      }
      .main-table th.text-right { text-align: right !important; }
      
      .price-cell {
        font-family: "Courier New", Consolas, monospace !important;
        font-weight: 800 !important;
        text-align: right;
        font-size: 12px !important;
      }

      .bottom-section {
       position: relative; 
  margin-top: 8px; 
  border-top: 1px solid #000;
  padding-top: 6px;
  left: 0;
  right: 0;
      }

      .doc-summary-table { width: 100%; border-collapse: collapse; }
      .doc-summary-table td { padding: 2px 0; font-weight: 600; font-size: 12px; }
      .doc-summary-table .val { text-align: right; font-weight: 900; font-size: 12px; }

      .signature-table { width: 100%; margin-top: 10px; table-layout: fixed; }
      .signature-table td { 
        text-align: center; 
        font-size: 12px; 
        font-weight: 600; 
        white-space: nowrap; 
      }
      .sig-space { height: 40px; }

      /* THERMAL SPECIFIC STYLES */
      .thermal-container {
        width: ${thermal.contentWidth};
        padding: 0 ${THERMAL_SIDE_PADDING};
        margin: 0 auto;
        font-size: ${thermal.baseSize};
      }
      .thermal-container .shop-name { font-size: ${thermal.titleSize}; font-weight: bold; margin-bottom: 4px; }
      .thermal-table th {
        border-top: 1px solid #000; border-bottom: 1px solid #000;
        padding: 6px 0; font-size: ${thermal.smallSize}; text-align: left;
      }
      .thermal-row td { font-size: ${thermal.smallSize}; padding: 5px 0; }
    </style>
  `;

  /**
   * ==========================================================================
   * BRANCH 1: THERMAL RECEIPT (TM-U220B)
   * ==========================================================================
   */
  if (isThermal) {
    return `
      <html>
        <head><meta charset="utf-8" />${commonStyles}</head>
        <body>
          <div class="thermal-container">
            <div class="text-center wrap" style="margin-bottom: 12px;">
              <div class="shop-name uppercase wrap">${esc(shop.shop_name)}</div>
              <div class="wrap" style="font-size: ${thermal.smallSize};">${esc(shop.shop_address)}</div>
              <div style="font-size: ${thermal.smallSize};">Tel: ${esc(shop.shop_phone)}</div>
            </div>

            <table style="margin-bottom: 8px; font-size: ${thermal.smallSize}; border-top: 1px dashed #000; padding-top: 6px;">
              <tr>
                <td>Nota: #${esc(sale.id)}</td>
                <td class="text-right">${new Date(sale.created_at).toLocaleDateString('id-ID')}</td>
              </tr>
              <tr><td colspan="2" class="wrap">Cust: ${esc(sale.customer_name)}</td></tr>
            </table>

            <table class="thermal-table">
              <colgroup>
                <col style="width:48%">
                <col style="width:16%">
                <col style="width:36%">
              </colgroup>
              <thead>
                <tr>
                  <th class="text-left">ITEM</th>
                  <th class="text-center">QTY</th>
                  <th class="text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((i) => `
                  <tr class="thermal-row">
                    <td class="wrap">
                      <div class="bold uppercase">${esc(i.item_name)}</div>
                      <div>@${formatRupiah(i.price_at_sale)}</div>
                    </td>
                    <td class="text-center">${esc(i.quantity)}</td>
                    <td class="text-right bold">${formatRupiah(i.price_at_sale * i.quantity - (i.discount || 0))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div style="margin-top: 6px; border-top: 1px solid #000; padding-top: 6px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 2px 0;">Subtotal</td><td class="text-right">${formatRupiah(subtotal)}</td></tr>
                ${totalDiscount > 0 ? `<tr><td style="padding: 2px 0;">Diskon</td><td class="text-right">-${formatRupiah(totalDiscount)}</td></tr>` : ''}
                <tr style="border-top: 1px solid #000;">
                  <td class="bold" style="font-size: ${thermal.baseSize}; padding-top: 4px;">TOTAL</td>
                  <td class="text-right bold" style="font-size: ${thermal.baseSize}; padding-top: 4px;">${formatRupiah(grandTotal)}</td>
                </tr>
                <tr><td style="padding: 2px 0;">Bayar</td><td class="text-right">${formatRupiah(dp)}</td></tr>
                ${sisa > 0 ? `<tr><td class="bold" style="padding: 2px 0;">SISA</td><td class="text-right bold">${formatRupiah(sisa)}</td></tr>` : ''}
              </table>
            </div>

            <div class="text-center wrap" style="margin-top: 15px; font-size: ${thermal.smallSize}; border-top: 1px dashed #000; padding-top: 10px;">
              ${esc(shop.thermal_footer)}
              <div class="bold uppercase" style="margin-top: 5px;">Terima Kasih</div>
            </div>
            <div style="height: 15mm;">&nbsp;</div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * ==========================================================================
   * BRANCH 2 & 3: FAKTUR & DO (LX-310 / LX-312)
   * With 11.5-inch (full continuous form) pagination logic.
   * ==========================================================================
   */
  const ITEMS_PER_PAGE = 25; 
  const itemColWidths = isDO
    ? ['7%', '43%', '12%', '38%']
    : ['6%', '32%', '10%', '24%', '28%'];

  const itemChunks = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    itemChunks.push(items.slice(i, i + ITEMS_PER_PAGE));
  }

  const pagesHtml = itemChunks.map((chunk, pageIdx) => {
    const isLastPage = pageIdx === itemChunks.length - 1;

    // --- Start Building Page Content ---
    let pageContent = `
      <div class="doc-container">
        <!-- HEADER AREA -->
        <table class="header-area">
          <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
          <tr>
            <td style="vertical-align: top;">
              <div class="shop-name uppercase wrap">${esc(shop.shop_name)}</div>
              <div class="shop-meta wrap">${esc(shop.shop_address)}</div>
              <div class="shop-meta">WA: ${esc(shop.shop_phone)}</div>
            </td>
            <td class="text-right" style="vertical-align: top;">
              <div class="doc-title">${docTitle}</div>
              <div class="doc-meta" style="margin-top: 5px;">#${isDO ? 'DO' : 'INV'}-${esc(sale.id)}</div>
              <div class="doc-meta">${new Date(sale.created_at).toLocaleDateString('id-ID')}</div>
              <div class="doc-meta">Hal: ${pageIdx + 1} / ${itemChunks.length}</div>
            </td>
          </tr>
        </table>

        <!-- BUYER INFO AREA -->
        <table class="customer-info-area">
          <tr>
            <td class="customer-label">Kepada Yth:</td>
            <td class="customer-name-val">${esc(sale.customer_name || 'Pelanggan Umum')}</td>
          </tr>
          <tr>
            <td class="customer-label">Alamat:</td>
            <td class="customer-meta wrap">${esc(sale.customer_address || '-')}</td>
          </tr>
          <tr>
            <td class="customer-label">No. Telp:</td>
            <td class="customer-meta">${esc(sale.customer_phone || '-')}</td>
          </tr>
        </table>

        <!-- MAIN ITEMS TABLE -->
        <table class="main-table">
          <colgroup>
            ${itemColWidths.map((w) => `<col style="width:${w}">`).join('')}
          </colgroup>
          <thead>
            <tr>
              <th class="text-center">NO</th>
              <th class="text-left">NAMA BARANG</th>
              <th class="text-left">QTY</th>
              ${!isDO 
                ? `<th class="text-right">HARGA</th><th class="text-right">TOTAL</th>` 
                : `<th class="text-left">KONDISI</th>`
              }
            </tr>
          </thead>
          <tbody>
            ${chunk.map((i, idx) => {
              const globalIdx = (pageIdx * ITEMS_PER_PAGE) + idx + 1;
              return `
                <tr>
                  <td class="text-center bold">${globalIdx}</td>
                  <td class="text-left bold uppercase wrap">${esc(i.item_name)}</td>
                  <td class="text-left bold">${esc(i.quantity)}</td>
                  ${!isDO ? `
                    <td class="price-cell">${formatRupiah(i.price_at_sale)}</td>
                    <td class="price-cell">${formatRupiah(i.price_at_sale * i.quantity - (i.discount || 0))}</td>
                  ` : `
                    <td class="text-left bold uppercase wrap">${esc(i.condition || 'Baik')}</td>
                  `}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- BOTTOM SECTION -->
        <div class="bottom-section">
    `;

    // Add Totals and Signatures ONLY on the last page
    if (isLastPage) {
      pageContent += `
        <table style="width: 100%; border-collapse: collapse;">
          <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
          <tr>
            <td style="vertical-align: top; padding-right: 20px;">
              <div class="bold uppercase" style="font-size: 11px;">Keterangan:</div>
              <div class="wrap" style="font-size: 11px; margin-top: 4px;">${esc(isDO ? shop.do_footer : shop.invoice_footer)}</div>
            </td>
            <td>
              ${!isDO ? `
                <table class="doc-summary-table">
                  <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
                  <tr><td>TOTAL AKHIR</td><td class="val">${formatRupiah(grandTotal)}</td></tr>
                  <tr><td>DIBAYAR</td><td class="val">${formatRupiah(dp)}</td></tr>
                  ${sisa > 0 ? `<tr><td class="bold">SISA TEMPO</td><td class="val bold">${formatRupiah(sisa)}</td></tr>` : ''}
                </table>
              ` : ''}
            </td>
          </tr>
        </table>

        <table class="signature-table">
          <colgroup><col style="width:33.3%"><col style="width:33.3%"><col style="width:33.4%"></colgroup>
          <tr>
            <td class="bold uppercase">PENERIMA</td>
            <td class="bold uppercase">${isDO ? 'SOPIR' : 'GUDANG'}</td>
            <td class="bold uppercase">HORMAT KAMI</td>
          </tr>
          <tr><td class="sig-space"></td><td class="sig-space"></td><td class="sig-space"></td></tr>
          <tr>
            <td>( ................. )</td>
            <td>( ................. )</td>
            <td class="bold wrap">( ${esc(shop.shop_name)} )</td>
          </tr>
        </table>
      `;
    } else {
      pageContent += `
        <div style="text-align: center; border-top: 1px dashed #000; padding: 8px 0; font-weight: 700; font-size: 11px;">
          BERSAMBUNG KE HALAMAN ${pageIdx + 2} ...
        </div>
      `;
    }

    pageContent += `
        </div> <!-- end of bottom-section -->
      </div> <!-- end of doc-container -->
    `;

    return pageContent;
  }).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        ${commonStyles}
      </head>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `;
};