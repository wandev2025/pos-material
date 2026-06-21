// lib/printing/transports/webserial.ts
// Silent raw ESC/POS over Web Serial, implemented directly on navigator.serial.
// Serial exposes no serial number, so the paired port is keyed by
// "usbVendorId:usbProductId". On Windows this avoids the WinUSB driver swap that
// WebUSB requires (a COM/serial-class printer is reached through the OS serial
// driver). Inspired by the MIT-licensed @point-of-sale/webserial-receipt-printer.
// Chromium desktop only; requires a secure context (HTTPS or localhost).

import { Platform } from 'react-native';
import { getPairedDevice, savePairedDevice } from '../../printerStore';
import type { DocConfig, PrintJob, Transport } from '../types';

const BAUD_RATE = 9600;

function serialAvailable(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as any).serial;
}

function keyFor(info: any): string {
  return `${info?.usbVendorId ?? ''}:${info?.usbProductId ?? ''}`;
}

async function findPairedPort(): Promise<any | null> {
  const stored = await getPairedDevice('WEBSERIAL');
  if (!stored) return null;
  const ports: any[] = await (navigator as any).serial.getPorts();
  if (!Array.isArray(ports) || ports.length === 0) return null;
  const exact = ports.find(p => {
    try {
      return keyFor(p.getInfo()) === stored;
    } catch {
      return false;
    }
  });
  // Fall back to the sole granted port if vendor/product can't be read.
  return exact ?? (ports.length === 1 ? ports[0] : null);
}

export const webserialTransport: Transport = {
  id: 'WEBSERIAL',

  async isAvailable(_cfg: DocConfig): Promise<boolean> {
    try {
      if (!serialAvailable()) return false;
      return !!(await findPairedPort());
    } catch {
      return false;
    }
  },

  async print(job: PrintJob): Promise<void> {
    if (!job.escpos) throw new Error('webserial: no ESC/POS data');
    if (!serialAvailable()) throw new Error('webserial: unavailable');

    const port = await findPairedPort();
    if (!port) throw new Error('webserial: no paired device');

    await port.open({ baudRate: BAUD_RATE });
    try {
      const writer = port.writable.getWriter();
      try {
        await writer.write(job.escpos);
      } finally {
        try {
          writer.releaseLock();
        } catch {
          /* ignore */
        }
      }
    } finally {
      try {
        await port.close();
      } catch {
        /* ignore */
      }
    }
  },
};

// Must be invoked from a user gesture: shows the serial-port picker, then stores
// "vendorId:productId" for silent reconnects later.
export async function pairWebSerial(): Promise<string | null> {
  try {
    if (!serialAvailable()) return null;
    const port = await (navigator as any).serial.requestPort();
    if (!port) return null;
    const id = keyFor(port.getInfo());
    await savePairedDevice('WEBSERIAL', id);
    return id;
  } catch {
    return null;
  }
}
