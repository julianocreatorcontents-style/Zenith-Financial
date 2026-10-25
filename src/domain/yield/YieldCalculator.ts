import { Money } from "../money/Money";
import type {
  DayCountConvention,
  RateType,
  YieldPolicy,
} from "./YieldPolicy";

const DAYS_PER_YEAR: Record<DayCountConvention, number> = {
  BUSINESS_DAYS_252: 252,
  CALENDAR_DAYS_365: 365,
};

export class YieldCalculator {
  static annualToDaily(
    annualPercent: number,
    convention: DayCountConvention,
  ): number {
    return (1 + annualPercent / 100) ** (1 / DAYS_PER_YEAR[convention]) - 1;
  }

  private static effectiveAnnualForRate(
    indexerAnnualPercent: number,
    rateType: RateType,
    effectiveRateValue: number,
  ): number {
    switch (rateType) {
      case "PERCENT_INDEXER":
        return (indexerAnnualPercent * effectiveRateValue) / 100;
      case "SPREAD":
        return (
          ((1 + indexerAnnualPercent / 100) * (1 + effectiveRateValue / 100) - 1) *
          100
        );
      case "FIXED":
        return effectiveRateValue;
      default:
        throw new Error(`Unsupported rate type: ${rateType}`);
    }
  }

  static effectiveAnnual(
    indexerAnnualPercent: number,
    policy: YieldPolicy,
  ): number {
    if (policy.rateTiers.length !== 1) {
      throw new Error(
        "effectiveAnnual só suporta políticas single-tier. Use projectTiered/dailyYieldTiered para multi-tier.",
      );
    }

    const tier = policy.rateTiers[0];
    if (tier === undefined) {
      throw new Error("rateTiers está vazio");
    }
    const effectiveRate = tier.baseRateValue + tier.bonusRateValue;

    return YieldCalculator.effectiveAnnualForRate(
      indexerAnnualPercent,
      policy.rateType,
      effectiveRate,
    );
  }

  static project(
    principal: Money,
    indexerAnnualPercent: number,
    policy: YieldPolicy,
    businessDays: number,
  ): Money {
    const firstTier = policy.rateTiers[0];
    if (policy.rateTiers.length !== 1 || firstTier === undefined || firstTier.upTo !== null) {
      throw new Error(
        "project() requer política single-tier com upTo=null. Use projectTiered() para faixas com cap.",
      );
    }

    if (businessDays === 0) {
      return principal;
    }

    const annual = YieldCalculator.effectiveAnnual(indexerAnnualPercent, policy);
    const daily = YieldCalculator.annualToDaily(
      annual,
      policy.dayCountConvention,
    );

    return principal.multiply((1 + daily) ** businessDays);
  }

  static dailyYield(
    principal: Money,
    indexerAnnualPercent: number,
    policy: YieldPolicy,
  ): Money {
    return YieldCalculator.project(
      principal,
      indexerAnnualPercent,
      policy,
      1,
    ).subtract(principal);
  }

  static projectTiered(
    principal: Money,
    indexerAnnualPercent: number,
    policy: YieldPolicy,
    days: number,
  ): Money {
    if (days === 0) {
      return principal;
    }

    const firstTier = policy.rateTiers[0];
    if (policy.rateTiers.length === 1 && firstTier !== undefined && firstTier.upTo === null) {
      return YieldCalculator.project(
        principal,
        indexerAnnualPercent,
        policy,
        days,
      );
    }

    let balance = principal;

    for (let d = 0; d < days; d++) {
      let dayYield = Money.zero();
      let remaining = balance.toBRL();

      for (const tier of policy.rateTiers) {
        const cap =
          tier.upTo === null
            ? remaining
            : Math.min(tier.upTo.toBRL(), remaining);

        if (cap <= 0) {
          break;
        }

        const effectiveRate = tier.baseRateValue + tier.bonusRateValue;
        const annual = YieldCalculator.effectiveAnnualForRate(
          indexerAnnualPercent,
          policy.rateType,
          effectiveRate,
        );
        const daily = YieldCalculator.annualToDaily(
          annual,
          policy.dayCountConvention,
        );
        const tierMoney = Money.fromBRL(cap);

        dayYield = dayYield.add(tierMoney.multiply(daily));
        remaining -= cap;
      }

      balance = balance.add(dayYield);
    }

    return balance;
  }

  static dailyYieldTiered(
    principal: Money,
    indexerAnnualPercent: number,
    policy: YieldPolicy,
  ): Money {
    return YieldCalculator.projectTiered(
      principal,
      indexerAnnualPercent,
      policy,
      1,
    ).subtract(principal);
  }
}
