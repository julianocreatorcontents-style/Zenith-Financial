import { Money } from '../money/Money';
import type { YieldPolicy } from '../yield/YieldPolicy';

export type TaxDisplayMode = 'GROSS' | 'NET';

export interface InvestmentInput {
  id: string;
  name: string;
  principal: Money;
  currentBalance: Money;
  startDate: Date;
  policy: YieldPolicy;
  taxDisplayMode: TaxDisplayMode;
}

const MS_PER_DAY = 86_400_000;

export class Investment {
  readonly id: string;
  readonly name: string;
  readonly principal: Money;
  readonly currentBalance: Money;
  readonly startDate: Date;
  readonly policy: YieldPolicy;
  readonly taxDisplayMode: TaxDisplayMode;

  private constructor(input: InvestmentInput) {
    this.id = input.id;
    this.name = input.name;
    this.principal = input.principal;
    this.currentBalance = input.currentBalance;
    this.startDate = input.startDate;
    this.policy = input.policy;
    this.taxDisplayMode = input.taxDisplayMode;
  }

  static create(input: InvestmentInput): Investment {
    if (!input.id || input.id.trim() === '') {
      throw new Error('Investment.id não pode ser vazio');
    }
    if (!input.name || input.name.trim() === '') {
      throw new Error('Investment.name não pode ser vazio');
    }
    if (input.principal.isNegative()) {
      throw new Error('Investment.principal não pode ser negativo');
    }
    if (input.currentBalance.isNegative()) {
      throw new Error('Investment.currentBalance não pode ser negativo');
    }
    if (!(input.startDate instanceof Date) || Number.isNaN(input.startDate.getTime())) {
      throw new Error('Investment.startDate inválido');
    }
    if (input.policy.rateTiers.length === 0) {
      throw new Error('Investment.policy.rateTiers não pode ser vazio');
    }
    const lastTier = input.policy.rateTiers[input.policy.rateTiers.length - 1];
    if (lastTier === undefined || lastTier.upTo !== null) {
      throw new Error('Investment.policy: última faixa deve ter upTo=null');
    }

    return new Investment(input);
  }

  daysInvested(today: Date): number {
    if (!(today instanceof Date) || Number.isNaN(today.getTime())) {
      throw new Error('today inválido');
    }
    const diffMs = today.getTime() - this.startDate.getTime();
    if (diffMs < 0) {
      throw new Error('today não pode ser anterior a startDate');
    }
    return Math.floor(diffMs / MS_PER_DAY);
  }
}
