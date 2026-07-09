// types/escpos-shims.d.ts
// Ambient module shim so the project type-checks even before the optional
// Chromium-only ESC/POS encoder package is installed. It is imported lazily
// (dynamic import) and guarded at runtime. The WebUSB/WebSerial transports are
// implemented directly on navigator.usb / navigator.serial (no package).

declare module '@point-of-sale/receipt-printer-encoder';
