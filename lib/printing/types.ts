// lib/printing/types.ts
// Shared contracts for the configurable printing system.

export type DocType = 'THERMAL' | 'FAKTUR' | 'DO';

export type TransportId =
  | 'WEBUSB'
  | 'WEBSERIAL'
  | 'AGENT'
  | 'KIOSK'
  | 'DIALOG';

export type PaperProfile =
  | '58mm'
  | '76mm'
  | '80mm';

export interface DocConfig {
  transport: TransportId;

  // Used only by AGENT transport
  printer?: string;

  // Used by thermal receipt
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

  [key: string]: any;
}

export interface SaleLike {
  id: number;
  total_amount: number;
  customer_name: string;
  customer_address?: string; 
  customer_phone?: string;  
  created_at: string;

  payment_method?: string;
  discount?: number;
  down_payment?: number;

  [key: string]: any;
}

export interface SaleItemLike {
  item_name: string;
  quantity: number;
  price_at_sale: number;

  discount?: number;

  [key: string]: any;
}

export interface PrintJob {
  docType: DocType;

  html: string;

  // Used only by WebUSB / WebSerial / Agent
  escpos: Uint8Array | null;

  config: DocConfig;
}

export interface Transport {
  id: TransportId;

  isAvailable(cfg: DocConfig): Promise<boolean>;

  print(job: PrintJob): Promise<void>;
}

export const AGENT_URL = 'http://localhost:3001';

/*
|--------------------------------------------------------------------------
| Default configuration
|--------------------------------------------------------------------------
*/

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  THERMAL: {
    transport: 'WEBSERIAL',
    paper: '76mm',
  },

  FAKTUR: {
    transport: 'KIOSK',
  },

  DO: {
    transport: 'KIOSK',
  },
};

export const FALLBACK_CHAINS: Record<DocType, TransportId[]> = {
  THERMAL: [
    'WEBSERIAL',
    'WEBUSB',
    'AGENT',
    'KIOSK',
    'DIALOG',
  ],

  FAKTUR: [
    'KIOSK',
    'DIALOG',
  ],

  DO: [
    'KIOSK',
    'DIALOG',
  ],
};

/*
|--------------------------------------------------------------------------
| ESC/POS paper columns
|--------------------------------------------------------------------------
*/

export const PAPER_COLUMNS: Record<PaperProfile, number> = {
  '58mm': 32,
  '76mm': 42,
  '80mm': 48,
};

/*
|--------------------------------------------------------------------------
| Paper profile validation
|--------------------------------------------------------------------------
|
| A `PaperProfile` type only exists at compile time. Settings loaded from
| storage/DB/older config versions are untyped at the boundary, so a stale
| value (e.g. '74mm' from a renamed profile) sails through any `as
| PaperProfile` cast unchecked and only fails — or worse, silently falls
| back — deep inside whichever function does the lookup.
|
| Every place that turns "a paper value from settings" into a real
| PaperProfile should go through resolvePaperProfile() instead of casting,
| so there's exactly one definition of "valid" and one place that logs
| when it isn't.
|
*/

export function isPaperProfile(value: unknown): value is PaperProfile {
  return value === '58mm' || value === '76mm' || value === '80mm';
}

export function resolvePaperProfile(value: unknown, context: string): PaperProfile {
  if (isPaperProfile(value)) return value;
  if (value !== undefined && value !== null && value !== '') {
    console.warn(
      `[printing] Invalid paper profile "${String(value)}" for ${context} — falling back to '76mm'.`
    );
  }
  return '76mm';
}