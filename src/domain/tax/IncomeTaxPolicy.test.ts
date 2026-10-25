import { describe, it, expect } from 'vitest';
import { Money } from '../money/Money';
import { IncomeTaxPolicy } from './IncomeTaxPolicy';

describe('IncomeTaxPolicy.rateFor — faixa 1 (até 180 dias)', () => {
  it('1 dia = 22.5%', () => {
    expect(IncomeTaxPolicy.rateFor(1)).toBeCloseTo(0.225, 10);
  });
  it('180 dias = 22.5% (fronteira superior)', () => {
    expect(IncomeTaxPolicy.rateFor(180)).toBeCloseTo(0.225, 10);
  });
});

describe('IncomeTaxPolicy.rateFor — faixa 2 (181-360)', () => {
  it('181 dias = 20% (fronteira inferior)', () => {
    expect(IncomeTaxPolicy.rateFor(181)).toBeCloseTo(0.2, 10);
  });
  it('360 dias = 20% (fronteira superior)', () => {
    expect(IncomeTaxPolicy.rateFor(360)).toBeCloseTo(0.2, 10);
  });
});

describe('IncomeTaxPolicy.rateFor — faixa 3 (361-720)', () => {
  it('361 dias = 17.5% (fronteira inferior)', () => {
    expect(IncomeTaxPolicy.rateFor(361)).toBeCloseTo(0.175, 10);
  });
  it('720 dias = 17.5% (fronteira superior)', () => {
    expect(IncomeTaxPolicy.rateFor(720)).toBeCloseTo(0.175, 10);
  });
});

describe('IncomeTaxPolicy.rateFor — faixa 4 (> 720)', () => {
  it('721 dias = 15% (fronteira inferior)', () => {
    expect(IncomeTaxPolicy.rateFor(721)).toBeCloseTo(0.15, 10);
  });
  it('1000 dias = 15%', () => {
    expect(IncomeTaxPolicy.rateFor(1000)).toBeCloseTo(0.15, 10);
  });
});

describe('IncomeTaxPolicy.rateFor — validação', () => {
  it('days = 0 lança', () => {
    expect(() => IncomeTaxPolicy.rateFor(0)).toThrow();
  });
  it('days = -1 lança', () => {
    expect(() => IncomeTaxPolicy.rateFor(-1)).toThrow();
  });
});

describe('IncomeTaxPolicy.calculate — alíquota por faixa', () => {
  it('100 reais a 180 dias = 22.50', () => {
    expect(IncomeTaxPolicy.calculate(Money.fromBRL(100), 180).toBRL()).toBeCloseTo(22.5, 2);
  });
  it('100 reais a 181 dias = 20.00', () => {
    expect(IncomeTaxPolicy.calculate(Money.fromBRL(100), 181).toBRL()).toBeCloseTo(20.0, 2);
  });
  it('100 reais a 361 dias = 17.50', () => {
    expect(IncomeTaxPolicy.calculate(Money.fromBRL(100), 361).toBRL()).toBeCloseTo(17.5, 2);
  });
  it('100 reais a 721 dias = 15.00', () => {
    expect(IncomeTaxPolicy.calculate(Money.fromBRL(100), 721).toBRL()).toBeCloseTo(15.0, 2);
  });
});

describe('IncomeTaxPolicy.calculate — arredondamento e zero', () => {
  it('10.01 × 17.5% = 1.75 (arredonda centavos)', () => {
    expect(IncomeTaxPolicy.calculate(Money.fromBRL(10.01), 361).toBRL()).toBeCloseTo(1.75, 2);
  });
  it('rendimento zero = imposto zero', () => {
    expect(IncomeTaxPolicy.calculate(Money.zero(), 180).toBRL()).toBeCloseTo(0, 2);
  });
  it('days = 0 lança', () => {
    expect(() => IncomeTaxPolicy.calculate(Money.fromBRL(100), 0)).toThrow();
  });
});
