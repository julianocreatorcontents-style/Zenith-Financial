import { describe, it, expect } from 'vitest';
import { Money } from './Money';

describe('Money.fromBRL', () => {
  it('deve preservar o valor em reais no round-trip', () => {
    expect(Money.fromBRL(10.99).toBRL()).toBeCloseTo(10.99, 2);
  });

  it('deve arredondar para cima quando o terceiro decimal é maior ou igual a 5', () => {
    expect(Money.fromBRL(10.999).toBRL()).toBeCloseTo(11.0, 2);
  });

  it('deve arredondar para baixo quando o terceiro decimal é menor que 5', () => {
    expect(Money.fromBRL(10.994).toBRL()).toBeCloseTo(10.99, 2);
  });

  it('deve normalizar a imprecisão de ponto flutuante (0.1 + 0.2)', () => {
    expect(Money.fromBRL(0.1 + 0.2).toBRL()).toBeCloseTo(0.3, 2);
  });
});

describe('Money.zero', () => {
  it('deve criar uma instância com valor zero', () => {
    expect(Money.zero().toBRL()).toBeCloseTo(0, 2);
  });

  it('deve ser igual a Money.fromBRL(0)', () => {
    expect(Money.zero().equals(Money.fromBRL(0))).toBe(true);
  });
});

describe('Money.add', () => {
  it('deve somar dois valores em reais', () => {
    expect(Money.fromBRL(10.5).add(Money.fromBRL(2.25)).toBRL()).toBeCloseTo(12.75, 2);
  });

  it('deve retornar nova instância sem mutar os operandos', () => {
    const left = Money.fromBRL(10.5);
    const right = Money.fromBRL(2.25);
    const result = left.add(right);
    expect(result).not.toBe(left);
    expect(result).not.toBe(right);
    expect(left.toBRL()).toBeCloseTo(10.5, 2);
    expect(right.toBRL()).toBeCloseTo(2.25, 2);
  });

  it('deve somar zero sem alterar o valor', () => {
    expect(Money.fromBRL(7.77).add(Money.zero()).toBRL()).toBeCloseTo(7.77, 2);
  });
});

describe('Money.subtract', () => {
  it('deve subtrair e produzir resultado negativo', () => {
    const result = Money.fromBRL(10).subtract(Money.fromBRL(15));
    expect(result.toBRL()).toBeCloseTo(-5, 2);
    expect(result.isNegative()).toBe(true);
  });

  it('deve retornar zero quando os valores são iguais', () => {
    const result = Money.fromBRL(10).subtract(Money.fromBRL(10));
    expect(result.toBRL()).toBeCloseTo(0, 2);
    expect(result.isNegative()).toBe(false);
  });

  it('deve retornar nova instância sem mutar o operando', () => {
    const left = Money.fromBRL(10);
    const result = left.subtract(Money.fromBRL(4));
    expect(result).not.toBe(left);
    expect(left.toBRL()).toBeCloseTo(10, 2);
  });
});

describe('Money.multiply', () => {
  it('deve multiplicar pelo fator e arredondar para centavos', () => {
    expect(Money.fromBRL(10).multiply(0.333).toBRL()).toBeCloseTo(3.33, 2);
  });

  it('deve retornar zero ao multiplicar por zero', () => {
    const result = Money.fromBRL(10).multiply(0);
    expect(result.toBRL()).toBeCloseTo(0, 2);
    expect(result.equals(Money.zero())).toBe(true);
  });

  it('deve retornar nova instância sem mutar o operando', () => {
    const money = Money.fromBRL(10);
    const result = money.multiply(2);
    expect(result).not.toBe(money);
    expect(money.toBRL()).toBeCloseTo(10, 2);
  });
});

describe('Money.isGreaterThan', () => {
  it('true quando maior', () => {
    expect(Money.fromBRL(10.01).isGreaterThan(Money.fromBRL(10.0))).toBe(true);
  });
  it('false quando igual', () => {
    expect(Money.fromBRL(10.0).isGreaterThan(Money.fromBRL(10.0))).toBe(false);
  });
  it('false quando menor', () => {
    expect(Money.fromBRL(9.99).isGreaterThan(Money.fromBRL(10.0))).toBe(false);
  });
});

describe('Money.equals', () => {
  it('iguais com mesmo valor', () => {
    const a = Money.fromBRL(10.99);
    const b = Money.fromBRL(10.99);
    expect(a).not.toBe(b);
    expect(a.equals(b)).toBe(true);
  });
  it('diferentes com valores distintos', () => {
    expect(Money.fromBRL(10.99).equals(Money.fromBRL(10.98))).toBe(false);
  });
});

describe('Invariante de centavos', () => {
  it('após add', () => {
    const r = Money.fromBRL(10.5).add(Money.fromBRL(2.25));
    expect(Money.fromBRL(r.toBRL()).equals(r)).toBe(true);
  });
  it('após subtract', () => {
    const r = Money.fromBRL(10).subtract(Money.fromBRL(15));
    expect(Money.fromBRL(r.toBRL()).equals(r)).toBe(true);
  });
  it('após multiply', () => {
    const r = Money.fromBRL(10).multiply(0.333);
    expect(Money.fromBRL(r.toBRL()).equals(r)).toBe(true);
  });
});
