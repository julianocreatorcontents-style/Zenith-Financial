/**
 * Parsers de transações e datas financeiras.
 * Segue tipagem estrita sem o uso de `any`.
 */

export const parseTransactionAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.abs(value) : 0;
  if (!value) return 0;
  const str = String(value).trim();
  const cleaned = str.replace(/[R$\s]/g, '');
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    const num = parseFloat(cleaned.replace(',', '.'));
    return Number.isFinite(num) ? Math.abs(num) : 0;
  }
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const num = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(num) ? Math.abs(num) : 0;
  }
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? Math.abs(num) : 0;
};

export const parseTransactionDate = (value: unknown): Date | null => {
  if (!value) return null;
  // String "YYYY-MM-DD": parsear em LOCAL (evita shift UTC→BRT de 3h)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (y !== undefined && m !== undefined && d !== undefined) {
      return new Date(y, m - 1, d);
    }
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => unknown }).toDate === 'function') {
    const d = (value as { toDate: () => unknown }).toDate();
    if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  }
  
  // Firestore Timestamp serializado: seconds ou _seconds
  const record = value as Record<string, unknown>;
  const seconds = typeof record?.seconds === 'number'
    ? record.seconds
    : (typeof record?._seconds === 'number' ? record._seconds : null);
  if (seconds !== null) {
    const d = new Date(seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    const d = value > 1e11 ? new Date(value) : new Date(value * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const str = value.trim();
    if (!str) return null;

    // Formato brasileiro DD/MM/YYYY ou DD-MM-YYYY
    const brMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(str);
    if (brMatch) {
      const day = parseInt(brMatch[1] ?? '', 10);
      const month = parseInt(brMatch[2] ?? '', 10) - 1;
      let year = parseInt(brMatch[3] ?? '', 10);
      if (year < 100) year += 2000;
      const d = new Date(year, month, day, 12, 0, 0);
      if (!Number.isNaN(d.getTime())) return d;
    }

    // Formato ISO YYYY-MM-DD
    const normalized = str.includes('T') ? str : `${str}T12:00:00`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
};
