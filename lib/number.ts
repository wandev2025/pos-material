// Robust numeric parser: strips currency symbols / thousand separators and
// guards against NaN so junk input can never reach the database.
export const parseNum = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
