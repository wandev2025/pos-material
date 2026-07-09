// lib/printing/transports/webserial.ts

import { Platform } from 'react-native';
import { getPairedDevice, savePairedDevice } from '../../printerStore';
import type { DocConfig, PrintJob, Transport } from '../types';

const BAUD_RATE = 9600;

function serialAvailable(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    'serial' in navigator
  );
}

function keyFor(info: any): string {
  return `${info?.usbVendorId ?? ''}:${info?.usbProductId ?? ''}`;
}

async function findPairedPort(): Promise<any | null> {
  const serial: any = (navigator as any).serial;

  const stored = await getPairedDevice('WEBSERIAL');

  const ports = await serial.getPorts();

  console.log('========== WEBSERIAL ==========');
  console.log('Stored Device:', stored);
  console.log('Granted Ports:', ports.length);

  for (const port of ports) {
    try {
      const info = port.getInfo();
      console.log('Port:', info);

      if (stored && keyFor(info) === stored) {
        console.log('Matched paired device');
        return port;
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (ports.length === 1) {
    console.log('Using only granted port.');
    return ports[0];
  }

  return null;
}

export const webserialTransport: Transport = {
  id: 'WEBSERIAL',

  async isAvailable(_cfg: DocConfig): Promise<boolean> {
    try {
      if (!serialAvailable()) return false;

      return !!(await findPairedPort());
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  async print(job: PrintJob): Promise<void> {
    if (!serialAvailable())
      throw new Error('WebSerial is not supported.');

    if (!job.escpos)
      throw new Error('No ESC/POS data generated.');

    const port = await findPairedPort();

    if (!port)
      throw new Error('No paired serial printer found.');

    console.log('Opening serial port...');

    await port.open({
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });

    try {
      if (!port.writable) {
        throw new Error('Serial port is not writable.');
      }

      const writer = port.writable.getWriter();

      try {
        console.log('Sending', job.escpos.length, 'bytes');

        await writer.write(job.escpos);

        console.log('Print data sent.');
      } finally {
        writer.releaseLock();
      }
    } finally {
      try {
        await port.close();
        console.log('Serial port closed.');
      } catch (err) {
        console.warn('Unable to close port.', err);
      }
    }
  },
};

export async function pairWebSerial(): Promise<string | null> {
  try {
    if (!serialAvailable()) return null;

    const serial: any = (navigator as any).serial;

    const port = await serial.requestPort();

    if (!port) return null;

    const info = port.getInfo();

    const id = keyFor(info);

    console.log('Paired device:', id);

    await savePairedDevice('WEBSERIAL', id);

    return id;
  } catch (err) {
    console.error(err);
    return null;
  }
}