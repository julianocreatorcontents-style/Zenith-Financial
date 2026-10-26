import { Money } from '../../domain/money/Money';
import { Investment } from '../../domain/investment/Investment';
import type {
  Indexer,
  RateTier,
  RateType,
  YieldPolicy,
} from '../../domain/yield/YieldPolicy';

interface RawFirestoreTimestamp {
  toDate: () => Date;
}

export type RawTimestamp = RawFirestoreTimestamp | Date | undefined | null;

export interface RawAssetDoc {
  id: string;
  name: string;
  value: number;
  uid: string;
  type?: 'liquidity' | 'investment' | 'physical' | string;
  valorInvestido?: number;
  createdAt?: RawTimestamp;
  strategy?: 'FIXED_INCOME_TIERED' | 'FIXED_INCOME_SIMPLE';
  investmentPolicy?: {
    indexer?: Indexer;
    rateType?: RateType;
    dayCountConvention: 'BUSINESS_DAYS_252' | 'CALENDAR_DAYS_365';
    taxDisplayMode: 'GROSS' | 'NET';
    rateTiers: Array<{
      upTo: number | null;
      baseRateValue: number;
      bonusRateValue: number;
    }>;
  };
  investmentStartDate?: RawTimestamp;
}

export function assetToInvestment(doc: RawAssetDoc): Investment | null {
  if (!doc.strategy || !doc.investmentPolicy) {
    return null;
  }

  const startDate =
    toDate(doc.investmentStartDate) ?? toDate(doc.createdAt);
  if (!startDate) {
    return null;
  }

  const rateTiers: RateTier[] = doc.investmentPolicy.rateTiers.map((tier) => ({
    upTo: tier.upTo === null ? null : Money.fromBRL(tier.upTo),
    baseRateValue: tier.baseRateValue,
    bonusRateValue: tier.bonusRateValue,
  }));

  const policy: YieldPolicy = {
    indexer: doc.investmentPolicy.indexer ?? 'CDI',
    rateType: doc.investmentPolicy.rateType ?? 'PERCENT_INDEXER',
    dayCountConvention: doc.investmentPolicy.dayCountConvention,
    rateTiers,
  };

  return Investment.create({
    id: doc.id,
    name: doc.name,
    principal: Money.fromBRL(doc.valorInvestido ?? doc.value),
    currentBalance: Money.fromBRL(doc.value),
    startDate,
    policy,
    taxDisplayMode: doc.investmentPolicy.taxDisplayMode,
  });
}

function toDate(value: RawTimestamp): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  try {
    return value.toDate();
  } catch {
    return null;
  }
}
