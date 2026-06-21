const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

// Escape user-provided strings before injecting them into print HTML so that
// names containing <, >, & or quotes can't break layout or inject markup.
const esc = (value: any): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

export const generatePrintHtml = (type: 'THERMAL' | 'FAKTUR' | 'DO', settings: any, sale: any, items: any[]) => {
  const shop = settings || { shop_name: 'TOKO', shop_address: '', shop_phone: '' };

  // sale.total_amount is already NET of all discounts. Show a Subtotal/Diskon
  // breakdown only when a discount was actually applied.
  const gross = items.reduce((a, i) => a + i.price_at_sale * i.quantity, 0);
  const totalDiscount = Math.max(0, Math.round(gross - (sale.total_amount || 0)));
  const hasDiscount = totalDiscount > 0;

  // SHARED STYLES (Based on your Component Styles)
  const commonStyles = `
    <style>
      body { font-family: 'Courier New', Courier, monospace; color: #1E293B; margin: 0; padding: 0; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .bold { font-weight: bold; }
      .italic { font-style: italic; }
      table { width: 100%; border-collapse: collapse; }
      .divider { border-top: 1px dashed #000; margin: 10px 0; }
      
      /* THERMAL STYLE */
      .thermal-container { width: 80mm; padding: 5mm; margin: auto; }
      .thermal-brand { font-size: 20px; font-weight: 900; }
      .thermal-address { font-size: 12px; }
      
      /* DOT MATRIX STYLE (FAKTUR & DO) */
      .dot-matrix { width: 210mm; min-height: 140mm; padding: 10mm; border: 1px solid #CBD5E1; margin: auto; position: relative; }
      .doc-header { display: flex; justify-content: space-between; border-bottom: 2px solid #1E293B; padding-bottom: 10px; margin-bottom: 20px; }
      .doc-type { font-size: 28px; font-weight: 900; letter-spacing: 2px; }
      .table-bordered { border: 1px solid #1E293B; }
      .table-bordered th { background: #F8FAFC; border-bottom: 1px solid #1E293B; padding: 8px; font-size: 12px; }
      .table-bordered td { padding: 8px; font-size: 12px; border-bottom: 1px solid #E2E8F0; }
      .signature-row { display: flex; justify-content: space-between; margin-top: 40px; }
      .sign-area { width: 150px; text-align: center; }
      .sign-line { border-bottom: 1px solid #000; margin-top: 50px; }
    </style>
  `;

  if (type === 'THERMAL') {
    return `
      <html>
        ${commonStyles}
        <body>
          <div class="thermal-container">
            <div class="text-center">
              <div class="thermal-brand">${esc(shop.shop_name)}</div>
              <div class="thermal-address">${esc(shop.shop_address)}</div>
              <div class="thermal-address">Telp: ${esc(shop.shop_phone)}</div>
            </div>
            <div class="divider"></div>
            <div style="font-size: 12px; margin-bottom: 5px;">
              No: #${sale.id} | ${new Date(sale.created_at).toLocaleString()}
            </div>
            <table>
              ${items
                .map(
                  i => `
                <tr>
                  <td style="font-size: 12px;">${i.quantity}x ${esc(i.item_name)}</td>
                  <td class="text-right" style="font-size: 12px;">${formatRupiah(i.price_at_sale * i.quantity)}</td>
                </tr>
              `
                )
                .join('')}
            </table>
            <div class="divider"></div>
            ${
              hasDiscount
                ? `
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>Subtotal</span><span>${formatRupiah(gross)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>Diskon</span><span>- ${formatRupiah(totalDiscount)}</span>
              </div>
            `
                : ''
            }
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>TOTAL</span>
              <span>${formatRupiah(sale.total_amount)}</span>
            </div>
            <div class="divider"></div>
            <div class="text-center italic" style="font-size: 11px;">${esc(shop.thermal_footer)}</div>
          </div>
        </body>
      </html>
    `;
  }

  const isDO = type === 'DO';
  const themeColor = isDO ? '#059669' : '#1E40AF';
  const title = isDO ? 'SURAT JALAN' : 'FAKTUR';

  return `
    <html>
      ${commonStyles}
      <body>
        <div class="dot-matrix" style="border-color: ${themeColor}">
          <div class="doc-header">
            <div>
              <div style="font-size: 22px; font-weight: 900;">${esc(shop.shop_name)}</div>
              <div style="font-size: 12px;">${esc(shop.shop_address)}</div>
              <div style="font-size: 12px;">WA: ${esc(shop.shop_phone)}</div>
            </div>
            <div class="text-right">
              <div class="doc-type" style="color: ${themeColor}">${title}</div>
              <div style="font-size: 11px; font-weight: bold;">No: ${isDO ? 'DO' : 'INV'}/${sale.id}</div>
              <div style="font-size: 11px;">Tgl: ${new Date(sale.created_at).toLocaleDateString()}</div>
              <div style="font-size: 11px;">Kepada: ${esc(sale.customer_name)}</div>
            </div>
          </div>

          <table class="table-bordered">
            <thead>
              <tr>
                <th width="30">No</th>
                <th align="left">Nama Barang</th>
                <th width="80">Qty</th>
                ${!isDO ? `<th width="120" align="right">Harga</th><th width="120" align="right">Subtotal</th>` : `<th width="100">Satuan</th>`}
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (i, idx) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td>${esc(i.item_name)}</td>
                  <td class="text-center">${i.quantity}</td>
                  ${
                    !isDO
                      ? `
                    <td class="text-right">${formatRupiah(i.price_at_sale)}</td>
                    <td class="text-right">${formatRupiah(i.price_at_sale * i.quantity)}</td>
                  `
                      : `
                    <td class="text-center">-</td>
                  `
                  }
                </tr>
              `
                )
                .join('')}
              <tr style="height: 100px;"><td></td><td></td><td></td>${!isDO ? '<td></td><td></td>' : '<td></td>'}</tr>
            </tbody>
          </table>

          <div style="display: flex; margin-top: 15px;">
            <div style="flex: 1.5; font-size: 11px; font-style: italic;">
              Ket: ${esc(isDO ? shop.do_footer : shop.invoice_footer)}
            </div>
            ${
              !isDO
                ? `
              <div style="flex: 1; text-align: right;">
                ${
                  hasDiscount
                    ? `
                  <div style="display: flex; justify-content: flex-end; gap: 20px; font-size: 12px;">
                    <span>Subtotal</span><span>${formatRupiah(gross)}</span>
                  </div>
                  <div style="display: flex; justify-content: flex-end; gap: 20px; font-size: 12px;">
                    <span>Diskon</span><span>- ${formatRupiah(totalDiscount)}</span>
                  </div>
                `
                    : ''
                }
                <div style="display: flex; justify-content: flex-end; gap: 20px;">
                  <span class="bold">TOTAL</span>
                  <span class="bold" style="font-size: 16px;">${formatRupiah(sale.total_amount)}</span>
                </div>
              </div>
            `
                : ''
            }
          </div>

          <div class="signature-row">
            <div class="sign-area"><div>Penerima</div><div class="sign-line"></div></div>
            <div class="sign-area"><div>${isDO ? 'Sopir' : 'Gudang'}</div><div class="sign-line"></div></div>
            <div class="sign-area"><div>Hormat Kami</div><div class="sign-line"></div></div>
          </div>
        </div>
      </body>
    </html>
  `;
};
