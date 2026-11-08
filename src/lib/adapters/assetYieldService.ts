import { Money } from '../../domain/money/Money';
import { YieldCalculator } from '../../domain/yield/YieldCalculator';
import { IncomeTaxPolicy } from '../../domain/tax/IncomeTaxPolicy';
import { IofPolicy } from '../../domain/tax/IofPolicy';
import type { RateTier, YieldPolicy } from '../../domain/yield/YieldPolicy';
import type { RawAssetDoc, RawTimestamp } from './assetToInvestment';
import { DEFAULT_CDI_ANNUAL_PERCENT } from './netWorthProjection';

export type TaxDisplayMode = 'GROSS' | 'NET';

export interface AssetYieldInfo {
  baseBalance: number;
  principal: number;
  currentValue: number;
  accumulatedYield: number;
  yieldSinceAnchor: number;
  dailyYield: number;
  daysInvested: number;
  yieldPercent: number;
  startDate: Date | null;
  monthEndValue: number;
  monthYieldRemaining: number;
}

export function parseAssetDate(value: RawTimestamp | any): Date | null {
  if (!value) return null;
  // String "YYYY-MM-DD": parsear em horário LOCAL, não UTC.
  // new Date("2026-11-06") retorna 06/11 00:00 UTC = 05/11 21:00 BRT,
  // o que faz countCalendarDays contar 2 dias em sábado 07/11 (deveria ser 1).
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (y !== undefined && m !== undefined && d !== undefined) {
      return new Date(y, m - 1, d);
    }
  }
  const d = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

export function countCalendarDays(startDate: Date, endDate: Date): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function countBusinessDays(startDate: Date, endDate: Date): number {
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  if (cur >= end) return 0;

  let count = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
  }
  return count;
}

/**
 * Soma o rendimento diário entre duas datas respeitando a convenção do ativo:
 * - dias úteis (BUSINESS_DAYS_252) ignoram sábados e domingos;
 * - dias corridos usam o rendimento de fim de semana quando informado.
 */
export function projectYieldBetween(
  dailyYield: number,
  weekendYield: number,
  businessDays: boolean,
  startDate: Date,
  endDate: Date
): number {
  const daily = Number.isFinite(dailyYield) ? dailyYield : 0;
  const weekend = Number.isFinite(weekendYield) ? weekendYield : 0;
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  let total = 0;

  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dayOfWeek = cursor.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (businessDays) {
      if (!isWeekend) total += daily;
    } else if (isWeekend && weekend > 0) {
      total += weekend;
    } else {
      total += daily;
    }
  }

  return Math.round(total * 100) / 100;
}

export interface ResolvedAssetPolicy {
  strategy: 'FIXED_INCOME_TIERED' | 'FIXED_INCOME_SIMPLE';
  policy: YieldPolicy;
  taxDisplayMode: TaxDisplayMode;
}

export function resolveAssetPolicy(doc: RawAssetDoc): ResolvedAssetPolicy | null {
  // 1. Explicit strategy and policy
  if (doc.investmentPolicy && doc.strategy) {
    const rateTiers: RateTier[] = doc.investmentPolicy.rateTiers.map((tier) => ({
      upTo: tier.upTo === null ? null : Money.fromBRL(tier.upTo),
      baseRateValue: tier.baseRateValue,
      bonusRateValue: tier.bonusRateValue,
    }));

    return {
      strategy: doc.strategy,
      policy: {
        indexer: doc.investmentPolicy.indexer ?? 'CDI',
        rateType: doc.investmentPolicy.rateType ?? 'PERCENT_INDEXER',
        dayCountConvention: doc.investmentPolicy.dayCountConvention,
        rateTiers,
      },
      taxDisplayMode: doc.investmentPolicy.taxDisplayMode ?? 'NET',
    };
  }

  const nameLower = (doc.name || '').toLowerCase();

  // 2. Known Preset: 99Pay
  // 110% CDI base + 27% CDI bônus até R$ 5.000 (137% total), 80% CDI no excedente, 365 dias corridos, GROSS.
  if (nameLower.includes('99pay') || nameLower.includes('99 pay')) {
    return {
      strategy: 'FIXED_INCOME_TIERED',
      policy: {
        indexer: 'CDI',
        rateType: 'PERCENT_INDEXER',
        dayCountConvention: 'CALENDAR_DAYS_365',
        rateTiers: [
          { upTo: Money.fromBRL(5000), baseRateValue: 110, bonusRateValue: 27 },
          { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
        ],
      },
      taxDisplayMode: 'GROSS',
    };
  }

  // 3. Known Preset: Mercado Pago
  // 105% CDI até R$ 20.000, 100% CDI no excedente, 252 dias úteis, NET.
  if (nameLower.includes('mercado pago') || nameLower.includes('mercadopago')) {
    return {
      strategy: 'FIXED_INCOME_TIERED',
      policy: {
        indexer: 'CDI',
        rateType: 'PERCENT_INDEXER',
        dayCountConvention: 'BUSINESS_DAYS_252',
        rateTiers: [
          { upTo: Money.fromBRL(20000), baseRateValue: 105, bonusRateValue: 0 },
          { upTo: null, baseRateValue: 100, bonusRateValue: 0 },
        ],
      },
      taxDisplayMode: 'NET',
    };
  }

  // 4. Default fixed income investment (type === 'investment' or CDB/Tesouro)
  if (doc.type === 'investment') {
    return {
      strategy: 'FIXED_INCOME_TIERED',
      policy: {
        indexer: 'CDI',
        rateType: 'PERCENT_INDEXER',
        dayCountConvention: 'BUSINESS_DAYS_252',
        rateTiers: [
          { upTo: null, baseRateValue: 100, bonusRateValue: 0 },
        ],
      },
      taxDisplayMode: 'NET',
    };
  }

  return null;
}

/**
 * Calcula o rendimento do ativo considerando a data âncora (data do último saldo registrado,
 * seja na criação ou edição).
 *
 * Exemplo real:
 * - Aporte inicial: R$ 5.000,00 no dia 01/10
 * - Saldo registrado no extrato do dia 25/10: R$ 5.082,12 (âncora)
 * - Hoje (dia 27/10): soma rendimento dos dias decorridos desde a âncora (26 e 27/10)
 * - Fim do mês (31/10): projeta rendimento dos dias restantes do mês de referência (28, 29, 30 e 31/10)
 */
export function calculateAssetYieldInfo(
  doc: RawAssetDoc,
  cdiAnnualPercent: number = DEFAULT_CDI_ANNUAL_PERCENT,
  today: Date = new Date(),
  hasMovement: boolean = false,
  transactions: any[] = []
): AssetYieldInfo {
  const rawManualBalance = (doc as any).manualBalance;
  const hasManualBalance =
    rawManualBalance !== undefined &&
    rawManualBalance !== null &&
    rawManualBalance !== '' &&
    Number.isFinite(Number(rawManualBalance)) &&
    Number(rawManualBalance) >= 0;
  const manualBalance = hasManualBalance ? Number(rawManualBalance) : 0;
  const baseBalance = hasManualBalance ? manualBalance : (Number(doc.value) || 0);
  const principal = Number(doc.valorInvestido ?? doc.value) || baseBalance;
  
  const manualBalanceDate = parseAssetDate((doc as any).manualBalanceDate);
  const explicitStartDate = parseAssetDate(doc.investmentStartDate);
  const investmentStartDate =
    explicitStartDate ??
    parseAssetDate((doc as any).createdAt);
  const anchorDate =
    manualBalanceDate ??
    explicitStartDate ??
    parseAssetDate((doc as any).updatedAt) ??
    investmentStartDate ??
    null;

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const emptyResult: AssetYieldInfo = {
    baseBalance,
    principal,
    currentValue: baseBalance,
    accumulatedYield: 0,
    yieldSinceAnchor: 0,
    dailyYield: 0,
    daysInvested: 0,
    yieldPercent: 0,
    startDate: anchorDate,
    monthEndValue: baseBalance,
    monthYieldRemaining: 0,
  };

  if (baseBalance <= 0 || !anchorDate) {
    return emptyResult;
  }

  const resolved = resolveAssetPolicy(doc);
  if (!resolved) {
    return emptyResult;
  }

  const isBusinessDays = resolved.policy.dayCountConvention === 'BUSINESS_DAYS_252';

  // Dias decorridos desde a data âncora até hoje
  const daysSinceAnchor = isBusinessDays
    ? countBusinessDays(anchorDate, today)
    : countCalendarDays(anchorDate, today);

  // IR/IOF dependem do tempo total do investimento, não da última reconciliação.
  const taxStartDate = investmentStartDate ?? anchorDate;
  const taxDays = Math.max(1, countCalendarDays(taxStartDate, today));

  const baseMoney = Money.fromBRL(baseBalance);

  // Rendimento diário atual (para hoje)
  const currentDailyMoney = YieldCalculator.dailyYieldTiered(
    baseMoney,
    cdiAnnualPercent,
    resolved.policy
  );
  let dailyYield = Math.round(currentDailyMoney.toBRL() * 100) / 100;

  // Dias da âncora até o fechamento do mês de referência
  const daysToMonthEnd = isBusinessDays
    ? countBusinessDays(anchorDate, monthEnd)
    : countCalendarDays(anchorDate, monthEnd);

  // Projeção até o fim do mês
  let monthEndValue = baseBalance;
  if (daysToMonthEnd > 0) {
    const monthEndMoney = YieldCalculator.projectTiered(
      baseMoney,
      cdiAnnualPercent,
      resolved.policy,
      daysToMonthEnd
    );
    monthEndValue = Math.round(monthEndMoney.toBRL() * 100) / 100;
  }

  if (daysSinceAnchor <= 0) {
    const monthYieldRemaining = Math.round(Math.max(0, monthEndValue - baseBalance) * 100) / 100;
    const historicalYield = Math.round(Math.max(0, baseBalance - principal) * 100) / 100;

    return {
      baseBalance,
      principal,
      currentValue: baseBalance,
      accumulatedYield: historicalYield,
      yieldSinceAnchor: 0,
      dailyYield,
      daysInvested: 0,
      yieldPercent: principal > 0 ? Math.round((historicalYield / principal) * 10000) / 100 : 0,
      startDate: anchorDate,
      monthEndValue,
      monthYieldRemaining,
    };
  }

  // Verifica se há um valor manual do Extrato Oficial
  const manualYield = Number((doc as any).manualDailyYield);
  const hasManualYield = !isNaN(manualYield) && manualYield > 0;

  let rawYieldSinceAnchor = 0;
  const manualWeekendYield = Number((doc as any).manualWeekendYield);
  
  const useManualYield = hasManualYield && !hasMovement;
  if (useManualYield) {
    // Loop dia a dia para respeitar o final de semana
    let cur = new Date(anchorDate);
    const end = new Date(today);
    cur.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (cur < end) {
      cur.setDate(cur.getDate() + 1);
      const dayOfWeek = cur.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isBusinessDays) {
        // MP: Só rende em dias úteis (pula sábado e domingo)
        if (!isWeekend) rawYieldSinceAnchor += manualYield;
      } else {
        // 99Pay: Rende todo dia, mas o fds pode ter um valor diferente
        if (isWeekend && !isNaN(manualWeekendYield) && manualWeekendYield > 0) {
          rawYieldSinceAnchor += manualWeekendYield;
        } else {
          rawYieldSinceAnchor += manualYield;
        }
      }
    }
  } else {
    // Capitalização normal pelo CDI
    const projectedMoney = YieldCalculator.projectTiered(
      baseMoney,
      cdiAnnualPercent,
      resolved.policy,
      daysSinceAnchor
    );
    rawYieldSinceAnchor = Math.max(0, projectedMoney.toBRL() - baseBalance);
  }

  let netYieldSinceAnchor = rawYieldSinceAnchor;

  // CORREÇÃO: GROSS mostra bruto (sem impostos). NET desconta impostos.
  if (useManualYield) {
    // O valor manual do extrato JÁ É LÍQUIDO. Mantém o valor.
    netYieldSinceAnchor = rawYieldSinceAnchor;
  } else if (resolved.taxDisplayMode === 'NET') {
    const ir = IncomeTaxPolicy.calculate(Money.fromBRL(rawYieldSinceAnchor), taxDays).toBRL();
    // IOF só é aplicado nos primeiros 29 dias contados do início do investimento
    const iof = taxDays < 30
      ? IofPolicy.calculate(Money.fromBRL(rawYieldSinceAnchor), taxDays).toBRL()
      : 0;
    netYieldSinceAnchor = Math.max(0, rawYieldSinceAnchor - ir - iof);
  } else {
    // GROSS (99Pay): exibe o rendimento bruto sem descontar impostos
    netYieldSinceAnchor = rawYieldSinceAnchor;
  }

  const yieldSinceAnchor = Math.round(netYieldSinceAnchor * 100) / 100;
  const currentValue = Math.round((baseBalance + yieldSinceAnchor) * 100) / 100;

  // Atualiza rendimento diário estimado para o novo saldo
  const updatedDailyMoney = YieldCalculator.dailyYieldTiered(
    Money.fromBRL(currentValue),
    cdiAnnualPercent,
    resolved.policy
  );
  dailyYield = Math.round(updatedDailyMoney.toBRL() * 100) / 100;

  // Rendimento restante do mês = saldo projetado no fim do mês - saldo de hoje
  const monthYieldRemaining = Math.round(Math.max(0, monthEndValue - currentValue) * 100) / 100;

  // Rendimento acumulado desde o aporte original (principal), não apenas do mês.
  const accumulatedYield = Math.round(Math.max(0, currentValue - principal) * 100) / 100;
  const yieldPercent = principal > 0
    ? Math.round((accumulatedYield / principal) * 10000) / 100
    : 0;

  return {
    baseBalance,
    principal,
    currentValue,
    accumulatedYield,
    yieldSinceAnchor,
    dailyYield,
    daysInvested: daysSinceAnchor,
    yieldPercent,
    startDate: anchorDate,
    monthEndValue,
    monthYieldRemaining,
  };
}

function calculateRemainingManualYield(
  dailyYield: number,
  weekendYield: number,
  businessDays: boolean,
  today: Date
): number {
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let total = 0;

  while (cursor < monthEnd) {
    cursor.setDate(cursor.getDate() + 1);
    const dayOfWeek = cursor.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (businessDays) {
      if (!isWeekend) total += dailyYield;
    } else if (isWeekend && Number.isFinite(weekendYield) && weekendYield > 0) {
      total += weekendYield;
    } else {
      total += dailyYield;
    }
  }

  return Math.round(total * 100) / 100;
}

export function enrichAsset<T extends { value?: number; valorInvestido?: number; change?: string; [key: string]: any }>(
  asset: T,
  cdiAnnualPercent: number = DEFAULT_CDI_ANNUAL_PERCENT,
  today: Date = new Date(),
  hasMovement: boolean = false,
  transactions: any[] = []
): T & {
  valorInvestido: number;
  originalValue: number;
  baseBalance: number;
  currentValue: number;
  accumulatedYield: number;
  yieldSinceAnchor: number;
  dailyYield: number;
  calculatedDailyYield: number;
  daysInvested: number;
  yieldPercent: number;
  yieldStartDate: Date | null;
  monthEndValue: number;
  monthYieldRemaining: number;
  change?: string;
} {
  const info = calculateAssetYieldInfo(asset as any, cdiAnnualPercent, today, hasMovement, transactions);

  const formattedYield = info.accumulatedYield.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const change = info.accumulatedYield > 0
    ? `+${formattedYield} (+${info.yieldPercent.toFixed(2)}%)`
    : asset.change;

  const hasManualYield = typeof (asset as any).manualDailyYield === 'number' && (asset as any).manualDailyYield > 0;
  // Respeita hasMovement: se houve movimentação, usa projectTiered (info.dailyYield)
  // em vez do manualDailyYield do extrato (que está calibrado para o saldo antigo)
  const useManualDaily = hasManualYield && !hasMovement;
  const finalDailyYield = useManualDaily ? (asset as any).manualDailyYield : info.dailyYield;
  const resolved = resolveAssetPolicy(asset as any);
  const businessDays = resolved?.policy.dayCountConvention === 'BUSINESS_DAYS_252';
  const finalMonthYield = useManualDaily
    ? calculateRemainingManualYield(
        finalDailyYield,
        Number((asset as any).manualWeekendYield),
        businessDays,
        today
      )
    : info.monthYieldRemaining;

  return {
    ...asset,
    value: info.currentValue,
    valorInvestido: info.principal,
    originalValue: info.principal,
    baseBalance: info.baseBalance,
    currentValue: info.currentValue,
    accumulatedYield: info.accumulatedYield,
    yieldSinceAnchor: info.yieldSinceAnchor,
    dailyYield: finalDailyYield,
    calculatedDailyYield: info.dailyYield,
    daysInvested: info.daysInvested,
    yieldPercent: info.yieldPercent,
    yieldStartDate: info.startDate,
    monthEndValue: info.currentValue + finalMonthYield,
    monthYieldRemaining: finalMonthYield,
    change,
  };
}
