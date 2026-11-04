import { describe, it, expect } from 'vitest';
import { calculateAssetBalanceUpdate } from './assetBalance';

describe('calculateAssetBalanceUpdate', () => {
  const now = new Date(2026, 10, 4, 12, 0, 0);

  it('preserva a data-âncora existente em vez de reiniciar o rendimento', () => {
    const anchor = new Date(2026, 9, 1);
    const update = calculateAssetBalanceUpdate(
      { value: 5000, valorInvestido: 5000, investmentStartDate: anchor },
      100,
      true,
      now,
    );

    expect(update.value).toBe(5100);
    expect(update.valorInvestido).toBe(5100);
    expect(update.investmentStartDate).toBeUndefined();
  });

  it('semeia a data-âncora quando o ativo ainda não possui uma', () => {
    const update = calculateAssetBalanceUpdate(
      { value: 1000, valorInvestido: 1000 },
      50,
      true,
      now,
    );

    expect(update.investmentStartDate).toEqual(now);
  });

  it('desconta saídas e permite saldo negativo (cheque especial)', () => {
    const update = calculateAssetBalanceUpdate(
      { value: 100, valorInvestido: 80, investmentStartDate: now },
      250,
      false,
      now,
    );

    expect(update.value).toBe(-150);
    expect(update.valorInvestido).toBe(0);
  });

  it('ajusta o manualBalance reconciliado junto com o saldo', () => {
    const anchor = new Date(2026, 9, 25);
    const update = calculateAssetBalanceUpdate(
      { value: 500, valorInvestido: 1000, manualBalance: 1000, investmentStartDate: anchor },
      100,
      false,
      now,
    );

    expect(update.value).toBe(900);
    expect(update.manualBalance).toBe(900);
    expect(update.valorInvestido).toBe(900);
    expect(update.investmentStartDate).toBeUndefined();
  });

  it('permite manualBalance negativo e mantém o principal em zero', () => {
    const update = calculateAssetBalanceUpdate(
      { value: 100, valorInvestido: 100, manualBalance: 50, investmentStartDate: now },
      100,
      false,
      now,
    );

    expect(update.manualBalance).toBe(-50);
    expect(update.value).toBe(-50);
    expect(update.valorInvestido).toBe(0);
  });

  it('ignora manualBalance nulo e usa o value do ativo', () => {
    const update = calculateAssetBalanceUpdate(
      { value: 1000, valorInvestido: 1000, manualBalance: null },
      100,
      true,
      now,
    );

    expect(update.value).toBe(1100);
    expect(update.manualBalance).toBeUndefined();
  });

  it('mantém precisão de centavos', () => {
    const update = calculateAssetBalanceUpdate(
      { value: 10.1, valorInvestido: 10.1 },
      0.2,
      true,
      now,
    );

    expect(update.value).toBe(10.3);
    expect(update.valorInvestido).toBe(10.3);
  });
});
