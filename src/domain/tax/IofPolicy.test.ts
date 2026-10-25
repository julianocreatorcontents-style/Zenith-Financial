import { describe, it, expect } from 'vitest';
import { Money } from '../money/Money';
import { IofPolicy } from './IofPolicy';

describe('IofPolicy.rateFor — tabela regressiva (1º ao 29º dia)', () => {
  it('dia 1 = 96%', () => {
    expect(IofPolicy.rateFor(1)).toBeCloseTo(0.96, 10);
  });
  it('dia 2 = 93%', () => {
    expect(IofPolicy.rateFor(2)).toBeCloseTo(0.93, 10);
  });
  it('dia 15 = 50%', () => {
    expect(IofPolicy.rateFor(15)).toBeCloseTo(0.5, 10);
  });
  it('dia 28 = 6%', () => {
    expect(IofPolicy.rateFor(28)).toBeCloseTo(0.06, 10);
  });
  it('dia 29 = 3%', () => {
    expect(IofPolicy.rateFor(29)).toBeCloseTo(0.03, 10);
  });
});

describe('IofPolicy.rateFor — isenção a partir do 30º dia', () => {
  it('dia 30 = 0', () => {
    expect(IofPolicy.rateFor(30)).toBeCloseTo(0, 10);
  });
  it('dia 100 = 0', () => {
    expect(IofPolicy.rateFor(100)).toBeCloseTo(0, 10);
  });
});

describe('IofPolicy.rateFor — validação', () => {
  it('days = 0 lança', () => {
    expect(() => IofPolicy.rateFor(0)).toThrow();
  });
  it('days = -1 lança', () => {
    expect(() => IofPolicy.rateFor(-1)).toThrow();
  });
  it('days = 1.5 (fracionário) retorna 0 (não casa a tabela)', () => {
    expect(IofPolicy.rateFor(1.5)).toBeCloseTo(0, 10);
  });
});

describe('IofPolicy.calculate — alíquota regressiva', () => {
  it('100 reais a 15 dias = 50.00', () => {
    expect(IofPolicy.calculate(Money.fromBRL(100), 15).toBRL()).toBeCloseTo(50.0, 2);
  });
  it('100 reais a 29 dias = 3.00', () => {
    expect(IofPolicy.calculate(Money.fromBRL(100), 29).toBRL()).toBeCloseTo(3.0, 2);
  });
  it('100 reais a 30 dias = 0 (isento)', () => {
    expect(IofPolicy.calculate(Money.fromBRL(100), 30).toBRL()).toBeCloseTo(0, 2);
  });
});

describe('IofPolicy.calculate — arredondamento e zero', () => {
  it('10.01 × 96% = 9.61 (arredonda centavos)', () => {
    expect(IofPolicy.calculate(Money.fromBRL(10.01), 1).toBRL()).toBeCloseTo(9.61, 2);
  });
  it('rendimento zero = imposto zero', () => {
    expect(IofPolicy.calculate(Money.zero(), 15).toBRL()).toBeCloseTo(0, 2);
  });
});
