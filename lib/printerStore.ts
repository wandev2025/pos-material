// lib/printerStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = '@pos_default_printer';

export type PrinterType = 'NONE' | 'THERMAL' | 'FAKTUR' | 'DO';

export const saveDefaultPrinter = async (type: PrinterType) => {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, type);
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, type);
  }
};

export const getDefaultPrinter = async (): Promise<PrinterType> => {
  if (Platform.OS === 'web') {
    return (localStorage.getItem(STORAGE_KEY) as PrinterType) || 'NONE';
  }
  const val = await AsyncStorage.getItem(STORAGE_KEY);
  return (val as PrinterType) || 'NONE';
};

// --- Paired WebUSB / WebSerial devices (machine-local, NOT shop-wide) ---
// WebUSB stores the device serialNumber; WebSerial stores "vendorId:productId".
export type PairedKind = 'WEBUSB' | 'WEBSERIAL';

const pairedKey = (kind: PairedKind) => `@pos_paired_device_${kind}`;

export const savePairedDevice = async (kind: PairedKind, serial: string) => {
  if (Platform.OS === 'web') {
    localStorage.setItem(pairedKey(kind), serial);
  } else {
    await AsyncStorage.setItem(pairedKey(kind), serial);
  }
};

export const getPairedDevice = async (kind: PairedKind): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return localStorage.getItem(pairedKey(kind));
  }
  return AsyncStorage.getItem(pairedKey(kind));
};

export const clearPairedDevice = async (kind: PairedKind): Promise<void> => {
  if (Platform.OS === 'web') {
    localStorage.removeItem(pairedKey(kind));
  } else {
    await AsyncStorage.removeItem(pairedKey(kind));
  }
};