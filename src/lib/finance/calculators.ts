/**
 * Cálculos financeiros essenciais do Zenith.
 * Segue o princípio de Responsabilidade Única (SRP) com tipagem estrita sem `any`.
 */

import { parseTransactionAmount, parseTransactionDate } from './parsers';
import {
  roundCurrency,
  MONTHS_PT,
  MONTHS_SHORT,
  startOfLocalDay,
  endOfLocalDay,
  addLocalDays,
  parseDayRange
} from './formatters';

export interface TransactionInput {
  id?: string;
  label?: string;
  value?: unknown;
  type?: string;
  date?: unknown;
  createdAt?: unknown;
  timestamp?: unknown;
  data?: unknown;
  assetId?: string;
  applied?: boolean;
  isRecurring?: boolean;
  durationMonths?: number | string | null;
  categoria_primaria?: string;
  category?: string;
  transferId?: string;
  transferRole?: 'out' | 'in';
  counterpartAssetId?: string;
}

export interface AssetInput {
  id?: string;
  name?: string;
  value?: number;
  type?: string;
  manualBalance?: number;
  currentValue?: number;
  dailyYield?: number;
  manualDailyYield?: number;
  manualBalanceDate?: string;
  emissor?: string;
  detail?: string;
  subcategoria?: string;
}

export const calculateRealProfitability = (nominalRate: number, inflationRate: number): number => {
  // Formula: ((1 + r_nominal) / (1 + i)) - 1
  return ((1 + nominalRate / 100) / (1 + inflationRate / 100)) - 1;
};

export const isTransferTransaction = (tx: TransactionInput | null | undefined): boolean => {
  if (!tx) return false;
  // Metadados explícitos são a fonte de verdade (novas transferências).
  if (tx.transferId) return true;
  if (tx.counterpartAssetId) return true;

  const cat = String(tx.categoria_primaria || tx.category || '').toLowerCase().trim();
  if (cat === 'transferencia' || cat === 'transferência') return true;

  // Legado: só considera transferência se o rótulo indicar movimentação entre
  // contas próprias. Evita classificar "Transferência recebida" de terceiros
  // como neutra.
  const label = String(tx.label || '').toLowerCase();
  return (
    label.includes('transferência entre') ||
    label.includes('transferencia entre') ||
    label.includes('entre contas') ||
    label.includes('entre ativos')
  );
};

export const isExpenseTransaction = (tx: TransactionInput | null | undefined): boolean => {
  if (!tx || isTransferTransaction(tx)) {
    return false;
  }
  const type = String(tx.type ?? '').toLowerCase().trim();
  if (type === 'out' || type === 'saida' || type === 'saída' || type === 'despesa' || type === 'debito') {
    return true;
  }
  if (type === 'in' || type === 'entrada' || type === 'receita' || type === 'credito' || type === 'yield' || type === 'rendimento') {
    return false;
  }
  // Inferência para transações sem type explícito
  const cat = String(tx.categoria_primaria || tx.category || '').toLowerCase();
  if (['moradia', 'energia', 'água', 'agua', 'alimentação', 'alimentacao', 'mercado', 'transporte', 'lazer', 'saúde', 'saude', 'educação', 'educacao', 'outros'].includes(cat)) {
    return true;
  }
  const lbl = String(tx.label || '').toLowerCase();
  if (lbl.includes('copel') || lbl.includes('fatura') || lbl.includes('conta') || lbl.includes('compra') || lbl.includes('pagamento') || lbl.includes('débito') || lbl.includes('debito')) {
    return true;
  }
  return false;
};

export const isIncomeTransaction = (tx: TransactionInput | null | undefined): boolean => {
  if (!tx || isTransferTransaction(tx)) {
    return false;
  }
  const type = String(tx.type ?? '').toLowerCase().trim();
  if (type === 'in' || type === 'entrada' || type === 'receita' || type === 'credito') {
    return true;
  }
  if (type === 'out' || type === 'saida' || type === 'saída' || type === 'despesa' || type === 'debito' || type === 'yield' || type === 'rendimento') {
    return false;
  }
  const cat = String(tx.categoria_primaria || tx.category || '').toLowerCase();
  if (['salário', 'salario', 'receita', 'ganho'].includes(cat)) {
    return true;
  }
  const lbl = String(tx.label || '').toLowerCase();
  if (lbl.includes('salário') || lbl.includes('salario') || lbl.includes('pix recebido') || lbl.includes('depósito') || lbl.includes('deposito')) {
    return true;
  }
  return false;
};

export const isYieldTransaction = (tx: TransactionInput | null | undefined): boolean => {
  if (!tx || isTransferTransaction(tx)) return false;
  const type = String(tx.type ?? '').toLowerCase().trim();
  if (type === 'yield' || type === 'rendimento') {
    return true;
  }
  if (type === 'out' || type === 'saida' || type === 'saída' || type === 'despesa' || type === 'debito') {
    return false;
  }
  if (type === 'in' || type === 'entrada' || type === 'receita' || type === 'credito') {
    return false;
  }
  const cat = String(tx.categoria_primaria || tx.category || '').toLowerCase().trim();
  return cat === 'investimentos' || cat === 'rendimentos';
};

export const hasAssetMovementSince = (
  asset: AssetInput | null | undefined,
  transactions: TransactionInput[],
  since: Date
): boolean => {
  const assetId = asset?.id;
  const assetName = String(asset?.name || '').toLowerCase();
  const sinceDay = new Date(since.getFullYear(), since.getMonth(), since.getDate()).getTime();
  return transactions.some(tx => {
    if (isYieldTransaction(tx)) return false;
    const date = parseTransactionDate(tx.date);
    if (!date) return false;
    const txDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (txDay < sinceDay) return false;
    if (assetId && tx.assetId === assetId) return true;
    if (assetName && String(tx.label || '').toLowerCase().includes(assetName)) return true;
    return false;
  });
};

const getTransactionDate = (transaction: TransactionInput): Date | null => {
  const raw = transaction?.date || transaction?.createdAt || transaction?.timestamp || transaction?.data;
  return parseTransactionDate(raw);
};

const getTransactionFlow = (transaction: TransactionInput): number => {
  const value = parseTransactionAmount(transaction?.value);
  if (isExpenseTransaction(transaction)) return -value;
  if (isIncomeTransaction(transaction) || isYieldTransaction(transaction)) return value;
  return 0;
};

const isAppliedToAsset = (transaction: TransactionInput): boolean =>
  Boolean(transaction?.applied);

export const calculateNetWorthAt = (
  assets: AssetInput[] = [],
  transactions: TransactionInput[] = [],
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

export function isRecurringActiveInMonth(tx: TransactionInput, targetDate: Date): boolean {
  const start = parseTransactionDate(tx?.date) ?? parseTransactionDate(tx?.createdAt);
  if (!start) return true;

  const elapsedMonths =
    (targetDate.getFullYear() - start.getFullYear()) * 12 +
    (targetDate.getMonth() - start.getMonth());
  if (elapsedMonths < 0) return false;

  if (tx?.durationMonths === null || tx?.durationMonths === undefined || (tx?.durationMonths as unknown) === '') {
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

export const calculateTotalAssets = (assets: AssetInput[] = []): number => {
  return roundCurrency(assets.reduce((acc, asset) => acc + (Number(asset?.value) || 0), 0));
};

export const calculateMonthBalance = (
  transactions: TransactionInput[] = [],
  month: number = new Date().getMonth(),
  year: number = new Date().getFullYear()
): number => {
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

export const calculateNetWorth = (
  assets: AssetInput[] = [],
  transactions: TransactionInput[] = [],
  month: number = new Date().getMonth(),
  year: number = new Date().getFullYear(),
  assetsValueAt?: (date: Date) => number
): number => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const cutoff = monthEnd.getTime() > today.getTime() ? today : monthEnd;

  return calculateNetWorthAt(assets, transactions, cutoff, assetsValueAt?.(cutoff));
};

export const calculateTotals = (
  transactions: TransactionInput[],
  month: number,
  year: number,
  assets: AssetInput[] = []
): { in: number; out: number; yield: number; investments: number } => {
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
  transactions: TransactionInput[] = [],
  month: number = new Date().getMonth(),
  year: number = new Date().getFullYear()
): Array<{ name: string; value: number }> => {
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

export const getMiniChartData = (
  transactions: TransactionInput[],
  type: string,
  referenceDate?: Date | null
): Array<{ v: number }> => {
  const isOut = type === 'out';
  const isIn = type === 'in';
  const filtered = transactions
    .filter(t => isOut ? isExpenseTransaction(t) : (isIn ? isIncomeTransaction(t) : isYieldTransaction(t)))
    .map(t => ({
      transaction: t,
      date: getTransactionDate(t),
    }))
    .filter(({ date }) => {
      if (!referenceDate) return true;
      if (!date) return false;
      return date.getMonth() === referenceDate.getMonth() && date.getFullYear() === referenceDate.getFullYear();
    })
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
    .slice(-10);

  if (filtered.length === 0) return [];
  const points = filtered.map(({ transaction }) => ({ v: parseTransactionAmount(transaction.value) }));
  if (points.length === 1) {
    return [{ v: 0 }, points[0]!];
  }
  return points;
};

export type EvolutionChartFilter = {
  period?: string;
  month?: string;
  day?: string;
};

export type EvolutionChartOptions = {
  assetsValueAt?: (date: Date) => number;
};

type EvolutionPoint = {
  name: string;
  value: number | null;
  predicted?: number;
  date: string;
};

export const calculateEvolutionData = (
  assets: AssetInput[] = [],
  transactions: TransactionInput[] = [],
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

export const calculateCashFlowData = (
  transactions: TransactionInput[]
): Array<{ name: string; value: number; isPredicted: boolean }> => {
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

export interface GoalProjectionDebug {
  yieldMensal: number;
  entradasFixas: number;
  saidasFixas: number;
  entradasUnicas: number;
  saidasUnicas: number;
  taxaMensal: number;
  fluxoVariavelMedio: number;
}

export interface GoalProjectionResult {
  saldoBase: number;
  fluxoRecorrenteLiquido: number;
  monthsToGoal: number;
  debug: GoalProjectionDebug;
}

export function calculateGoalProjection(
  currentBalance: number,
  transactions: TransactionInput[],
  assets: AssetInput[],
  target: number
): GoalProjectionResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let entradasFixas = 0;
  let saidasFixas = 0;
  let entradasUnicasMesAtual = 0;
  let saidasUnicasMesAtual = 0;
  const singlesByMonth: Record<number, { in: number; out: number }> = {};
  const varExp: Record<string, { total: number; count: number }> = {};

  for (const tx of transactions) {
    if (isTransferTransaction(tx) || isYieldTransaction(tx)) continue;
    const value = parseTransactionAmount(tx.value);
    const isIn = isIncomeTransaction(tx);
    const isOut = isExpenseTransaction(tx);
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
        const alreadyInCurrentBalance = parsedTxDate !== null && txDate.getTime() <= endOfToday.getTime();
        if (!alreadyInCurrentBalance) {
          if (isIn) entradasUnicasMesAtual += value; else saidasUnicasMesAtual += value;
        }
      } else if (monthsFromNow > 0) {
        if (!singlesByMonth[monthsFromNow]) singlesByMonth[monthsFromNow] = { in: 0, out: 0 };
        if (isIn) singlesByMonth[monthsFromNow]!.in += value;
        else singlesByMonth[monthsFromNow]!.out += value;
      }

      if (isOut) {
        const label = String(tx.label || '').toLowerCase().trim() || 'desconhecido';
        if (!varExp[label]) varExp[label] = { total: 0, count: 0 };
        varExp[label]!.total += value;
        varExp[label]!.count += 1;
      }
    }
  }

  let avgOut = 0;
  Object.values(varExp).forEach(v => { avgOut += v.total / v.count; });
  const fluxoVariavelMedio = -avgOut;

  let yieldMensal = 0;
  let totalAssetsValue = 0;
  for (const asset of assets) {
    const daily = Number(asset.manualDailyYield ?? asset.dailyYield ?? 0);
    const val = Number(asset.currentValue ?? asset.manualBalance ?? asset.value) || 0;
    const isMP = String(asset.name || '').toLowerCase().includes('mercado pago');
    yieldMensal += daily * (isMP ? 22 : 30);
    totalAssetsValue += val;
  }
  const taxaMensal = totalAssetsValue > 0 ? (yieldMensal / totalAssetsValue) : 0;

  const saldoBase = currentBalance + entradasUnicasMesAtual - saidasUnicasMesAtual;
  const fluxoLiquidoMes1 = yieldMensal + entradasFixas - saidasFixas;

  const debug: GoalProjectionDebug = { yieldMensal, entradasFixas, saidasFixas, entradasUnicas: entradasUnicasMesAtual, saidasUnicas: saidasUnicasMesAtual, taxaMensal, fluxoVariavelMedio };

  if (saldoBase >= target) return { saldoBase, fluxoRecorrenteLiquido: fluxoLiquidoMes1, monthsToGoal: 0, debug };

  let meses = 0;
  let saldoTotal = saldoBase;

  while (saldoTotal < target && meses < 600) {
    meses++;
    
    const projectionMonth = new Date(currentYear, currentMonth + meses, 1);
    let fixasIn = 0;
    let fixasOut = 0;
    for (const tx of transactions) {
      if (!tx.isRecurring) continue;
      if (isTransferTransaction(tx) || isYieldTransaction(tx)) continue;
      const isIn = isIncomeTransaction(tx);
      const isOut = isExpenseTransaction(tx);
      if (!isIn && !isOut) continue;
      if (!isRecurringActiveInMonth(tx, projectionMonth)) continue;
      const value = parseTransactionAmount(tx.value);
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
