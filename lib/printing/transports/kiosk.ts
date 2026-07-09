import type { PrintJob, Transport } from '../types';
import { printHtmlViaIframe } from './iframePrint';

export const kioskTransport: Transport = {
  id: 'KIOSK',

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined';
  },

  async print(job: PrintJob): Promise<void> {
    await printHtmlViaIframe(job.html);
  },
};