// lib/format.ts
// Shared formatters so currency/locale logic lives in exactly one place.

// Reuse a single Intl instance (constructing one per call is comparatively
// expensive, especially under Hermes).
const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
});

export const formatRupiah = (n: number) => idr.format(Math.round(n) || 0);
