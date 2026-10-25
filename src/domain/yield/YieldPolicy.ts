import type { Money } from '../money/Money';

// Invariantes de rateTiers:
// - rateTiers tem pelo menos 1 elemento
// - a última faixa DEVE ter upTo: null
// - tiers vêm ordenados por upTo crescente
// - effective rate de um tier = baseRateValue + bonusRateValue

export type DayCountConvention = "BUSINESS_DAYS_252" | "CALENDAR_DAYS_365";

export type Indexer = "CDI" | "SELIC" | "PRE";

export type RateType = "PERCENT_INDEXER" | "SPREAD" | "FIXED";

export interface RateTier {
  upTo: Money | null;
  baseRateValue: number;
  bonusRateValue: number;
}

export interface YieldPolicy {
  indexer: Indexer;
  rateType: RateType;
  dayCountConvention: DayCountConvention;
  rateTiers: RateTier[];
}
