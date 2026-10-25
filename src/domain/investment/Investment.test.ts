import { describe, it, expect } from 'vitest';
import { Money } from '../money/Money';
import { Investment } from './Investment';
import type { YieldPolicy } from '../yield/YieldPolicy';

const basePolicy: YieldPolicy = {
  indexer: 'CDI',
  rateType: 'PERCENT_INDEXER',
  dayCountConvention: 'CALENDAR_DAYS_365',
  rateTiers: [{ upTo: null, baseRateValue: 110, bonusRateValue: 29 }],
};

const validInput = {
  id: 'inv-1',
  name: '99Pay',
  principal: Money.fromBRL(5000),
  currentBalance: Money.fromBRL(5069.81),
  startDate: new Date('2026-01-15'),
  policy: basePolicy,
  taxDisplayMode: 'GROSS' as const,
};

describe('Investment.create — validação de campos', () => {
  it('cria com dados válidos', () => {
    const inv = Investment.create(validInput);
    expect(inv.id).toBe('inv-1');
    expect(inv.name).toBe('99Pay');
    expect(inv.principal.toBRL()).toBeCloseTo(5000, 2);
    expect(inv.currentBalance.toBRL()).toBeCloseTo(5069.81, 2);
    expect(inv.taxDisplayMode).toBe('GROSS');
    expect(inv.policy.rateTiers).toHaveLength(1);
  });

  it('rejeita id vazio', () => {
    expect(() => Investment.create({ ...validInput, id: '' })).toThrow();
    expect(() => Investment.create({ ...validInput, id: '   ' })).toThrow();
  });

  it('rejeita name vazio', () => {
    expect(() => Investment.create({ ...validInput, name: '' })).toThrow();
    expect(() => Investment.create({ ...validInput, name: '   ' })).toThrow();
  });

  it('rejeita principal negativo', () => {
    expect(() => Investment.create({ ...validInput, principal: Money.fromBRL(-1) })).toThrow();
  });

  it('rejeita currentBalance negativo', () => {
    expect(() => Investment.create({ ...validInput, currentBalance: Money.fromBRL(-1) })).toThrow();
  });

  it('rejeita startDate inválido (NaN)', () => {
    expect(() => Investment.create({ ...validInput, startDate: new Date('invalid') })).toThrow();
  });
});

describe('Investment.create — validação de rateTiers', () => {
  it('rejeita rateTiers vazio', () => {
    const policyVazio: YieldPolicy = { ...basePolicy, rateTiers: [] };
    expect(() => Investment.create({ ...validInput, policy: policyVazio })).toThrow();
  });

  it('rejeita última faixa sem upTo null', () => {
    const policySemFim: YieldPolicy = {
      ...basePolicy,
      rateTiers: [{ upTo: Money.fromBRL(5000), baseRateValue: 110, bonusRateValue: 29 }],
    };
    expect(() => Investment.create({ ...validInput, policy: policySemFim })).toThrow();
  });

  it('aceita multi-tier com última null', () => {
    const multi: YieldPolicy = {
      ...basePolicy,
      rateTiers: [
        { upTo: Money.fromBRL(5000), baseRateValue: 110, bonusRateValue: 29 },
        { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
      ],
    };
    const inv = Investment.create({ ...validInput, policy: multi });
    expect(inv.policy.rateTiers).toHaveLength(2);
  });
});

describe('Investment.daysInvested', () => {
  const inv = Investment.create(validInput);

  it('mesmo dia = 0', () => {
    expect(inv.daysInvested(new Date('2026-01-15'))).toBe(0);
  });

  it('1 dia corrido', () => {
    expect(inv.daysInvested(new Date('2026-01-16'))).toBe(1);
  });

  it('30 dias corridos', () => {
    expect(inv.daysInvested(new Date('2026-02-14'))).toBe(30);
  });

  it('lança se today < startDate', () => {
    expect(() => inv.daysInvested(new Date('2026-01-14'))).toThrow();
  });

  it('lança se today é NaN', () => {
    expect(() => inv.daysInvested(new Date('invalid'))).toThrow();
  });
});
