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