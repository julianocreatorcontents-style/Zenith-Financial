import { assetToInvestment } from './assetToInvestment';
import type { RawAssetDoc } from './assetToInvestment';
import { YieldCalculator } from '../../domain/yield/YieldCalculator';
import { IncomeTaxPolicy } from '../../domain/tax/IncomeTaxPolicy';
import { IofPolicy } from '../../domain/tax/IofPolicy';
import { Money } from '../../domain/money/Money';
import type { Investment } from '../../domain/investment/Investment';
import type { YieldPolicy } from '../../domain/yield/YieldPolicy';
import { calculateNetWorth } from '../finance';

export const DEFAULT_CDI_ANNUAL_PERCENT = 13.65;

const MS_PER_DAY = 86_400_000;

const DEFAULT_CONTRIBUTION_POLICY: YieldPolicy = {
  indexer: 'CDI',
  rateType: 'PERCENT_INDEXER',
  dayCountConvention: 'CALENDAR_DAYS_365',
  rateTiers: [{ upTo: null, baseRateValue: 100, bonusRateValue: 0 }],
};

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
  contributedTotal?: number;
}

export interface NetWorthProjectionInput {
  assets?: RawAssetDoc[];
  transactions?: any[];
  cdiAnnualPercent?: number;
  months?: number;
  from?: Date;
  monthlyContribution?: number;
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
 * Converte dias corridos em dias de projeção da convenção do ativo (dias úteis ou corridos).
 * Ativos em BUSINESS_DAYS_252 capitalizam apenas em dias úteis (~252/365 do calendário).
 */
function getConventionDays(calendarDays: number, policy: YieldPolicy): number {
  if (policy.dayCountConvention === 'BUSINESS_DAYS_252') {
    return Math.max(1, Math.round((calendarDays * 252) / 365));
  }
  return calendarDays;
}

/**
 * Projeta o saldo líquido (após IR regressivo e IOF) de um único investimento
 * para um horizonte de `futureDays` dias a partir de hoje.
 *
 * - IOF: aplica-se apenas nos primeiros 29 dias corridos após o investimento;
 *   como estamos projetando meses futuros, `alreadyInvested + futureDays`
 *   determina o período total.
 * - IR: taxa regressiva baseada no total de dias ao resgatar (dias corridos).
 * - Capitalização: respeita a convenção de dias do ativo (dias úteis ou corridos).
 */
function projectNetBalance(
  investment: Investment,
  cdiAnnualPercent: number,
  alreadyInvested: number,
  futureDays: number,
): number {
  const compoundDays = getConventionDays(futureDays, investment.policy);

  if (investment.taxDisplayMode !== 'NET') {
    return YieldCalculator.projectTiered(
      investment.currentBalance,
      cdiAnnualPercent,
      investment.policy,
      compoundDays,
    ).toBRL();
  }

  const totalDays = Math.max(1, alreadyInvested + futureDays);

  // IR regressivo com base no total de dias ao resgatar (dias corridos)
  const irRate = IncomeTaxPolicy.rateFor(totalDays);

  // IOF: só incide nos primeiros 29 dias do investimento, e diminui diariamente (dias corridos)
  const iofRate = totalDays <= 29 ? IofPolicy.rateFor(totalDays) : 0;

  // Taxa combinada de imposto (IR + IOF), limitada a 100%
  const combinedTaxRate = Math.min(irRate + iofRate, 1);

  const netPolicy = buildNetPolicy(investment.policy, combinedTaxRate);

  return YieldCalculator.projectTiered(
    investment.currentBalance,
    cdiAnnualPercent,
    netPolicy,
    compoundDays,
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
    monthlyContribution = 0,
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
      contributedTotal: 0,
    },
  ];

  const safeMonths = Math.max(0, Math.floor(months));
  const safeContribution = Math.max(0, Number(monthlyContribution) || 0);

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

      const compoundDays = getConventionDays(futureDays, investment.policy);

      // Projeção bruta (sem impostos)
      projectedGross += YieldCalculator.projectTiered(
        investment.currentBalance,
        cdiAnnualPercent,
        investment.policy,
        compoundDays,
      ).toBRL();

      // Projeção líquida (com IR + IOF regressivos por ativo)
      projectedNet += projectNetBalance(
        investment,
        cdiAnnualPercent,
        alreadyInvested,
        futureDays,
      );
    }

    // Projeção de aportes recorrentes mensais (se informados)
    let contributionsGross = 0;
    let contributionsNet = 0;

    if (safeContribution > 0) {
      for (let k = 1; k <= offset; k++) {
        // Aporte realizado no início do mês k
        const contributionDate = new Date(today.getFullYear(), today.getMonth() + k - 1, 1);
        const days = Math.max(1, Math.round((target.getTime() - contributionDate.getTime()) / MS_PER_DAY));

        // Bruto a 100% do CDI
        contributionsGross += YieldCalculator.projectTiered(
          Money.fromBRL(safeContribution),
          cdiAnnualPercent,
          DEFAULT_CONTRIBUTION_POLICY,
          days,
        ).toBRL();

        // Líquido com IR regressivo + IOF
        const irRate = IncomeTaxPolicy.rateFor(days);
        const iofRate = days <= 29 ? IofPolicy.rateFor(days) : 0;
        const netPolicy = buildNetPolicy(DEFAULT_CONTRIBUTION_POLICY, Math.min(irRate + iofRate, 1));
        contributionsNet += YieldCalculator.projectTiered(
          Money.fromBRL(safeContribution),
          cdiAnnualPercent,
          netPolicy,
          days,
        ).toBRL();
      }
    }

    const monthLabel = `${MONTHS_SHORT[target.getMonth()]}/${String(target.getFullYear()).slice(-2)}`;
    const dateLabel = `${MONTHS_FULL[target.getMonth()]} de ${target.getFullYear()}`;
    const totalContributed = safeContribution * offset;

    points.push({
      name: monthLabel,
      value: roundCurrency(nonInvestmentNetWorth + projectedGross + contributionsGross),
      valueNet: roundCurrency(nonInvestmentNetWorth + projectedNet + contributionsNet),
      date: `${dateLabel} · Projeção`,
      projected: true,
      contributedTotal: totalContributed > 0 ? roundCurrency(totalContributed) : undefined,
    });
  }

  return points;
}
