// lib/printing/transports/kiosk.ts
// Prints full-page HTML via a hidden iframe. When Chrome/Edge is launched with
// --kiosk-printing this is fully silent; otherwise it surfaces the normal print
// dialog, which makes it a graceful visible fallback too.

import { Platform } from 'react-native';
import type { DocConfig, PrintJob, Transport } from '../types';
import { printHtmlViaIframe } from './iframePrint';

export const kioskTransport: Transport = {
  id: 'KIOSK',

  async isAvailable(_cfg: DocConfig): Promise<boolean> {
    return Platform.OS === 'web' && typeof document !== 'undefined';
  },

  async print(job: PrintJob): Promise<void> {
    await printHtmlViaIframe(job.html);
  },
};
