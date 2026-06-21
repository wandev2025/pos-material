// lib/printing/transports/dialog.ts
// The always-available, last-resort transport. On web it prints via a hidden
// iframe (robust, never popup-blocked) which shows the browser's native print
// dialog — or prints silently if the machine runs Chrome/Edge --kiosk-printing.
// On native it uses the OS print sheet via expo-print. Guarantees printDocument
// never hard-fails.

import { Platform } from 'react-native';
import type { DocConfig, PrintJob, Transport } from '../types';
import { printHtmlViaIframe } from './iframePrint';

export const dialogTransport: Transport = {
  id: 'DIALOG',

  async isAvailable(_cfg: DocConfig): Promise<boolean> {
    return true;
  },

  async print(job: PrintJob): Promise<void> {
    if (Platform.OS === 'web') {
      await printHtmlViaIframe(job.html);
      return;
    }
    // Native: defer the expo-print import so it is never pulled into the web
    // bundle's module graph at the top level.
    const Print: any = await import('expo-print');
    await Print.printAsync({ html: job.html });
  },
};
