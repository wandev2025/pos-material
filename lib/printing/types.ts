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
|
| THERMAL
|   → Epson TM-U220 (WebSerial)
|
| FAKTUR
|   → Epson LX-310 (Chrome/Edge kiosk printing)
|
| DO
|   → Epson LX-310 (Chrome/Edge kiosk printing)
|
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

/*
|--------------------------------------------------------------------------
| Transport fallback order
|--------------------------------------------------------------------------
|
| THERMAL:
|   WebSerial
|      ↓
|   WebUSB
|      ↓
|   Agent
|      ↓
|   Kiosk
|      ↓
|   Dialog
|
| Faktur / DO:
|   Kiosk
|      ↓
|   Dialog
|
*/

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