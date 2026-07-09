import { Platform } from 'react-native';
import type { PrintJob, Transport } from '../types';
import { printHtmlViaIframe } from './iframePrint';

export const dialogTransport: Transport = {
  id: 'DIALOG',

  async isAvailable(): Promise<boolean> {
    return true;
  },

  async print(job: PrintJob): Promise<void> {
    if (Platform.OS === 'web') {
      await printHtmlViaIframe(job.html);
      return;
    }

    const Print: any = await import('expo-print');

    await Print.printAsync({
      html: job.html,
    });
  },
};