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
  today: Date = new Date()
): AssetYieldInfo {
  const baseBalance = Number(doc.value) || 0;
  const principal = Number(doc.valorInvestido ?? doc.value) || baseBalance;
  const anchorDate =
    parseAssetDate(doc.investmentStartDate) ??
    parseAssetDate((doc as any).updatedAt) ??
    parseAssetDate(doc.createdAt) ??
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
      yieldPercent: 0,
      startDate: anchorDate,
      monthEndValue,
      monthYieldRemaining,
    };
  }

  // Capitalização a partir do saldo base desde a data âncora
  const projectedMoney = YieldCalculator.projectTiered(
    baseMoney,
    cdiAnnualPercent,
    resolved.policy,
    daysSinceAnchor
  );
  const grossToday = projectedMoney.toBRL();
  const rawYieldSinceAnchor = Math.max(0, grossToday - baseBalance);

  let netYieldSinceAnchor = rawYieldSinceAnchor;

  // CORREÇÃO: GROSS mostra bruto (sem impostos). NET desconta impostos.
  if (resolved.taxDisplayMode === 'NET') {
    const ir = IncomeTaxPolicy.calculate(Money.fromBRL(rawYieldSinceAnchor), daysSinceAnchor).toBRL();
    // IOF só é aplicado nos primeiros 29 dias
    const iof = daysSinceAnchor < 30 
      ? IofPolicy.calculate(Money.fromBRL(rawYieldSinceAnchor), daysSinceAnchor).toBRL() 
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

  // Rendimento total acumulado (desde o aporte inicial histórico, se informado)
  const totalYield = Math.round(Math.max(0, currentValue - principal) * 100) / 100;

  const yieldPercent = baseBalance > 0
    ? Math.round((yieldSinceAnchor / baseBalance) * 10000) / 100
    : 0;

  return {
    baseBalance,
    principal,
    currentValue,
    accumulatedYield: totalYield > 0 ? totalYield : yieldSinceAnchor,
    yieldSinceAnchor,
    dailyYield,
    daysInvested: daysSinceAnchor,
    yieldPercent,
    startDate: anchorDate,
    monthEndValue,
    monthYieldRemaining,
  };
}

export function enrichAsset<T extends { value?: number; valorInvestido?: number; change?: string; [key: string]: any }>(
  asset: T,
  cdiAnnualPercent: number = DEFAULT_CDI_ANNUAL_PERCENT,
  today: Date = new Date()
): T & {
  valorInvestido: number;
  originalValue: number;
  baseBalance: number;
  currentValue: number;
  accumulatedYield: number;
  yieldSinceAnchor: number;
  dailyYield: number;
  daysInvested: number;
  yieldPercent: number;
  yieldStartDate: Date | null;
  monthEndValue: number;
  monthYieldRemaining: number;
  change?: string;
} {
  const info = calculateAssetYieldInfo(asset as any, cdiAnnualPercent, today);

  const formattedYield = info.yieldSinceAnchor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const change = info.yieldSinceAnchor > 0
    ? `+${formattedYield} (+${info.yieldPercent.toFixed(2)}%)`
    : asset.change;

  return {
    ...asset,
    value: info.currentValue,
    valorInvestido: info.principal,
    originalValue: info.principal,
    baseBalance: info.baseBalance,
    currentValue: info.currentValue,
    accumulatedYield: info.accumulatedYield,
    yieldSinceAnchor: info.yieldSinceAnchor,
    dailyYield: info.dailyYield,
    daysInvested: info.daysInvested,
    yieldPercent: info.yieldPercent,
    yieldStartDate: info.startDate,
    monthEndValue: info.monthEndValue,
    monthYieldRemaining: info.monthYieldRemaining,
    change,
  };
}
