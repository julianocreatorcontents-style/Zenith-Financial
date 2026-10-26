export const SPREADSHEET_FIELDS: Record<string, string> = {
  data: 'date', date: 'date', data_evento: 'date', data_da_transacao: 'date',
  data_transacao: 'date', data_compra: 'date', data_de_compra: 'date',
  data_da_compra: 'date', data_pagamento: 'date', data_lancamento: 'date',
  data_movimento: 'date', data_operacao: 'date', competencia: 'date',
  vencimento: 'date', due_date: 'date',
  descricao: 'label', descricao_transacao: 'label', descricao_do_lancamento: 'label',
  titulo: 'label', title: 'label', label: 'label', estabelecimento: 'label',
  historico: 'label', lancamento: 'label', memo: 'label', name: 'label',
  nome: 'label', details: 'label',
  valor: 'value', value: 'value', valor_nominal: 'value', amount: 'value',
  montante: 'value', quantia: 'value', total: 'value', valor_transacao: 'value',
  valor_da_transacao: 'value', valor_total: 'value',
  tipo: 'type', type: 'type', entrada_saida: 'type', natureza: 'type',
  operacao: 'type', transaction_type: 'type', debito_credito: 'type',
  categoria: 'category', categoria_primaria: 'category', categoria_de_gasto: 'category',
  category: 'category', grupo: 'category', classificacao: 'category',
  etiqueta: 'tag', etiqueta_personalizada: 'tag', tag: 'tag', tags: 'tag',
  metodo: 'method', metodo_origem: 'method', method: 'method',
  forma_pagamento: 'method', forma_de_pagamento: 'method', origem: 'method',
  payment_method: 'method',
  status: 'status', situacao: 'status'
};

export function normalizeSpreadsheetKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseSpreadsheetAmount(value: unknown): number {
  if (typeof value === 'number') return value;

  const raw = String(value ?? '').trim();
  if (!raw) return NaN;

  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned) return NaN;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\./g, '');
  } else if (/^\d{1,3}\.\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace('.', '');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  return negative ? -Math.abs(parsed) : parsed;
}

export function parseSpreadsheetDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86400000 + 12 * 3600000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  const dayFirst = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dayFirst) {
    let year = Number(dayFirst[3]);
    if (year < 100) year += 2000;
    const month = Number(dayFirst[2]);
    const day = Number(dayFirst[1]);
    const date = new Date(year, month - 1, day, 12);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) return date;
    return undefined;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    const date = new Date(year, month - 1, day, 12);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) return date;
    return undefined;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseSpreadsheetType(value: unknown): string {
  const key = normalizeSpreadsheetKey(String(value ?? ''));
  if (!key) return 'out';

  if (['in', 'entrada', 'entradas', 'receita', 'receitas', 'credito', 'creditos', 'credit', 'ganho'].includes(key)) return 'in';
  if (['out', 'saida', 'saidas', 'despesa', 'despesas', 'debito', 'debitos', 'debit', 'gasto', 'gastos'].includes(key)) return 'out';
  if (['yield', 'rendimento', 'rendimentos', 'investimento', 'investimentos'].includes(key)) return 'yield';

  return String(value ?? '').trim();
}

export function parseSpreadsheetStatus(value: unknown): string | undefined {
  const key = normalizeSpreadsheetKey(String(value ?? ''));
  if (!key) return undefined;
  if (['futuro', 'future', 'pendente', 'pending', 'agendado', 'scheduled'].includes(key)) return 'Futuro';
  if (['confirmado', 'confirmed', 'pago', 'paid', 'concluido', 'completed', 'efetivado'].includes(key)) return 'Confirmado';
  return String(value ?? '').trim();
}

export function mapSpreadsheetRow(row: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};

  Object.entries(row).forEach(([key, value]) => {
    const field = SPREADSHEET_FIELDS[normalizeSpreadsheetKey(key)];
    if (!field || value === null || value === undefined || value === '') return;
    if (mapped[field] === undefined || mapped[field] === '') mapped[field] = value;
  });

  const text = (value: unknown) => {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  };

  const amount = parseSpreadsheetAmount(mapped.value);

  return {
    label: String(mapped.label ?? '').trim(),
    value: Math.abs(amount),
    type: parseSpreadsheetType(mapped.type),
    date: parseSpreadsheetDate(mapped.date),
    categoria_primaria: text(mapped.category),
    etiqueta_personalizada: text(mapped.tag),
    metodo_origem: text(mapped.method),
    status: parseSpreadsheetStatus(mapped.status)
  };
}
