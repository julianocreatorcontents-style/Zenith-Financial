import { Money } from '../money/Money';
import { YieldCalculator } from '../yield/YieldCalculator';
import { IncomeTaxPolicy } from '../tax/IncomeTaxPolicy';
import { IofPolicy } from '../tax/IofPolicy';
import { ok, err, type Result } from '../shared/Result';
import type { Investment } from '../investment/Investment';
import type { TaxDisplayMode } from '../investment/Investment';
import type { InvestmentRepoPort } from '../ports/InvestmentRepoPort';
import type { MarketRatePort } from '../ports/MarketRatePort';
import type { ClockPort } from '../ports/ClockPort';

export interface YieldProjection {
  investmentId: string;
  investmentName: string;
  taxDisplayMode: TaxDisplayMode;
  daysInvested: number;
  currentBalance: Money;
  dailyGross: Money;
  cumulativeGrossYield: Money;
  irProvision: Money;
  iofProvision: Money;
  netRedemption: Money;
  projected30Days: Money;
  projected60Days: Money;
  projected90Days: Money;
}

export class RecalculateYields {
  constructor(
    private readonly repo: InvestmentRepoPort,
    private readonly market: MarketRatePort,
    private readonly clock: ClockPort,
  ) {}

  async execute(userId: string): Promise<Result<YieldProjection[], Error>> {
    try {
      const investments = await this.repo.findByUser(userId);
      const today = this.clock.today();
      const projections: YieldProjection[] = [];

      for (const inv of investments) {
        const indexerRate = await this.fetchIndexerRate(inv, today);
        const daysInvested = inv.daysInvested(today);

        const dailyGross = YieldCalculator.dailyYieldTiered(
          inv.currentBalance,
          indexerRate,
          inv.policy,
        );

        const rawGrossYield = inv.currentBalance.subtract(inv.principal);
        const cumulativeGrossYield = rawGrossYield.isNegative()
          ? Money.zero()
          : rawGrossYield;

        const { ir, iof } = this.provisionTaxes(
          cumulativeGrossYield,
          daysInvested,
        );

        const netRedemption = inv.currentBalance.subtract(ir).subtract(iof);

        const projected30Days = YieldCalculator.projectTiered(
          inv.currentBalance, indexerRate, inv.policy, 30,
        );
        const projected60Days = YieldCalculator.projectTiered(
          inv.currentBalance, indexerRate, inv.policy, 60,
        );
        const projected90Days = YieldCalculator.projectTiered(
          inv.currentBalance, indexerRate, inv.policy, 90,
        );

        projections.push({
          investmentId: inv.id,
          investmentName: inv.name,
          taxDisplayMode: inv.taxDisplayMode,
          daysInvested,
          currentBalance: inv.currentBalance,
          dailyGross,
          cumulativeGrossYield,
          irProvision: ir,
          iofProvision: iof,
          netRedemption,
          projected30Days,
          projected60Days,
          projected90Days,
        });
      }

      return ok(projections);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private async fetchIndexerRate(inv: Investment, today: Date): Promise<number> {
    if (inv.policy.rateType === 'FIXED') {
      return 0;
    }
    return this.market.getAnnualRate(inv.policy.indexer, today);
  }

  private provisionTaxes(
    grossYield: Money,
    daysInvested: number,
  ): { ir: Money; iof: Money } {
    if (daysInvested < 1) {
      return { ir: Money.zero(), iof: Money.zero() };
    }
    return {
      ir: IncomeTaxPolicy.calculate(grossYield, daysInvested),
      iof: IofPolicy.calculate(grossYield, daysInvested),
    };
  }
}
