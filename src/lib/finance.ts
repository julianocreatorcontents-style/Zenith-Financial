/**
 * @Agente02 - Builder
 * Funções puras para cálculos financeiros e formatação de dados.
 * Segue o princípio de Responsabilidade Única (SRP).
 */

export const calculateRealProfitability = (nominalRate: number, inflationRate: number) => {
  // Formula: ((1 + r_nominal) / (1 + i)) - 1
  return ((1 + nominalRate / 100) / (1 + inflationRate / 100)) - 1;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export const parseTransactionAmount = (value: any): number => {
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

export const parseTransactionDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp serializado: seconds ou _seconds
  const seconds = typeof value?.seconds === 'number'
    ? value.seconds
    : (typeof value?._seconds === 'number' ? value._seconds : null);
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
      const day = parseInt(brMatch[1], 10);
      const month = parseInt(brMatch[2], 10) - 1;
      let year = parseInt(brMatch[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(year, month, day, 12, 0, 0);
      if (!Number.isNaN(d.getTime())) return d;
    }

    // Formato ISO YYYY-MM-DD
    const normalized = str.includes('T') ? str : `${str}T12:00:00`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const isExpenseTransaction = (tx: any): boolean => {
  const type = String(tx?.type ?? '').toLowerCase().trim();
  if (type === 'out' || type === 'saida' || type === 'saída' || type === 'despesa' || type === 'debito') {
    return true;
  }
  if (type === 'in' || type === 'entrada' || type === 'receita' || type === 'credito' || type === 'yield' || type === 'rendimento') {
    return false;
  }
  // Inferência para transações sem type explícito
  const cat = String(tx?.categoria_primaria || tx?.category || '').toLowerCase();
  if (['moradia', 'energia', 'água', 'agua', 'alimentação', 'alimentacao', 'mercado', 'transporte', 'lazer', 'saúde', 'saude', 'educação', 'educacao', 'outros'].includes(cat)) {
    return true;
  }
  const lbl = String(tx?.label || '').toLowerCase();
  if (lbl.includes('copel') || lbl.includes('fatura') || lbl.includes('conta') || lbl.includes('compra') || lbl.includes('pagamento') || lbl.includes('débito') || lbl.includes('debito')) {
    return true;
  }
  return false;
};

export const isIncomeTransaction = (tx: any): boolean => {
  const type = String(tx?.type ?? '').toLowerCase().trim();
  if (type === 'in' || type === 'entrada' || type === 'receita' || type === 'credito') {
    return true;
  }
  if (type === 'out' || type === 'saida' || type === 'saída' || type === 'despesa' || type === 'debito' || type === 'yield' || type === 'rendimento') {
    return false;
  }
  const cat = String(tx?.categoria_primaria || tx?.category || '').toLowerCase();
  if (['salário', 'salario', 'receita', 'ganho'].includes(cat)) {
    return true;
  }
  const lbl = String(tx?.label || '').toLowerCase();
  if (lbl.includes('salário') || lbl.includes('salario') || lbl.includes('pix recebido') || lbl.includes('depósito') || lbl.includes('deposito')) {
    return true;
  }
  return false;
};

export const isYieldTransaction = (tx: any): boolean => {
  const type = String(tx?.type ?? '').toLowerCase().trim();
  if (type === 'yield' || type === 'rendimento') {
    return true;
  }
  const cat = String(tx?.categoria_primaria || tx?.category || '').toLowerCase();
  return cat === 'investimentos' || cat === 'rendimentos';
};

export const calculateTotalAssets = (assets: any[] = []) => {
  return roundCurrency(assets.reduce((acc, asset) => acc + (Number(asset?.value) || 0), 0));
};

export const calculateMonthBalance = (
  transactions: any[] = [],
  month: number = new Date().getMonth(),
  year: number = new Date().getFullYear()
) => {
  let balance = 0;

  transactions.forEach((transaction) => {
    const rawDate = transaction?.date || transaction?.createdAt || transaction?.timestamp || transaction?.data;
    const date = parseTransactionDate(rawDate);
    if (!date) return;
    if (date.getMonth() !== month || date.getFullYear() !== year) return;

    const value = parseTransactionAmount(transaction?.value);
    if (isExpenseTransaction(transaction)) {
      balance -= value;
    } else if (isIncomeTransaction(transaction) || isYieldTransaction(transaction)) {
      balance += value;
    }
  });

  return roundCurrency(balance);
};

/**
 * Single source of truth for net worth:
 * Total de ativos consolidados + saldo de transações não aplicadas diretamente às contas no mês.
 */
export const calculateNetWorth = (
  assets: any[] = [],
  transactions: any[] = [],
  month: number = new Date().getMonth(),
  year: number = new Date().getFullYear()
) => {
  const totalAssets = calculateTotalAssets(assets);

  let unappliedBalance = 0;
  transactions.forEach((transaction) => {
    const rawDate = transaction?.date || transaction?.createdAt || transaction?.timestamp || transaction?.data;
    const date = parseTransactionDate(rawDate);
    if (!date) return;
    if (date.getMonth() !== month || date.getFullYear() !== year) return;

    // Se a transação já foi aplicada a um ativo específico, o saldo já está em totalAssets
    const isAppliedToAsset = Boolean(transaction?.applied && transaction?.assetId);
    if (!isAppliedToAsset) {
      const value = parseTransactionAmount(transaction?.value);
      if (isExpenseTransaction(transaction)) {
        unappliedBalance -= value;
      } else if (isIncomeTransaction(transaction) || isYieldTransaction(transaction)) {
        unappliedBalance += value;
      }
    }
  });

  return roundCurrency(totalAssets + unappliedBalance);
};

export const calculateTotals = (transactions: any[], month: number, year: number, assets: any[] = []) => {
  const filtered = transactions.filter(t => {
    const rawDate = t?.date || t?.createdAt || t?.timestamp || t?.data;
    const d = parseTransactionDate(rawDate);
    if (!d) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  });
  
  const sum = (acc: number, val: number) => Math.round((acc + val) * 100) / 100;

  const investmentTotal = assets
    .filter(a => a.type === 'investment')
    .reduce((acc, a) => sum(acc, Number(a.value) || 0), 0);

  return {
    in: filtered.filter(t => isIncomeTransaction(t)).reduce((acc, t) => sum(acc, parseTransactionAmount(t.value)), 0),
    out: filtered.filter(t => isExpenseTransaction(t)).reduce((acc, t) => sum(acc, parseTransactionAmount(t.value)), 0),
    yield: filtered.filter(t => isYieldTransaction(t)).reduce((acc, t) => sum(acc, parseTransactionAmount(t.value)), 0),
    investments: investmentTotal
  };
};

export const calculateVariation = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const v = ((current - previous) / previous) * 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

export const getMiniChartData = (transactions: any[], type: string) => {
  const isOut = type === 'out';
  const isIn = type === 'in';
  const filtered = transactions
    .filter(t => isOut ? isExpenseTransaction(t) : (isIn ? isIncomeTransaction(t) : isYieldTransaction(t)))
    .slice(0, 10)
    .reverse();

  if (filtered.length === 0) return [];
  const points = filtered.map(t => ({ v: parseTransactionAmount(t.value) }));
  // Garante que o Recharts consiga desenhar uma linha/área mesmo com apenas 1 lançamento
  if (points.length === 1) {
    return [{ v: 0 }, points[0]];
  }
  return points;
};

export type EvolutionChartFilter = {
  period?: string;
  month?: string;
  day?: string;
};

type EvolutionPoint = {
  name: string;
  value: number | null;
  predicted?: number;
  date: string;
};

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const addLocalDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseDayRange = (value?: string): [number, number] | null => {
  if (!value || value === 'Todos') return null;
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return [Math.max(1, start), Math.min(31, end)];
};

export const calculateEvolutionData = (
  assets: any[] = [],
  transactions: any[] = [],
  filter?: EvolutionChartFilter
): EvolutionPoint[] => {
  const now = new Date();
  const today = startOfLocalDay(now);
  const period = filter?.period || 'Meses';
  const monthName = (filter?.month || '').trim();
  const selectedMonth = MONTHS_PT.findIndex(month => month.toLowerCase() === monthName.toLowerCase());

  let anchorYear = now.getFullYear();
  let anchorMonth = now.getMonth();
  if (selectedMonth >= 0) {
    anchorMonth = selectedMonth;
    if (anchorMonth > now.getMonth()) anchorYear -= 1;
  }

  const monthStart = new Date(anchorYear, anchorMonth, 1);
  const monthEnd = new Date(anchorYear, anchorMonth + 1, 0);
  const isCurrentMonth = anchorYear === now.getFullYear() && anchorMonth === now.getMonth();
  const lastDate = isCurrentMonth ? today : monthEnd;

  const totalAssets = calculateTotalAssets(assets);

  if (period === 'Anos') {
    const points: EvolutionPoint[] = [];
    for (let offset = 11; offset >= 0; offset--) {
      const monthDate = new Date(anchorYear, anchorMonth - offset, 1);
      const m = monthDate.getMonth();
      const y = monthDate.getFullYear();
      points.push({
        name: `${MONTHS_SHORT[m]}/${String(y).slice(-2)}`,
        value: calculateNetWorth(assets, transactions, m, y),
        date: `${MONTHS_PT[m]} de ${y}`
      });
    }
    return points;
  }

  // Filtrar apenas as transações pertencentes ao mês e ano âncora (ex: Outubro/2026)
  const monthTransactions = transactions
    .map(transaction => {
      const rawDate = transaction?.date || transaction?.createdAt || transaction?.timestamp || transaction?.data;
      const date = parseTransactionDate(rawDate);
      if (!date) return null;
      if (date.getFullYear() !== anchorYear || date.getMonth() !== anchorMonth) return null;
      const value = parseTransactionAmount(transaction?.value);
      const flow = isExpenseTransaction(transaction)
        ? -value
        : isIncomeTransaction(transaction) || isYieldTransaction(transaction)
          ? value
          : 0;
      const isAppliedToAsset = Boolean(transaction?.applied && transaction?.assetId);
      return { date, flow, isAppliedToAsset };
    })
    .filter((item): item is { date: Date; flow: number; isAppliedToAsset: boolean } => item !== null);

  // Valor do patrimônio no dia especificado:
  // Se a transação já foi aplicada a um ativo, ela já está refletida no saldo atual totalAssets.
  // Portanto, para dias anteriores ao evento, revertemos o fluxo que ocorreu depois daquele dia.
  // Para transações ainda não aplicadas aos ativos, somamos os fluxos ocorridos até aquele dia.
  const valueAt = (date: Date) => {
    const cutoff = endOfLocalDay(date).getTime();

    const futureAppliedFlow = monthTransactions
      .filter(t => t.isAppliedToAsset && t.date.getTime() > cutoff)
      .reduce((sum, t) => sum + t.flow, 0);

    const accumulatedUnappliedFlow = monthTransactions
      .filter(t => !t.isAppliedToAsset && t.date.getTime() <= cutoff)
      .reduce((sum, t) => sum + t.flow, 0);

    return roundCurrency(totalAssets - futureAppliedFlow + accumulatedUnappliedFlow);
  };

  let start = monthStart;
  let end = lastDate;

  if (period === 'Semanas') {
    start = addLocalDays(lastDate, -6);
    end = lastDate;
  } else {
    const dayRange = parseDayRange(filter?.day);
    if (dayRange) {
      start = new Date(anchorYear, anchorMonth, dayRange[0]);
      end = new Date(anchorYear, anchorMonth, Math.min(dayRange[1], monthEnd.getDate()));
    }
    if (end.getTime() > lastDate.getTime()) end = lastDate;
  }

  if (start.getTime() > end.getTime()) return [];

  const points: EvolutionPoint[] = [];
  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor = addLocalDays(cursor, 1)) {
    const day = cursor.getDate().toString().padStart(2, '0');
    points.push({
      name: day,
      value: valueAt(cursor),
      date: `${day} de ${MONTHS_SHORT[cursor.getMonth()]}`
    });
  }

  const canProject = lastDate.getTime() === today.getTime() && points.length > 0;
  if (canProject) {
    const lastPeriodPoint = points[points.length - 1];
    const lastValue = lastPeriodPoint?.value;
    if (typeof lastValue === 'number') {
      const lookback = Math.min(7, points.length - 1);
      const previousValue = points[points.length - 1 - lookback]?.value;
      const dailyChange = lookback > 0 && typeof previousValue === 'number'
        ? (lastValue - previousValue) / lookback
        : 0;

      for (let offset = 1; offset <= 5; offset++) {
        const projectedDate = addLocalDays(lastDate, offset);
        const day = projectedDate.getDate().toString().padStart(2, '0');
        points.push({
          name: day,
          value: null,
          predicted: roundCurrency(lastValue + dailyChange * offset),
          date: `${day} de ${MONTHS_SHORT[projectedDate.getMonth()]} (Projeção)`
        });
      }
    }
  }

  return points;
};

export const calculateCashFlowData = (transactions: any[]) => {
  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const getMonthValue = (month: number, year: number) => {
    const monthTx = transactions.filter(t => {
      const rawDate = t?.date || t?.createdAt || t?.timestamp || t?.data;
      const txDate = parseTransactionDate(rawDate);
      if (!txDate) return false;
      return txDate.getMonth() === month && txDate.getFullYear() === year;
    });

    const income = monthTx
      .filter(t => isIncomeTransaction(t) || isYieldTransaction(t))
      .reduce((acc, t) => Math.round((acc + parseTransactionAmount(t.value)) * 100) / 100, 0);
    const expense = monthTx
      .filter(t => isExpenseTransaction(t))
      .reduce((acc, t) => Math.round((acc + parseTransactionAmount(t.value)) * 100) / 100, 0);

    return {
      value: roundCurrency(income - expense),
      hasData: monthTx.length > 0
    };
  };

  const previousMonths = [0, 1, 2].map(offset => {
    const date = new Date(currentYear, currentMonth - offset, 1);
    return getMonthValue(date.getMonth(), date.getFullYear());
  });
  const monthsWithData = previousMonths.filter(m => m.hasData);

  let projection = 0;
  if (monthsWithData.length >= 3) {
    projection = roundCurrency(monthsWithData.reduce((acc, m) => acc + m.value, 0) / 3);
  } else if (previousMonths[1]?.hasData) {
    projection = previousMonths[1].value;
  } else if (previousMonths[0]?.hasData) {
    projection = previousMonths[0].value;
  }

  return months.map((name, index) => {
    const isPredicted = index > currentMonth;
    const value = isPredicted
      ? projection
      : getMonthValue(index, currentYear).value;

    return { name, value, isPredicted };
  });
};
