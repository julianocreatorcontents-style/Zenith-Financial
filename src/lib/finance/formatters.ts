/**
 * Formatadores e utilitários de data/moeda para cálculos financeiros.
 */

export const roundCurrency = (value: number): number => 
  Math.round(value * 100) / 100;

export const formatBRL = (value: number): string => 
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const calculateVariation = (current: number, previous: number): string => {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const v = ((current - previous) / previous) * 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const MONTHS_SHORT = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'
];

export const startOfLocalDay = (date: Date): Date => 
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const endOfLocalDay = (date: Date): Date => 
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

export const addLocalDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const parseDayRange = (value?: string): [number, number] | null => {
  if (!value || value === 'Todos') return null;
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return [Math.max(1, start), Math.min(31, end)];
};
