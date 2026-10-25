import { describe, it, expect } from 'vitest';
import { Money } from '../money/Money';
import { YieldCalculator } from './YieldCalculator';
import type { DayCountConvention, RateTier, YieldPolicy } from './YieldPolicy';

const policy = (
  rateType: YieldPolicy['rateType'],
  rateValue: number,
  convention: DayCountConvention = 'BUSINESS_DAYS_252',
): YieldPolicy => ({
  indexer: 'CDI',
  rateType,
  dayCountConvention: convention,
  rateTiers: [{ upTo: null, baseRateValue: rateValue, bonusRateValue: 0 }],
});

const tieredPolicy = (
  rateType: YieldPolicy['rateType'],
  rateTiers: RateTier[],
  convention: DayCountConvention = 'CALENDAR_DAYS_365',
): YieldPolicy => ({
  indexer: 'CDI',
  rateType,
  dayCountConvention: convention,
  rateTiers,
});

describe('YieldCalculator.annualToDaily', () => {
  it('deve retornar zero quando a taxa anual é zero', () => {
    expect(YieldCalculator.annualToDaily(0, 'BUSINESS_DAYS_252')).toBeCloseTo(0, 8);
  });

  it('deve converter 100% a.a. em ~0.00275437 ao dia útil (base 252)', () => {
    expect(YieldCalculator.annualToDaily(100, 'BUSINESS_DAYS_252')).toBeCloseTo(0.00275437, 8);
  });

  it('deve reconstituir 100% a.a. capitalizando 252 dias úteis', () => {
    const daily = YieldCalculator.annualToDaily(100, 'BUSINESS_DAYS_252');
    expect(Math.pow(1 + daily, 252) - 1).toBeCloseTo(1, 6);
  });
});

describe('YieldCalculator.annualToDaily — base 365', () => {
  it('deve retornar zero quando a taxa anual é zero', () => {
    expect(YieldCalculator.annualToDaily(0, 'CALENDAR_DAYS_365')).toBeCloseTo(0, 8);
  });

  it('deve converter 100% a.a. em ~0.0019007 ao dia corrido', () => {
    expect(YieldCalculator.annualToDaily(100, 'CALENDAR_DAYS_365')).toBeCloseTo(0.0019007, 6);
  });

  it('deve provar que base 365 difere de base 252', () => {
    const d365 = YieldCalculator.annualToDaily(100, 'CALENDAR_DAYS_365');
    const d252 = YieldCalculator.annualToDaily(100, 'BUSINESS_DAYS_252');
    expect(d365).toBeLessThan(d252);
  });

  it('deve reconstituir 100% a.a. capitalizando 365 dias corridos', () => {
    const daily = YieldCalculator.annualToDaily(100, 'CALENDAR_DAYS_365');
    expect(Math.pow(1 + daily, 365) - 1).toBeCloseTo(1, 6);
  });
});

describe('YieldCalculator.effectiveAnnual', () => {
  it('PERCENT_INDEXER 100% do CDI 10% = 10', () => {
    expect(YieldCalculator.effectiveAnnual(10, policy('PERCENT_INDEXER', 100))).toBeCloseTo(10, 6);
  });

  it('PERCENT_INDEXER 105% do CDI 10% = 10.5', () => {
    expect(YieldCalculator.effectiveAnnual(10, policy('PERCENT_INDEXER', 105))).toBeCloseTo(10.5, 6);
  });

  it('PERCENT_INDEXER 0% = 0', () => {
    expect(YieldCalculator.effectiveAnnual(10, policy('PERCENT_INDEXER', 0))).toBeCloseTo(0, 6);
  });

  it('SPREAD CDI 10% + 2% = 12.2 (composto)', () => {
    expect(YieldCalculator.effectiveAnnual(10, policy('SPREAD', 2))).toBeCloseTo(12.2, 6);
  });

  it('SPREAD com rateValue 0 = indexador', () => {
    expect(YieldCalculator.effectiveAnnual(10, policy('SPREAD', 0))).toBeCloseTo(10, 6);
  });

  it('FIXED 11.5 ignora indexador', () => {
    expect(YieldCalculator.effectiveAnnual(10, policy('FIXED', 11.5))).toBeCloseTo(11.5, 6);
    expect(YieldCalculator.effectiveAnnual(0, policy('FIXED', 11.5))).toBeCloseTo(11.5, 6);
  });

  it('FIXED 0 = 0', () => {
    expect(YieldCalculator.effectiveAnnual(10, policy('FIXED', 0))).toBeCloseTo(0, 6);
  });
});

describe('YieldCalculator.project (single-tier)', () => {
  it('FIXED 11.5% sobre 1000 em 252 dias = 1115.00', () => {
    const r = YieldCalculator.project(Money.fromBRL(1000), 10, policy('FIXED', 11.5), 252);
    expect(r.toBRL()).toBeCloseTo(1115.0, 2);
  });

  it('100% do CDI 10% sobre 1000 em 252 dias = 1100.00', () => {
    const r = YieldCalculator.project(Money.fromBRL(1000), 10, policy('PERCENT_INDEXER', 100), 252);
    expect(r.toBRL()).toBeCloseTo(1100.0, 2);
  });

  it('105% do CDI 10% sobre 1000 em 252 dias = 1105.00 (teste de ouro)', () => {
    const r = YieldCalculator.project(Money.fromBRL(1000), 10, policy('PERCENT_INDEXER', 105), 252);
    expect(r.toBRL()).toBeCloseTo(1105.0, 2);
  });

  it('SPREAD CDI+2% sobre 1000 em 252 dias = 1122.00', () => {
    const r = YieldCalculator.project(Money.fromBRL(1000), 10, policy('SPREAD', 2), 252);
    expect(r.toBRL()).toBeCloseTo(1122.0, 2);
  });

  it('taxa zero devolve o principal', () => {
    const r = YieldCalculator.project(Money.fromBRL(1000), 0, policy('FIXED', 0), 252);
    expect(r.toBRL()).toBeCloseTo(1000.0, 2);
  });

  it('businessDays=0 devolve o principal exato', () => {
    const p = Money.fromBRL(1000);
    expect(YieldCalculator.project(p, 10, policy('PERCENT_INDEXER', 105), 0).equals(p)).toBe(true);
  });

  it('principal zero retorna zero', () => {
    const r = YieldCalculator.project(Money.zero(), 10, policy('SPREAD', 2), 252);
    expect(r.toBRL()).toBeCloseTo(0, 2);
    expect(r.equals(Money.zero())).toBe(true);
  });

  it('rejeita política multi-tier com erro claro', () => {
    const multi = tieredPolicy('PERCENT_INDEXER', [
      { upTo: Money.fromBRL(5000), baseRateValue: 110, bonusRateValue: 29 },
      { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
    ]);
    expect(() => YieldCalculator.project(Money.fromBRL(1000), 13.65, multi, 1)).toThrow();
  });
});

describe('YieldCalculator.dailyYield', () => {
  it('FIXED 11.5% sobre 1000 = 0.43/dia', () => {
    const r = YieldCalculator.dailyYield(Money.fromBRL(1000), 10, policy('FIXED', 11.5));
    expect(r.toBRL()).toBeCloseTo(0.43, 2);
  });

  it('100% CDI 10% sobre 1000 = 0.38/dia', () => {
    const r = YieldCalculator.dailyYield(Money.fromBRL(1000), 10, policy('PERCENT_INDEXER', 100));
    expect(r.toBRL()).toBeCloseTo(0.38, 2);
  });

  it('taxa zero = 0', () => {
    const r = YieldCalculator.dailyYield(Money.fromBRL(1000), 0, policy('FIXED', 0));
    expect(r.toBRL()).toBeCloseTo(0, 2);
  });

  it('igual a project(1) - principal', () => {
    const p = Money.fromBRL(1000);
    const pol = policy('SPREAD', 2);
    const daily = YieldCalculator.dailyYield(p, 10, pol);
    const expected = YieldCalculator.project(p, 10, pol, 1).subtract(p);
    expect(daily.equals(expected)).toBe(true);
  });
});

describe('YieldCalculator.projectTiered — 99Pay com 2 faixas', () => {
  const tiers99pay: RateTier[] = [
    { upTo: Money.fromBRL(5000), baseRateValue: 110, bonusRateValue: 29 },
    { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
  ];

  it('single-tier delega para project e dá valor exato', () => {
    const p = policy('FIXED', 11.5);
    const viaTiered = YieldCalculator.projectTiered(Money.fromBRL(1000), 13.65, p, 252);
    const viaProject = YieldCalculator.project(Money.fromBRL(1000), 13.65, p, 252);
    expect(viaTiered.equals(viaProject)).toBe(true);
  });

  it('MP Saldo 105% CDI em 252 dias sobre 8985.72 ≈ 10273.60', () => {
    const mp = tieredPolicy(
      'PERCENT_INDEXER',
      [{ upTo: null, baseRateValue: 105, bonusRateValue: 0 }],
      'BUSINESS_DAYS_252',
    );
    const r = YieldCalculator.projectTiered(Money.fromBRL(8985.72), 13.65, mp, 252);
    expect(r.toBRL()).toBeCloseTo(10273.60, 1);
  });

  it('99Pay 5000 a 139% em 1 dia = 5002.38', () => {
    const r = YieldCalculator.projectTiered(
      Money.fromBRL(5000), 13.65, tieredPolicy('PERCENT_INDEXER', tiers99pay), 1,
    );
    expect(r.toBRL()).toBeCloseTo(5002.38, 2);
  });

  it('99Pay 5069.81 em 1 dia = 5072.21 (R$ 2,40 real)', () => {
    const r = YieldCalculator.projectTiered(
      Money.fromBRL(5069.81), 13.65, tieredPolicy('PERCENT_INDEXER', tiers99pay), 1,
    );
    expect(r.toBRL()).toBeCloseTo(5072.21, 2);
  });

  it('99Pay fim de semana 14116.71 em 1 dia = 14121.68 (R$ 4,97 real)', () => {
    const r = YieldCalculator.projectTiered(
      Money.fromBRL(14116.71), 13.65, tieredPolicy('PERCENT_INDEXER', tiers99pay), 1,
    );
    expect(r.toBRL()).toBeCloseTo(14121.68, 2);
  });

  it('days=0 devolve principal', () => {
    const p = Money.fromBRL(5069.81);
    const r = YieldCalculator.projectTiered(p, 13.65, tieredPolicy('PERCENT_INDEXER', tiers99pay), 0);
    expect(r.equals(p)).toBe(true);
  });
});

describe('YieldCalculator.dailyYieldTiered — bate com extrato real da 99Pay', () => {
  const tiers99pay: RateTier[] = [
    { upTo: Money.fromBRL(5000), baseRateValue: 110, bonusRateValue: 29 },
    { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
  ];

  it('R$ 5000 = R$ 2,38/dia (só tier 1)', () => {
    const r = YieldCalculator.dailyYieldTiered(
      Money.fromBRL(5000), 13.65, tieredPolicy('PERCENT_INDEXER', tiers99pay),
    );
    expect(r.toBRL()).toBeCloseTo(2.38, 2);
  });

  it('R$ 5069.81 = R$ 2,40/dia (extrato real)', () => {
    const r = YieldCalculator.dailyYieldTiered(
      Money.fromBRL(5069.81), 13.65, tieredPolicy('PERCENT_INDEXER', tiers99pay),
    );
    expect(r.toBRL()).toBeCloseTo(2.40, 2);
  });

  it('R$ 14116.71 = R$ 4,97/dia (fim de semana real)', () => {
    const r = YieldCalculator.dailyYieldTiered(
      Money.fromBRL(14116.71), 13.65, tieredPolicy('PERCENT_INDEXER', tiers99pay),
    );
    expect(r.toBRL()).toBeCloseTo(4.97, 2);
  });
});
