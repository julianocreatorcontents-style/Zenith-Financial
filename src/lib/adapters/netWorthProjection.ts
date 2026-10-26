import { assetToInvestment } from './assetToInvestment';
import type { RawAssetDoc } from './assetToInvestment';
import { YieldCalculator } from '../../domain/yield/YieldCalculator';
import { IncomeTaxPolicy } from '../../domain/tax/IncomeTaxPolicy';
import { IofPolicy } from '../../domain/tax/IofPolicy';
import type { Investment } from '../../domain/investment/Investment';
import type { YieldPolicy } from '../../domain/yield/YieldPolicy';
import { calculateNetWorth } from '../finance';

export const DEFAULT_CDI_ANNUAL_PERCENT = 13.65;

const MS_PER_DAY = 86_400_000;

const MONTHS_SHORT = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
];

const MONTHS_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface NetWorthProjectionPoint {
  name: string;
  value: number;
  valueNet: number;
  date: string;
  projected: boolean;
}

export interface NetWorthProjectionInput {
  assets?: RawAssetDoc[];
  transactions?: any[];
  cdiAnnualPercent?: number;
  months?: number;
  from?: Date;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Constrói uma YieldPolicy com as taxas ajustadas pelo fator líquido de IR.
 * Funciona da mesma forma que `buildNetPolicy` no YieldProjectionCard.
 */
function buildNetPolicy(policy: YieldPolicy, irRate: number): YieldPolicy {
  const factor = 1 - irRate;
  return {
    ...policy,
    rateTiers: policy.rateTiers.map((t) => ({
      upTo: t.upTo,
      baseRateValue: t.baseRateValue * factor,
      bonusRateValue: t.bonusRateValue * factor,
    })),
  };
}

/**
 * Projeta o saldo líquido (após IR regressivo e IOF) de um único investimento
 * para um horizonte de `futureDays` dias a partir de hoje.
 *
 * - IOF: aplica-se apenas nos primeiros 29 dias corridos após o investimento;
 *   como estamos projetando meses futuros, `alreadyInvested + futureDays`
 *   determina o período total.
 * - IR: taxa regressiva baseada no total de dias ao resgatar.
 */
function projectNetBalance(
  investment: Investment,
  cdiAnnualPercent: number,
  alreadyInvested: number,
  futureDays: number,
): number {
  if (investment.taxDisplayMode !== 'NET') {
    return YieldCalculator.projectTiered(
      investment.currentBalance,
      cdiAnnualPercent,
      investment.policy,
      futureDays,
    ).toBRL();
  }

  const totalDays = Math.max(1, alreadyInvested + futureDays);

  // IR regressivo com base no total de dias ao resgatar
  const irRate = IncomeTaxPolicy.rateFor(totalDays);

  // IOF: só incide nos primeiros 29 dias do investimento, e diminui diariamente
  const iofRate = totalDays <= 29 ? IofPolicy.rateFor(totalDays) : 0;

  // Taxa combinada de imposto (IR + IOF), limitada a 100%
  const combinedTaxRate = Math.min(irRate + iofRate, 1);

  const netPolicy = buildNetPolicy(investment.policy, combinedTaxRate);

  return YieldCalculator.projectTiered(
    investment.currentBalance,
    cdiAnnualPercent,
    netPolicy,
    futureDays,
  ).toBRL();
}

export function calculateNetWorthProjection(
  input: NetWorthProjectionInput = {},
): NetWorthProjectionPoint[] {
  const {
    assets = [],
    transactions = [],
    cdiAnnualPercent = DEFAULT_CDI_ANNUAL_PERCENT,
    months = 12,
    from = new Date(),
  } = input;

  const today = startOfLocalDay(from);
  const baseNetWorth = calculateNetWorth(assets, transactions);
  const investments = assets
    .map(assetToInvestment)
    .filter((investment): investment is Investment => investment !== null);

  const currentInvestments = investments.reduce(
    (sum, investment) => sum + investment.currentBalance.toBRL(),
    0,
  );
  const nonInvestmentNetWorth = roundCurrency(baseNetWorth - currentInvestments);

  const day = today.getDate().toString().padStart(2, '0');
  const todayValue = roundCurrency(baseNetWorth);

  const points: NetWorthProjectionPoint[] = [
    {
      name: 'Hoje',
      value: todayValue,
      valueNet: todayValue,
      date: `Hoje · ${day} de ${MONTHS_SHORT[today.getMonth()]}`,
      projected: false,
    },
  ];

  const safeMonths = Math.max(0, Math.floor(months));

  for (let offset = 1; offset <= safeMonths; offset++) {
    const target = new Date(today.getFullYear(), today.getMonth() + offset, 0);
    const futureDays = Math.max(
      1,
      Math.round((target.getTime() - today.getTime()) / MS_PER_DAY),
    );

    let projectedGross = 0;
    let projectedNet = 0;

    for (const investment of investments) {
      const evaluationDate =
        today.getTime() >= investment.startDate.getTime()
          ? today
          : investment.startDate;
      const alreadyInvested = investment.daysInvested(evaluationDate);

      // Projeção bruta (sem impostos)
      projectedGross += YieldCalculator.projectTiered(
        investment.currentBalance,
        cdiAnnualPercent,
        investment.policy,
        futureDays,
      ).toBRL();

      // Projeção líquida (com IR + IOF regressivos por ativo)
      projectedNet += projectNetBalance(
        investment,
        cdiAnnualPercent,
        alreadyInvested,
        futureDays,
      );
    }

    const monthLabel = `${MONTHS_SHORT[target.getMonth()]}/${String(target.getFullYear()).slice(-2)}`;
    const dateLabel = `${MONTHS_FULL[target.getMonth()]} de ${target.getFullYear()}`;

    points.push({
      name: monthLabel,
      value: roundCurrency(nonInvestmentNetWorth + projectedGross),
      valueNet: roundCurrency(nonInvestmentNetWorth + projectedNet),
      date: `${dateLabel} · Projeção`,
      projected: true,
    });
  }

  return points;
}
