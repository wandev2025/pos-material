/**
 * ============================================================================
 * PRINT TEMPLATE GENERATOR
 * Tuned for:
 *   - STRUK (THERMAL type) -> Epson TM-U220B (9-pin impact "receipt" printer)
 *   - FAKTUR / DO          -> Epson LX-310 / LX-312 (9-pin dot matrix, continuous form)
 * ============================================================================
 *
 * WHY TEXT WAS GETTING CUT OFF (root causes fixed below):
 *
 * 1. The old code assumed the FULL printable width of the paper roll equals
 *    the physical roll width. It doesn't. Epson's own technical reference for
 *    the TM-U220 series lists the *real* printable area as narrower than the
 *    roll:
 *        76mm roll   -> ~63.4mm printable
 *        69.5mm roll -> ~57mm printable
 *        57.5mm roll -> ~48mm printable
 *    The old "76mm -> 64mm" value was already very close to the physical
 *    limit, so any driver/margin overhead pushed the last column past the
 *    printable edge and it got clipped. We now use safer values with a
 *    small buffer.
 *
 * 2. `table-layout: fixed` was combined with mismatched pixel `width="150"`
 *    attributes and no <colgroup>. When column widths don't add up cleanly,
 *    the browser silently squeezes the last column, which is exactly what
 *    causes numbers/text to look "cut before the end". Every table below now
 *    uses an explicit <colgroup> with percentages that always sum to 100%.
 *
 * 3. `@page { margin: 5mm }` stacks ON TOP of the printer driver's own
 *    hardware margin (impact/dot-matrix drivers already reserve unprintable
 *    edges). Doubling the margin can force "fit to page" scaling that clips
 *    the right edge. We now set `@page { margin: 0 }` and instead pad using
 *    an inner container sized to the *printable* width, centered on the roll
 *    / sheet — so we never assume we can use the physical edge.
 *
 * 4. `letter-spacing: 0.3px` on the dot-matrix template silently widens every
 *    line. Across a 190mm-wide invoice line with ~90 characters that's an
 *    extra ~7mm — enough to push the total/price column off the page. Removed.
 *
 * 5. Long rows (item name + price + qty) could be split across a page break
 *    on continuous-form paper, which reads as "the text got cut off mid
 *    line". Added `page-break-inside: avoid` on rows, the summary block, and
 *    the signature block, plus `thead { display: table-header-group }` so
 *    column headers repeat if a long invoice spills onto a second sheet.
 *
 * 6. Flex layouts (`display:flex`) for the summary rows are not rendered
 *    consistently by the older embedded Chromium/WebView print engines many
 *    POS apps and thermal/dot-matrix drivers rely on. Replaced with plain
 *    tables, which print identically everywhere.
 *
 * 7. Item names no longer get `white-space:nowrap`-style truncation — they
 *    wrap with `overflow-wrap: break-word` instead of being clipped.
 *
 * Sources: Epson TM-U220 Technical Reference Guide (printable area per roll
 * width), Epson TM-U220 datasheet (58/70/76mm roll support), Epson LX-310
 * datasheet (continuous paper up to 254mm / 10").
 * ============================================================================
 */

const formatRupiah = (n: number) => {
  const val = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Math.round(n) || 0);
  // Fix for thermal/impact printers: replace non-breaking spaces with standard spaces
  return val.replace(/\u00A0/g, ' ');
};

const esc = (value: any): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

// ----------------------------------------------------------------------------
// STRUK (THERMAL / TM-U220B) PAPER PROFILES
// contentWidth = the REAL printable width, not the roll width.
// Numbers below come from Epson's TM-U220 technical reference: printable
// area is narrower than the roll to leave hardware margins on both sides.
// A ~1mm safety buffer is subtracted on top of the spec value.
// ----------------------------------------------------------------------------
const THERMAL_PAPER_CONFIGS = {
  '58mm': { rollWidth: '58mm', contentWidth: '46mm', baseSize: '10.5px', smallSize: '9.5px', titleSize: '14px' },
  '70mm': { rollWidth: '70mm', contentWidth: '55mm', baseSize: '11.5px', smallSize: '10.5px', titleSize: '16px' },
  // Recommended default for Epson TM-U220B loaded with 76mm roll paper
  '76mm': { rollWidth: '76mm', contentWidth: '61mm', baseSize: '12px', smallSize: '11px', titleSize: '17px' },
  // Generic 80mm thermal (NOT the TM-U220B, kept for other printer models)
  '80mm': { rollWidth: '80mm', contentWidth: '70mm', baseSize: '13px', smallSize: '12px', titleSize: '19px' },
} as const;

// ----------------------------------------------------------------------------
// FAKTUR / DO (DOT MATRIX / LX-310 / LX-312) PAPER PROFILES
// LX-310 supports continuous (fanfold) paper up to 254mm (10") wide, which
// covers the common Indonesian "kertas continuous form 9.5 x 11" pre-printed
// forms, as well as plain A4 cut-sheet feeding.
// contentWidth always leaves margin clear of the tractor-feed pin holes.
// ----------------------------------------------------------------------------
const DOTMATRIX_PAPER_CONFIGS = {
  // Plain A4 cut sheet
  A4: { pageWidth: '210mm', contentWidth: '188mm', sideMargin: '11mm' },
  // Continuous form 9.5" x 11" (241mm x 279mm) - most common faktur/DO paper
  // for LX-310/LX-312 in Indonesia, fed via tractor.
  CONTINUOUS_95: { pageWidth: '241mm', contentWidth: '212mm', sideMargin: '14.5mm' },
  // Narrower continuous form (used with smaller/triplo forms)
  CONTINUOUS_80: { pageWidth: '203mm', contentWidth: '178mm', sideMargin: '12.5mm' },
} as const;

type ThermalPaper = keyof typeof THERMAL_PAPER_CONFIGS;
type DotMatrixPaper = keyof typeof DOTMATRIX_PAPER_CONFIGS;

export const generatePrintHtml = (type: 'THERMAL' | 'FAKTUR' | 'DO', settings: any, sale: any, items: any[]) => {
  const shop = settings || { shop_name: 'TOKO KAMI', shop_address: '', shop_phone: '' };

  const isThermal = type === 'THERMAL';
  const isDO = type === 'DO';
  const docTitle = isDO ? 'SURAT JALAN' : 'FAKTUR PENJUALAN';

  const thermalPaperKey: ThermalPaper =
    (settings?.print_config?.THERMAL?.paper as ThermalPaper) || '76mm';
  const thermal = THERMAL_PAPER_CONFIGS[thermalPaperKey] || THERMAL_PAPER_CONFIGS['76mm'];

  const dotMatrixPaperKey: DotMatrixPaper =
    (settings?.print_config?.[type]?.paper as DotMatrixPaper) || 'CONTINUOUS_95';
  const dotMatrix = DOTMATRIX_PAPER_CONFIGS[dotMatrixPaperKey] || DOTMATRIX_PAPER_CONFIGS['CONTINUOUS_95'];

  const subtotal = items.reduce((a, i) => a + i.price_at_sale * i.quantity, 0);
  const totalDiscount = (sale.discount || 0) + items.reduce((a, i) => a + (i.discount || 0), 0);
  const grandTotal = sale.total_amount;
  const dp = sale.down_payment || 0;
  const sisa = Math.max(0, grandTotal - dp);

  // --------------------------------------------------------------------------
  // SHARED STYLES
  // --------------------------------------------------------------------------
  const commonStyles = `
    <style>
      /* margin:0 on purpose -- see note (3) above. The printable-width
         container below already keeps content clear of the physical edge,
         so we don't want the browser/driver margin box stacking on top. */
      @page { size: auto; margin: 0; }

      html, body { width: 100%; height: auto; }

      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color: #000 !important; /* Force pure black for 9-pin impact contrast */
      }

      body {
        margin: 0; padding: 0;
        /* Verdana/Geneva render more legibly than Arial on low-res impact heads */
        font-family: "Verdana", "Geneva", sans-serif !important;
        line-height: 1.4;
        background: #fff;
      }

      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .bold { font-weight: bold; }
      .uppercase { text-transform: uppercase; }

      /* Wrap instead of clip -- never let a long name get cut off */
      .wrap {
        overflow-wrap: break-word;
        word-break: break-word;
        white-space: normal;
      }

      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      td, th { vertical-align: top; overflow-wrap: break-word; word-break: break-word; padding: 4px 0; }

      /* Repeat header row if content spills onto a second page/sheet,
         and keep rows from splitting mid-line across a page break. */
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr, .keep-together { page-break-inside: avoid; break-inside: avoid; }

      /* ===================== STRUK / THERMAL (TM-U220B) ===================== */
      .thermal-container {
        width: ${thermal.contentWidth};
        margin: 0 auto;
        font-size: ${thermal.baseSize};
      }
      .thermal-container .shop-name { font-size: ${thermal.titleSize}; font-weight: bold; margin-bottom: 4px; }
      .thermal-table th {
        border-top: 1px solid #000; border-bottom: 1px solid #000;
        padding: 6px 0; font-size: ${thermal.smallSize}; text-align: left;
      }
      .thermal-row td { font-size: ${thermal.smallSize}; padding: 5px 0; }

      .summary-table { width: 100%; border-collapse: collapse; }
      .summary-table td { padding: 3px 0; }
      .summary-table .val { text-align: right; }

      /* ===================== FAKTUR / DO (LX-310 / LX-312) ===================== */
      .doc-container {
        width: ${dotMatrix.contentWidth};
        margin: 0 auto;
        font-size: 13px; /* readable size for 9-pin NLQ/draft */
      }
      .header-area { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
      .header-area table { table-layout: auto; }

      .main-table th {
        border-top: 1.5px solid #000;
        border-bottom: 1.5px solid #000;
        padding: 8px 4px;
        font-size: 12px;
        text-align: left;
      }
      .main-table td {
        padding: 8px 4px;
        border-bottom: 0.5px solid #000;
      }

      .doc-summary-table { width: 100%; max-width: 340px; margin-left: auto; border-collapse: collapse; }
      .doc-summary-table td { padding: 4px 0; }
      .doc-summary-table .val { text-align: right; font-weight: bold; }
      .doc-summary-table .grand-total td {
        border-top: 3px double #000;
        padding-top: 8px;
        font-size: 17px;
      }

      .signature-table { width: 100%; margin-top: 40px; table-layout: fixed; }
      .signature-table td { text-align: center; padding: 0 10px; font-size: 12px; }
      .sig-space { height: 60px; }
    </style>
  `;

  // ==========================================================================
  // STRUK (THERMAL)
  // ==========================================================================
  if (isThermal) {
    return `
      <html>
        <head><meta charset="utf-8" />${commonStyles}</head>
        <body>
          <div class="thermal-container">
            <div class="text-center wrap" style="margin-bottom: 15px;">
              <div class="shop-name uppercase wrap">${esc(shop.shop_name)}</div>
              <div class="wrap" style="font-size: ${thermal.smallSize};">${esc(shop.shop_address)}</div>
              <div style="font-size: ${thermal.smallSize};">Tel: ${esc(shop.shop_phone)}</div>
            </div>

            <table style="margin-bottom: 10px; font-size: ${thermal.smallSize};" class="keep-together">
              <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
              <tr>
                <td>Nota: #${esc(sale.id)}</td>
                <td class="text-right">${new Date(sale.created_at).toLocaleDateString('id-ID')}</td>
              </tr>
              <tr><td colspan="2" class="wrap">Cust: ${esc(sale.customer_name)}</td></tr>
            </table>

            <table class="thermal-table">
              <colgroup>
                <col style="width:46%">
                <col style="width:18%">
                <col style="width:36%">
              </colgroup>
              <thead>
                <tr>
                  <th class="text-left">ITEM/HARGA</th>
                  <th class="text-center">QTY</th>
                  <th class="text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (i) => `
                  <tr class="thermal-row keep-together">
                    <td class="wrap">
                      <div class="bold uppercase wrap">${esc(i.item_name)}</div>
                      <div>@${formatRupiah(i.price_at_sale)}</div>
                    </td>
                    <td class="text-center" style="vertical-align: middle;">${esc(i.quantity)}</td>
                    <td class="text-right bold" style="vertical-align: middle;">${formatRupiah(
                      i.price_at_sale * i.quantity - (i.discount || 0)
                    )}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>

            <div class="keep-together" style="margin-top: 8px; border-top: 1px solid #000; padding-top: 6px;">
              <table class="summary-table">
                <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
                <tr><td>Subtotal</td><td class="val">${formatRupiah(subtotal)}</td></tr>
                ${
                  totalDiscount > 0
                    ? `<tr><td>Diskon</td><td class="val">-${formatRupiah(totalDiscount)}</td></tr>`
                    : ''
                }
                <tr style="border-top: 1px solid #000;">
                  <td class="bold" style="font-size: ${thermal.baseSize}; padding-top: 5px;">TOTAL</td>
                  <td class="val bold" style="font-size: ${thermal.baseSize}; padding-top: 5px;">${formatRupiah(
      grandTotal
    )}</td>
                </tr>
                <tr><td class="wrap">Bayar (${esc(sale.payment_method)})</td><td class="val">${formatRupiah(dp)}</td></tr>
                ${sisa > 0 ? `<tr><td class="bold">SISA</td><td class="val bold">${formatRupiah(sisa)}</td></tr>` : ''}
              </table>
            </div>

            <div class="text-center wrap keep-together" style="margin-top: 20px; font-size: ${thermal.smallSize}; border-top: 1px dashed #000; padding-top: 10px;">
              ${esc(shop.thermal_footer)}
              <div class="bold uppercase" style="margin-top: 5px;">Terima Kasih</div>
            </div>
            <!-- Feed allowance so the auto-cutter never catches the last line of text -->
            <div style="height: 18mm;">&nbsp;</div>
          </div>
        </body>
      </html>
    `;
  }

  // ==========================================================================
  // FAKTUR / DO (DOT MATRIX)
  // ==========================================================================
  const itemColWidths = isDO
    ? ['7%', '43%', '12%', '38%'] // NO, NAMA BARANG, QTY, KONDISI
    : ['6%', '34%', '10%', '22%', '28%']; // NO, NAMA BARANG, QTY, HARGA, TOTAL

  return `
    <html>
      <head><meta charset="utf-8" />${commonStyles}</head>
      <body>
        <div class="doc-container">
          <table class="header-area keep-together">
            <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
            <tr>
              <td style="vertical-align: top;">
                <div class="bold uppercase wrap" style="font-size: 19px;">${esc(shop.shop_name)}</div>
                <div class="wrap" style="font-size: 12.5px; line-height: 1.3;">${esc(shop.shop_address)}</div>
                <div style="font-size: 12.5px;">WA: ${esc(shop.shop_phone)}</div>
              </td>
              <td class="text-right" style="vertical-align: top;">
                <div class="bold" style="font-size: 20px; letter-spacing: 0.5px;">${docTitle}</div>
                <div class="bold" style="font-size: 15px; margin-top: 5px;">#${isDO ? 'DO' : 'INV'}-${esc(sale.id)}</div>
                <div style="font-size: 13px;">${new Date(sale.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}</div>
              </td>
            </tr>
          </table>

          <table class="main-table">
            <colgroup>
              ${itemColWidths.map((w) => `<col style="width:${w}">`).join('')}
            </colgroup>
            <thead>
              <tr>
                <th class="text-center">NO</th>
                <th>NAMA BARANG</th>
                <th class="text-center">QTY</th>
                ${
                  !isDO
                    ? `<th class="text-right">HARGA</th><th class="text-right">TOTAL</th>`
                    : `<th>KONDISI</th>`
                }
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (i, idx) => `
                <tr class="keep-together">
                  <td class="text-center">${idx + 1}</td>
                  <td class="bold uppercase wrap">${esc(i.item_name)}</td>
                  <td class="text-center bold">${esc(i.quantity)}</td>
                  ${
                    !isDO
                      ? `
                    <td class="text-right">${formatRupiah(i.price_at_sale)}</td>
                    <td class="text-right bold">${formatRupiah(
                      i.price_at_sale * i.quantity - (i.discount || 0)
                    )}</td>
                  `
                      : `<td class="uppercase wrap">${esc(i.condition || 'Baik')}</td>`
                  }
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <table class="keep-together" style="margin-top: 20px;">
            <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
            <tr>
              <td style="vertical-align: top; padding-right: 20px; font-size: 12px;">
                <div class="bold uppercase">Keterangan:</div>
                <div class="wrap" style="margin-top: 5px; font-style: italic;">${esc(
                  isDO ? shop.do_footer : shop.invoice_footer
                )}</div>
              </td>
              <td style="vertical-align: top;">
                ${
                  !isDO
                    ? `
                  <table class="doc-summary-table">
                    <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
                    <tr><td>SUBTOTAL</td><td class="val">${formatRupiah(subtotal)}</td></tr>
                    ${
                      totalDiscount > 0
                        ? `<tr><td>DISKON</td><td class="val">-${formatRupiah(totalDiscount)}</td></tr>`
                        : ''
                    }
                    <tr class="grand-total"><td>TOTAL AKHIR</td><td class="val">${formatRupiah(grandTotal)}</td></tr>
                    <tr><td>DIBAYAR</td><td class="val">${formatRupiah(dp)}</td></tr>
                    ${
                      sisa > 0
                        ? `<tr><td class="bold">SISA TEMPO</td><td class="val">${formatRupiah(sisa)}</td></tr>`
                        : ''
                    }
                  </table>
                `
                    : ''
                }
              </td>
            </tr>
          </table>

          <table class="signature-table keep-together">
            <colgroup><col style="width:33.3%"><col style="width:33.3%"><col style="width:33.4%"></colgroup>
            <tr>
              <td class="bold uppercase">PENERIMA</td>
              <td class="bold uppercase">${isDO ? 'SOPIR' : 'GUDANG'}</td>
              <td class="bold uppercase">HORMAT KAMI</td>
            </tr>
            <tr><td class="sig-space"></td><td class="sig-space"></td><td class="sig-space"></td></tr>
            <tr>
              <td>( ............................ )</td>
              <td>( ............................ )</td>
              <td class="bold wrap">( ${esc(shop.shop_name)} )</td>
            </tr>
          </table>
        </div>
      </body>
    </html>
  `;
};