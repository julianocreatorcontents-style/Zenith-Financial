import { Money } from '../../domain/money/Money';
import { YieldCalculator } from '../../domain/yield/YieldCalculator';
import { IncomeTaxPolicy } from '../../domain/tax/IncomeTaxPolicy';
import { IofPolicy } from '../../domain/tax/IofPolicy';
import type { RateTier, YieldPolicy } from '../../domain/yield/YieldPolicy';
import type { RawAssetDoc, RawTimestamp } from './assetToInvestment';
import { DEFAULT_CDI_ANNUAL_PERCENT } from './netWorthProjection';

export type TaxDisplayMode = 'GROSS' | 'NET';

export interface AssetYieldInfo {
  principal: number;
  currentValue: number;
  accumulatedYield: number;
  dailyYield: number;
  daysInvested: number;
  yieldPercent: number;
  startDate: Date | null;
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
  // 110% CDI base + 27% CDI bônus até R$ 5.000 (137% total), 80% CDI no excedente, 365 dias corridos, NET.
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
      taxDisplayMode: 'NET',
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

export function calculateAssetYieldInfo(
  doc: RawAssetDoc,
  cdiAnnualPercent: number = DEFAULT_CDI_ANNUAL_PERCENT,
  today: Date = new Date()
): AssetYieldInfo {
  const principal = Number(doc.valorInvestido ?? doc.value) || 0;
  const startDate = parseAssetDate(doc.investmentStartDate) ?? parseAssetDate(doc.createdAt) ?? null;

  const emptyResult: AssetYieldInfo = {
    principal,
    currentValue: Number(doc.value) || principal,
    accumulatedYield: 0,
    dailyYield: 0,
    daysInvested: 0,
    yieldPercent: 0,
    startDate,
  };

  if (principal <= 0 || !startDate) {
    return emptyResult;
  }

  const resolved = resolveAssetPolicy(doc);
  if (!resolved) {
    return emptyResult;
  }

  const daysInvested = resolved.policy.dayCountConvention === 'BUSINESS_DAYS_252'
    ? countBusinessDays(startDate, today)
    : countCalendarDays(startDate, today);

  const initialMoney = Money.fromBRL(principal);

  // Daily yield for current position (today)
  const initialDailyMoney = YieldCalculator.dailyYieldTiered(
    initialMoney,
    cdiAnnualPercent,
    resolved.policy
  );
  let dailyYield = Math.round(initialDailyMoney.toBRL() * 100) / 100;

  if (daysInvested <= 0) {
    return {
      principal,
      currentValue: principal,
      accumulatedYield: 0,
      dailyYield,
      daysInvested: 0,
      yieldPercent: 0,
      startDate,
    };
  }

  // Project accumulated balance across elapsed days
  const projectedMoney = YieldCalculator.projectTiered(
    initialMoney,
    cdiAnnualPercent,
    resolved.policy,
    daysInvested
  );
  const grossTotal = projectedMoney.toBRL();
  const grossYield = Math.max(0, grossTotal - principal);

  let accumulatedYield = grossYield;

  if (resolved.taxDisplayMode === 'GROSS') {
    const ir = IncomeTaxPolicy.calculate(Money.fromBRL(grossYield), daysInvested).toBRL();
    const iof = IofPolicy.calculate(Money.fromBRL(grossYield), daysInvested).toBRL();
    accumulatedYield = Math.max(0, grossYield - ir - iof);
  }

  accumulatedYield = Math.round(accumulatedYield * 100) / 100;
  const currentValue = Math.round((principal + accumulatedYield) * 100) / 100;

  // Daily yield for today's updated balance
  const currentDailyMoney = YieldCalculator.dailyYieldTiered(
    Money.fromBRL(currentValue),
    cdiAnnualPercent,
    resolved.policy
  );
  dailyYield = Math.round(currentDailyMoney.toBRL() * 100) / 100;

  const yieldPercent = principal > 0
    ? Math.round((accumulatedYield / principal) * 10000) / 100
    : 0;

  return {
    principal,
    currentValue,
    accumulatedYield,
    dailyYield,
    daysInvested,
    yieldPercent,
    startDate,
  };
}

export function enrichAsset<T extends { value?: number; valorInvestido?: number; change?: string; [key: string]: any }>(
  asset: T,
  cdiAnnualPercent: number = DEFAULT_CDI_ANNUAL_PERCENT,
  today: Date = new Date()
): T & {
  valorInvestido: number;
  originalValue: number;
  currentValue: number;
  accumulatedYield: number;
  dailyYield: number;
  daysInvested: number;
  yieldPercent: number;
  yieldStartDate: Date | null;
  change?: string;
} {
  const info = calculateAssetYieldInfo(asset as any, cdiAnnualPercent, today);

  const formattedYield = info.accumulatedYield.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const change = info.accumulatedYield > 0
    ? `+${formattedYield} (+${info.yieldPercent.toFixed(2)}%)`
    : asset.change;

  return {
    ...asset,
    value: info.currentValue,
    valorInvestido: info.principal,
    originalValue: info.principal,
    currentValue: info.currentValue,
    accumulatedYield: info.accumulatedYield,
    dailyYield: info.dailyYield,
    daysInvested: info.daysInvested,
    yieldPercent: info.yieldPercent,
    yieldStartDate: info.startDate,
    change,
  };
}
