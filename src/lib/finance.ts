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
    const rawDate = transaction?.date;
    const date = rawDate?.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);
    if (!date || Number.isNaN(date.getTime())) return;
    if (date.getMonth() !== month || date.getFullYear() !== year) return;

    const value = Number(transaction?.value) || 0;
    balance += transaction?.type === 'out' ? -value : value;
  });

  return roundCurrency(balance);
};

/**
 * Single source of truth for net worth:
 * total assets (investments + accounts + physical) + current month balance.
 */
export const calculateNetWorth = (
  assets: any[] = [],
  transactions: any[] = [],
  month?: number,
  year?: number
) => {
  return roundCurrency(
    calculateTotalAssets(assets) + calculateMonthBalance(transactions, month, year)
  );
};

export const calculateTotals = (transactions: any[], month: number, year: number, assets: any[] = []) => {
  const filtered = transactions.filter(t => {
    const rawDate = t?.date;
    const d = rawDate?.toDate ? rawDate.toDate() : (rawDate ? new Date(rawDate) : null);
    if (!d || Number.isNaN(d.getTime())) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  });
  
  const sum = (acc: number, val: number) => Math.round((acc + val) * 100) / 100;

  const investmentTotal = assets
    .filter(a => a.type === 'investment')
    .reduce((acc, a) => sum(acc, Number(a.value) || 0), 0);

  return {
    in: filtered.filter(t => t.type === 'in').reduce((acc, t) => sum(acc, Number(t.value) || 0), 0),
    out: filtered.filter(t => t.type === 'out').reduce((acc, t) => sum(acc, Number(t.value) || 0), 0),
    yield: filtered.filter(t => t.type === 'yield').reduce((acc, t) => sum(acc, Number(t.value) || 0), 0),
    investments: investmentTotal
  };
};

export const calculateVariation = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const v = ((current - previous) / previous) * 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

export const getMiniChartData = (transactions: any[], type: string) => {
  const filtered = transactions.filter(t => t.type === type).slice(0, 10).reverse();
  return filtered.map(t => ({ v: Number(t.value) || 0 }));
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

const parseTransactionDate = (value: any): Date | null => {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
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
    // Selecting a month later than the current one means the most recent occurrence.
    if (anchorMonth > now.getMonth()) anchorYear -= 1;
  }

  const monthStart = new Date(anchorYear, anchorMonth, 1);
  const monthEnd = new Date(anchorYear, anchorMonth + 1, 0);
  const isCurrentMonth = anchorYear === now.getFullYear() && anchorMonth === now.getMonth();
  const lastDate = isCurrentMonth ? today : monthEnd;

  const datedTransactions = transactions
    .map(transaction => {
      const date = parseTransactionDate(transaction?.date);
      if (!date) return null;
      const value = Number(transaction?.value) || 0;
      const flow = transaction?.type === 'out'
        ? -value
        : transaction?.type === 'in' || transaction?.type === 'yield'
          ? value
          : 0;
      return { date, flow };
    })
    .filter((item): item is { date: Date; flow: number } => item !== null);

  const currentNetWorth = calculateNetWorth(assets, transactions);
  const valueAt = (date: Date) => {
    const cutoff = endOfLocalDay(date).getTime();
    const futureFlow = datedTransactions.reduce(
      (sum, transaction) => transaction.date.getTime() > cutoff ? sum + transaction.flow : sum,
      0
    );
    return roundCurrency(currentNetWorth - futureFlow);
  };

  if (period === 'Anos') {
    const points: EvolutionPoint[] = [];
    for (let offset = 11; offset >= 0; offset--) {
      const monthDate = new Date(anchorYear, anchorMonth - offset, 1);
      const isCurrent = monthDate.getFullYear() === now.getFullYear() && monthDate.getMonth() === now.getMonth();
      const pointDate = isCurrent ? today : new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      points.push({
        name: `${MONTHS_SHORT[monthDate.getMonth()]}/${String(monthDate.getFullYear()).slice(-2)}`,
        value: valueAt(pointDate),
        date: `${MONTHS_PT[monthDate.getMonth()]} de ${monthDate.getFullYear()}`
      });
    }
    return points;
  }

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
      const txDate = t.date?.toDate ? t.date.toDate() : (t.date ? new Date(t.date) : null);
      if (!txDate || isNaN(txDate.getTime())) return false;
      return txDate.getMonth() === month && txDate.getFullYear() === year;
    });

    const income = monthTx
      .filter(t => t.type === 'in' || t.type === 'yield')
      .reduce((acc, t) => Math.round((acc + (t.value ?? 0)) * 100) / 100, 0);
    const expense = monthTx
      .filter(t => t.type === 'out')
      .reduce((acc, t) => Math.round((acc + (t.value ?? 0)) * 100) / 100, 0);

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
