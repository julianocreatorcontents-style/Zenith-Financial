import { assetToInvestment } from './assetToInvestment';
import type { RawAssetDoc } from './assetToInvestment';
import { YieldCalculator } from '../../domain/yield/YieldCalculator';
import type { Investment } from '../../domain/investment/Investment';
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
  const points: NetWorthProjectionPoint[] = [
    {
      name: 'Hoje',
      value: roundCurrency(baseNetWorth),
      date: `Hoje · ${day} de ${MONTHS_SHORT[today.getMonth()]}`,
      projected: false,
    },
  ];

  const safeMonths = Math.max(0, Math.floor(months));

  for (let offset = 1; offset <= safeMonths; offset++) {
    const target = new Date(today.getFullYear(), today.getMonth() + offset, 0);
    const days = Math.max(
      1,
      Math.round((target.getTime() - today.getTime()) / MS_PER_DAY),
    );

    const projectedInvestments = investments.reduce((sum, investment) => {
      const projected = YieldCalculator.projectTiered(
        investment.currentBalance,
        cdiAnnualPercent,
        investment.policy,
        days,
      );
      return sum + projected.toBRL();
    }, 0);

    points.push({
      name: `${MONTHS_SHORT[target.getMonth()]}/${String(target.getFullYear()).slice(-2)}`,
      value: roundCurrency(nonInvestmentNetWorth + projectedInvestments),
      date: `${MONTHS_FULL[target.getMonth()]} de ${target.getFullYear()} · Projeção bruta`,
      projected: true,
    });
  }

  return points;
}
