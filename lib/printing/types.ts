// lib/printing/types.ts
// Shared contracts for the configurable, fallback-chained printing module.

export type DocType = 'THERMAL' | 'FAKTUR' | 'DO';

export type TransportId = 'WEBUSB' | 'WEBSERIAL' | 'AGENT' | 'KIOSK' | 'DIALOG';

export type PaperProfile = '58mm' | '76mm' | '80mm';

export interface DocConfig {
  transport: TransportId;
  printer?: string;
  paper?: PaperProfile;
}

export interface PrintConfig {
  THERMAL: DocConfig;
  FAKTUR: DocConfig;
  DO: DocConfig;
}

export interface ShopSettings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  thermal_footer: string;
  invoice_footer: string;
  do_footer: string;
  [k: string]: any;
}

export interface SaleLike {
  id: number;
  total_amount: number;
  customer_name: string;
  created_at: string;
  [k: string]: any;
}

export interface SaleItemLike {
  item_name: string;
  quantity: number;
  price_at_sale: number;
  [k: string]: any;
}

export interface PrintJob {
  docType: DocType;
  html: string;
  escpos: Uint8Array | null;
  config: DocConfig;
}

export interface Transport {
  id: TransportId;
  isAvailable(cfg: DocConfig): Promise<boolean>;
  print(job: PrintJob): Promise<void>;
}

// Result of a pairWebSerial / pairWebUsb attempt. `message` is user-facing
// (Bahasa Indonesia) and names the actual failure so it can be toasted as-is —
// a cancelled picker, a missing API, and a driver error must read differently.
export type PairResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'unsupported' | 'insecure' | 'cancelled' | 'error'; message: string };

export const AGENT_URL = 'http://localhost:3001';

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  THERMAL: { transport: 'DIALOG', paper: '76mm' },
  FAKTUR: { transport: 'KIOSK' },
  DO: { transport: 'KIOSK' },
};

export const FALLBACK_CHAINS: Record<DocType, TransportId[]> = {
  THERMAL: ['WEBSERIAL', 'WEBUSB', 'AGENT', 'KIOSK', 'DIALOG'],
  FAKTUR: ['KIOSK', 'AGENT', 'DIALOG'],
  DO: ['KIOSK', 'AGENT', 'DIALOG'],
};

// Monospace text columns per paper width; selectable in Setup so swapping
// paper/printer needs no code change.
export const PAPER_COLUMNS: Record<PaperProfile, number> = {
  '58mm': 32,
  '76mm': 40,
  '80mm': 48,
};
