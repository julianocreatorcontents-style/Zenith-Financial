import { describe, it, expect } from 'vitest';
import { Rate } from './Rate';

describe('Rate.fromPercent e toPercent', () => {
  it('deve preservar o percentual informado', () => {
    expect(Rate.fromPercent(10.5).toPercent()).toBeCloseTo(10.5, 6);
  });

  it('deve representar zero percentual', () => {
    const r = Rate.fromPercent(0);
    expect(r.toPercent()).toBeCloseTo(0, 6);
    expect(r.toDecimal()).toBeCloseTo(0, 6);
  });

  it('deve arredondar 0.005% para o bps mais próximo (0.01%)', () => {
    expect(Rate.fromPercent(0.005).toPercent()).toBeCloseTo(0.01, 6);
  });
});

describe('Rate.toDecimal', () => {
  it('deve converter 10.5% para 0.105', () => {
    expect(Rate.fromPercent(10.5).toDecimal()).toBeCloseTo(0.105, 6);
  });

  it('deve converter 1% para 0.01 (100 bps)', () => {
    expect(Rate.fromPercent(1).toDecimal()).toBeCloseTo(0.01, 6);
  });

  it('deve converter 100% para 1', () => {
    expect(Rate.fromPercent(100).toDecimal()).toBeCloseTo(1, 6);
  });
});

describe('Rate.multiply', () => {
  it('deve dobrar o percentual ao multiplicar por 2', () => {
    expect(Rate.fromPercent(10.5).multiply(2).toPercent()).toBeCloseTo(21, 6);
  });

  it('deve reduzir pela metade ao multiplicar por 0.5', () => {
    expect(Rate.fromPercent(10).multiply(0.5).toPercent()).toBeCloseTo(5, 6);
  });

  it('deve retornar zero ao multiplicar por zero', () => {
    expect(Rate.fromPercent(10).multiply(0).toPercent()).toBeCloseTo(0, 6);
  });

  it('deve arredondar o resultado para o bps mais próximo', () => {
    expect(Rate.fromPercent(10.5).multiply(0.333).toPercent()).toBeCloseTo(3.5, 6);
  });
});

describe('Invariante de bps após multiply', () => {
  it('deve manter o percentual estável ao reconstruir a partir do resultado', () => {
    const result = Rate.fromPercent(10.5).multiply(0.333);
    expect(Rate.fromPercent(result.toPercent()).toPercent()).toBeCloseTo(result.toPercent(), 6);
  });

  it('deve manter o percentual estável ao reconstruir a partir de um resultado inteiro', () => {
    const result = Rate.fromPercent(10.5).multiply(2);
    expect(Rate.fromPercent(result.toPercent()).toPercent()).toBeCloseTo(result.toPercent(), 6);
  });
});

describe('Imutabilidade de Rate.multiply', () => {
  it('deve retornar uma nova instância', () => {
    const rate = Rate.fromPercent(10);
    expect(rate.multiply(2)).not.toBe(rate);
  });

  it('não deve alterar o operando original', () => {
    const rate = Rate.fromPercent(10);
    rate.multiply(2);
    expect(rate.toPercent()).toBeCloseTo(10, 6);
  });
});
