// lib/printing/index.ts
// Public entry point: picks a transport per document (configured transport
// first, then the document's fallback chain) so printing never hard-fails.
// DIALOG is always available and always last, so a result is always produced.

import { generatePrintHtml } from '../printTemplates';
import { buildThermalEscPos } from './escpos';
import { agentTransport } from './transports/agent';
import { dialogTransport } from './transports/dialog';
import { kioskTransport } from './transports/kiosk';
import { webserialTransport } from './transports/webserial';
import { webusbTransport } from './transports/webusb';
import { FALLBACK_CHAINS } from './types';
import type {
  DocType,
  PrintConfig,
  SaleItemLike,
  SaleLike,
  ShopSettings,
  Transport,
  TransportId,
} from './types';

export const TRANSPORTS: Record<TransportId, Transport> = {
  WEBUSB: webusbTransport,
  WEBSERIAL: webserialTransport,
  AGENT: agentTransport,
  KIOSK: kioskTransport,
  DIALOG: dialogTransport,
};

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export async function printDocument(args: {
  docType: DocType;
  settings: ShopSettings;
  sale: SaleLike;
  items: SaleItemLike[];
  config: PrintConfig;
}): Promise<{ ok: boolean; via: TransportId | null; tried: TransportId[] }> {
  const { docType, settings, sale, items, config } = args;
  const cfg = config[docType];

  const html = generatePrintHtml(docType, settings, sale, items);

  const order = dedupe<TransportId>([cfg.transport, ...FALLBACK_CHAINS[docType]]);

  // Only build ESC/POS bytes when a raw transport is actually in play. This
  // avoids loading the encoder for HTML-only paths (DIALOG/KIOSK).
  const needsEscpos =
    docType === 'THERMAL' &&
    order.some((id) => id === 'WEBUSB' || id === 'WEBSERIAL' || id === 'AGENT');
  const escpos = needsEscpos
    ? await buildThermalEscPos(settings, sale, items, cfg.paper || '80mm')
    : null;

  const tried: TransportId[] = [];

  for (const id of order) {
    const t = TRANSPORTS[id];
    if (!t) continue;

    let available = false;
    try {
      available = await t.isAvailable(cfg);
    } catch {
      available = false;
    }
    if (!available) continue;

    tried.push(id);
    try {
      await t.print({ docType, html, escpos, config: cfg });
      return { ok: true, via: id, tried };
    } catch {
      // Try the next transport in the chain.
    }
  }

  return { ok: false, via: null, tried };
}

// Convenience re-exports for the public surface (types, encoder, pairing,
// agent discovery) so callers only import from 'lib/printing'.
export * from './types';
export { buildThermalEscPos } from './escpos';
export { listAgentPrinters, pingAgent } from './transports/agent';
export { pairWebUsb } from './transports/webusb';
export { pairWebSerial } from './transports/webserial';
// Exposed for print previews — exactly the HTML that DIALOG/KIOSK/AGENT print.
export { generatePrintHtml } from '../printTemplates';
// Robust hidden-iframe printer (reused by screens that print custom HTML, e.g.
// the customer statement) — never popup-blocked, silent under --kiosk-printing.
export { printHtmlViaIframe } from './transports/iframePrint';
