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

const getTransactionDate = (transaction: any): Date | null => {
  const raw = transaction?.date || transaction?.createdAt || transaction?.timestamp || transaction?.data;
  return parseTransactionDate(raw);
};

const getTransactionFlow = (transaction: any): number => {
  const value = parseTransactionAmount(transaction?.value);
  if (isExpenseTransaction(transaction)) return -value;
  if (isIncomeTransaction(transaction) || isYieldTransaction(transaction)) return value;
  return 0;
};

const isAppliedToAsset = (transaction: any): boolean =>
  Boolean(transaction?.applied && transaction?.assetId);

/**
 * Patrimônio em uma data de corte.
 * O saldo atual dos ativos já reflete as transações aplicadas; logo, o valor
 * em uma data passada é obtido revertendo aplicações posteriores e somando
 * transações ainda não aplicadas ocorridas até a data.
 */
export const calculateNetWorthAt = (
  assets: any[] = [],
  transactions: any[] = [],
  cutoffDate: Date,
  totalAssetsAtCutoff?: number
): number => {
  const cutoff = cutoffDate.getTime();
  const totalAssets = totalAssetsAtCutoff ?? calculateTotalAssets(assets);
  let adjustment = 0;

  for (const transaction of transactions) {
    const date = getTransactionDate(transaction);
    if (!date) continue;

    const flow = getTransactionFlow(transaction);
    if (flow === 0) continue;

    if (isAppliedToAsset(transaction)) {
      if (date.getTime() > cutoff) adjustment -= flow;
    } else if (date.getTime() <= cutoff) {
      adjustment += flow;
    }
  }

  return roundCurrency(totalAssets + adjustment);
};

/**
 * Indica se uma transação recorrente está ativa em determinado mês.
 * `durationMonths` conta a partir do mês da data da transação (inclusive);
 * `null`/indefinido significa recorrência infinita.
 */
export function isRecurringActiveInMonth(tx: any, targetDate: Date): boolean {
  const start = parseTransactionDate(tx?.date) ?? parseTransactionDate(tx?.createdAt);
  if (!start) return true;

  const elapsedMonths =
    (targetDate.getFullYear() - start.getFullYear()) * 12 +
    (targetDate.getMonth() - start.getMonth());
  if (elapsedMonths < 0) return false;

  if (tx?.durationMonths === null || tx?.durationMonths === undefined || tx?.durationMonths === '') {
    return true;
  }

  const duration = Number(tx.durationMonths);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  return elapsedMonths < duration;
}

export interface FinancialGoalTargets {
  emergencyReserve: number;
  financialFreedom: number;
}

export const DEFAULT_FINANCIAL_GOALS: FinancialGoalTargets = {
  emergencyReserve: 30000,
  financialFreedom: 1000000,
};

export function resolveGoalTargets(
  goals?: Partial<FinancialGoalTargets> | null
): FinancialGoalTargets {
  const emergency = Number(goals?.emergencyReserve);
  const freedom = Number(goals?.financialFreedom);

  return {
    emergencyReserve:
      Number.isFinite(emergency) && emergency > 0
        ? emergency
        : DEFAULT_FINANCIAL_GOALS.emergencyReserve,
    financialFreedom:
      Number.isFinite(freedom) && freedom > 0
        ? freedom
        : DEFAULT_FINANCIAL_GOALS.financialFreedom,
  };
}

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
 * total de ativos consolidados ajustado pelas transações aplicadas após a
 * data de corte e pelas transações ainda não aplicadas até ela.
 */
export const calculateNetWorth = (
  assets: any[] = [],
  transactions: any[] = [],
  month: number = new Date().getMonth(),
  year: number = new Date().getFullYear(),
  assetsValueAt?: (date: Date) => number
) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Fim do dia: inclui transações de hoje

  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  // Meses passados usam o fim do mês; mês atual/futuro usa o fim de hoje.
  const cutoff = monthEnd.getTime() > today.getTime() ? today : monthEnd;

  return calculateNetWorthAt(assets, transactions, cutoff, assetsValueAt?.(cutoff));
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
    .reduce((acc, a) => sum(acc, Number(a.currentValue ?? a.manualBalance ?? a.value) || 0), 0);

  return {
    in: filtered.filter(t => isIncomeTransaction(t)).reduce((acc, t) => sum(acc, parseTransactionAmount(t.value)), 0),
    out: filtered.filter(t => isExpenseTransaction(t)).reduce((acc, t) => sum(acc, parseTransactionAmount(t.value)), 0),
    yield: filtered.filter(t => isYieldTransaction(t)).reduce((acc, t) => sum(acc, parseTransactionAmount(t.value)), 0),
    investments: investmentTotal
  };
};

export const calculateCategoryExpenses = (
  transactions: any[] = [],
  month: number = new Date().getMonth(),
  year: number = new Date().getFullYear()
) => {
  const totals: Record<string, number> = {};

  for (const transaction of transactions) {
    const date = getTransactionDate(transaction);
    if (!date || date.getMonth() !== month || date.getFullYear() !== year) continue;
    if (!isExpenseTransaction(transaction)) continue;

    const category = String(transaction?.categoria_primaria || transaction?.category || 'Outros');
    totals[category] = (totals[category] ?? 0) + parseTransactionAmount(transaction?.value);
  }

  return Object.entries(totals)
    .map(([name, value]) => ({ name, value: roundCurrency(value) }))
    .sort((a, b) => b.value - a.value);
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
    .map(t => ({
      transaction: t,
      date: getTransactionDate(t),
    }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
    .slice(-10);

  if (filtered.length === 0) return [];
  const points = filtered.map(({ transaction }) => ({ v: parseTransactionAmount(transaction.value) }));
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

export type EvolutionChartOptions = {
  /** Valor consolidado dos ativos na data informada (inclui rendimentos históricos). */
  assetsValueAt?: (date: Date) => number;
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
  filter?: EvolutionChartFilter,
  options?: EvolutionChartOptions
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

  if (period === 'Anos') {
    const points: EvolutionPoint[] = [];
    for (let offset = 11; offset >= 0; offset--) {
      const monthDate = new Date(anchorYear, anchorMonth - offset, 1);
      const m = monthDate.getMonth();
      const y = monthDate.getFullYear();
      points.push({
        name: `${MONTHS_SHORT[m]}/${String(y).slice(-2)}`,
        value: calculateNetWorth(assets, transactions, m, y, options?.assetsValueAt),
        date: `${MONTHS_PT[m]} de ${y}`
      });
    }
    return points;
  }

  // Valor do patrimônio no dia especificado, considerando todo o histórico:
  // transações aplicadas depois da data são revertidas (já estão no saldo atual)
  // e transações ainda não aplicadas até a data são somadas.
  const valueAt = (date: Date) => {
    const cutoff = endOfLocalDay(date);
    return calculateNetWorthAt(assets, transactions, cutoff, options?.assetsValueAt?.(cutoff));
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

  // A projeção usa apenas meses completos; o mês atual, ainda em andamento,
  // distorceria a média (especialmente no início do mês).
  const completedMonths = [1, 2, 3].map(offset => {
    const date = new Date(currentYear, currentMonth - offset, 1);
    return getMonthValue(date.getMonth(), date.getFullYear());
  });
  const completedWithData = completedMonths.filter(m => m.hasData);
  const currentMonthValue = getMonthValue(currentMonth, currentYear);

  let projection = 0;
  if (completedWithData.length > 0) {
    projection = roundCurrency(
      completedWithData.reduce((acc, m) => acc + m.value, 0) / completedWithData.length
    );
  } else if (currentMonthValue.hasData) {
    projection = currentMonthValue.value;
  }

  return months.map((name, index) => {
    const isPredicted = index > currentMonth;
    const value = isPredicted
      ? projection
      : getMonthValue(index, currentYear).value;

    return { name, value, isPredicted };
  });
};

/**
 * Calcula a projeção de uma meta financeira, considerando:
 * - Saldo base (saldo + transações únicas)
 * - Transações recorrentes (respeitando duração)
 * - Rendimento mensal (juros compostos)
 */
export interface GoalProjectionResult {
  saldoBase: number;
  fluxoRecorrenteLiquido: number;
  monthsToGoal: number;
  debug?: any;
}

export function calculateGoalProjection(
  currentBalance: number,
  transactions: any[],
  assets: any[],
  target: number
): GoalProjectionResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let entradasFixas = 0, saidasFixas = 0;
  let entradasUnicasMesAtual = 0, saidasUnicasMesAtual = 0;
  const singlesByMonth: Record<number, { in: number, out: number }> = {};
  const varExp: Record<string, { total: number; count: number }> = {};

  for (const tx of transactions) {
    const value = Number(tx.value) || 0;
    const isIn = tx.type === 'in';
    const isOut = tx.type === 'out';
    if (!isIn && !isOut) continue;

    if (tx.isRecurring) {
      if (isRecurringActiveInMonth(tx, today)) {
        if (isIn) entradasFixas += value; else saidasFixas += value;
      }
    } else {
      const parsedTxDate = parseTransactionDate(tx.date);
      const txDate = parsedTxDate || today;
      const monthsFromNow = (txDate.getFullYear() - currentYear) * 12 + (txDate.getMonth() - currentMonth);

      if (monthsFromNow === 0) {
        // O patrimônio atual (currentBalance) já inclui as transações do mês até hoje.
        // Só somamos as que ainda não foram refletidas no saldo (futuras dentro do mês).
        const alreadyInCurrentBalance = parsedTxDate !== null && txDate.getTime() <= endOfToday.getTime();
        if (!alreadyInCurrentBalance) {
          if (isIn) entradasUnicasMesAtual += value; else saidasUnicasMesAtual += value;
        }
      } else if (monthsFromNow > 0) {
        if (!singlesByMonth[monthsFromNow]) singlesByMonth[monthsFromNow] = { in: 0, out: 0 };
        if (isIn) singlesByMonth[monthsFromNow].in += value;
        else singlesByMonth[monthsFromNow].out += value;
      }

      if (isOut) {
        const label = tx.label?.toLowerCase().trim() || 'desconhecido';
        if (!varExp[label]) varExp[label] = { total: 0, count: 0 };
        varExp[label].total += value;
        varExp[label].count += 1;
      }
    }
  }

  let avgOut = 0; Object.values(varExp).forEach(v => { avgOut += v.total / v.count; });
  const fluxoVariavelMedio = -avgOut;

  let yieldMensal = 0;
  let totalAssetsValue = 0;
  for (const asset of assets) {
    const daily = Number(asset.manualDailyYield ?? asset.dailyYield ?? 0);
    const val = Number(asset.currentValue ?? asset.manualBalance ?? asset.value) || 0;
    const isMP = (asset.name || '').toLowerCase().includes('mercado pago');
    yieldMensal += daily * (isMP ? 22 : 30);
    totalAssetsValue += val;
  }
  const taxaMensal = totalAssetsValue > 0 ? (yieldMensal / totalAssetsValue) : 0;

  // Saldo Base = patrimônio real + transações únicas do mês atual
  const saldoBase = currentBalance + entradasUnicasMesAtual - saidasUnicasMesAtual;
  
  // Fluxo Líquido para exibição na UI (Mês 1) = o que realmente vai entrar e sair neste mês
  const fluxoLiquidoMes1 = yieldMensal + entradasFixas - saidasFixas + (entradasUnicasMesAtual - saidasUnicasMesAtual);

  const debug = { yieldMensal, entradasFixas, saidasFixas, entradasUnicas: entradasUnicasMesAtual, saidasUnicas: saidasUnicasMesAtual, taxaMensal, fluxoVariavelMedio };

  if (saldoBase >= target) return { saldoBase, fluxoRecorrenteLiquido: fluxoLiquidoMes1, monthsToGoal: 0, debug };

  let meses = 0;
  let saldoTotal = saldoBase;

  while (saldoTotal < target && meses < 600) {
    meses++;
    
    const projectionMonth = new Date(currentYear, currentMonth + meses, 1);
    let fixasIn = 0, fixasOut = 0;
    for (const tx of transactions) {
      if (!tx.isRecurring) continue;
      const isIn = tx.type === 'in';
      const isOut = tx.type === 'out';
      if (!isIn && !isOut) continue;
      if (!isRecurringActiveInMonth(tx, projectionMonth)) continue;
      const value = Number(tx.value) || 0;
      if (isIn) fixasIn += value; else fixasOut += value;
    }

    let fluxoEsteMes = yieldMensal + fixasIn - fixasOut;
    if (meses > 1) {
      fluxoEsteMes += fluxoVariavelMedio;
    }

    const monthSingles = singlesByMonth[meses];
    if (monthSingles) {
      fluxoEsteMes += monthSingles.in - monthSingles.out;
    }

    // Juros compostos
    saldoTotal = saldoTotal + fluxoEsteMes + (saldoTotal * taxaMensal);
  }

  const monthsToGoal = saldoTotal >= target ? meses : Infinity;
  return { saldoBase, fluxoRecorrenteLiquido: fluxoLiquidoMes1, monthsToGoal, debug };
}
