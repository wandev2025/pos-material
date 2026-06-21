// lib/printing/transports/webusb.ts
// Silent raw ESC/POS over WebUSB, implemented directly on navigator.usb so we
// own the reconnect-by-serial flow (the "recognise the device and print
// immediately" path) and carry no third-party dependency. Inspired by the
// MIT-licensed @point-of-sale/webusb-receipt-printer (Niels Leenheer).
// Chromium desktop/Android only; requires a secure context (HTTPS or localhost).

import { Platform } from 'react-native';
import { getPairedDevice, savePairedDevice } from '../../printerStore';
import type { DocConfig, PrintJob, Transport } from '../types';

const PRINTER_CLASS = 0x07; // USB base class for printers

function usbAvailable(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as any).usb;
}

// A stored id is either the device serial number (preferred) or "vendor:product"
// when the printer reports no serial. Match against both so either form works.
function deviceMatches(device: any, stored: string): boolean {
  if (device?.serialNumber && device.serialNumber === stored) return true;
  return `${device?.vendorId}:${device?.productId}` === stored;
}

async function findPairedDevice(): Promise<any | null> {
  const stored = await getPairedDevice('WEBUSB');
  if (!stored) return null;
  const devices: any[] = await (navigator as any).usb.getDevices();
  return (Array.isArray(devices) ? devices : []).find(d => deviceMatches(d, stored)) ?? null;
}

// Open the device and locate a bulk OUT endpoint on a printer-class interface
// (falling back to the first interface that exposes one).
async function openForWrite(device: any): Promise<{ interfaceNumber: number; endpoint: number }> {
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  const interfaces: any[] = device.configuration?.interfaces ?? [];
  const candidates = [...interfaces.filter(i => i.alternate?.interfaceClass === PRINTER_CLASS), ...interfaces];
  for (const iface of candidates) {
    const ep = (iface.alternate?.endpoints ?? []).find((e: any) => e.direction === 'out' && e.type === 'bulk');
    if (ep) {
      await device.claimInterface(iface.interfaceNumber);
      return { interfaceNumber: iface.interfaceNumber, endpoint: ep.endpointNumber };
    }
  }
  throw new Error('webusb: no bulk OUT endpoint found');
}

export const webusbTransport: Transport = {
  id: 'WEBUSB',

  async isAvailable(_cfg: DocConfig): Promise<boolean> {
    try {
      if (!usbAvailable()) return false;
      return !!(await findPairedDevice());
    } catch {
      return false;
    }
  },

  async print(job: PrintJob): Promise<void> {
    if (!job.escpos) throw new Error('webusb: no ESC/POS data');
    if (!usbAvailable()) throw new Error('webusb: unavailable');

    const device = await findPairedDevice();
    if (!device) throw new Error('webusb: no paired device');

    const { interfaceNumber, endpoint } = await openForWrite(device);
    try {
      await device.transferOut(endpoint, job.escpos);
    } finally {
      try {
        await device.releaseInterface(interfaceNumber);
      } catch {
        /* ignore */
      }
      try {
        await device.close();
      } catch {
        /* ignore */
      }
    }
  },
};

// Must be invoked from a user gesture: shows the browser device picker, then
// stores the device's serial (or "vendor:product") for silent reconnects later.
export async function pairWebUsb(): Promise<string | null> {
  try {
    if (!usbAvailable()) return null;
    const device = await (navigator as any).usb.requestDevice({
      filters: [{ classCode: PRINTER_CLASS }],
    });
    if (!device) return null;
    const id = device.serialNumber || `${device.vendorId}:${device.productId}`;
    await savePairedDevice('WEBUSB', id);
    return id;
  } catch {
    return null;
  }
}
