import { describe, it, expect } from 'vitest';
import { calculateAssetBalanceUpdate, calculateTransferBalanceUpdate } from './assetBalance';

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

describe('calculateTransferBalanceUpdate', () => {
  const now = new Date(2026, 10, 4, 12, 0, 0);

  it('move o saldo entre as contas mantendo o patrimônio total neutro', () => {
    const from = calculateTransferBalanceUpdate(
      { value: 5000, currentValue: 5000, valorInvestido: 5000 },
      1000,
      false,
      now,
    );
    const to = calculateTransferBalanceUpdate(
      { value: 1000, currentValue: 1000, valorInvestido: 1000 },
      1000,
      true,
      now,
    );

    expect(from.value).toBe(4000);
    expect(to.value).toBe(2000);
    expect(from.value + to.value).toBe(6000);
    expect(from.manualBalance).toBe(4000);
    expect(to.manualBalance).toBe(2000);
    expect(from.manualBalanceDate).toBe('2026-11-04');
    expect(to.manualBalanceDate).toBe('2026-11-04');
  });

  it('usa o currentValue enriquecido e preserva o rendimento acumulado', () => {
    const from = calculateTransferBalanceUpdate(
      { value: 1000, currentValue: 1050, valorInvestido: 1000 },
      100,
      false,
      now,
    );
    const to = calculateTransferBalanceUpdate(
      { value: 500, currentValue: 500, valorInvestido: 500 },
      100,
      true,
      now,
    );

    expect(from.value).toBe(950);
    expect(from.valorInvestido).toBe(900);
    expect(from.value - from.valorInvestido).toBe(50);
    expect(to.value).toBe(600);
    expect(to.valorInvestido).toBe(600);
  });

  it('limita o principal a zero quando a saída supera o valor investido', () => {
    const from = calculateTransferBalanceUpdate(
      { value: 600, currentValue: 600, valorInvestido: 500 },
      550,
      false,
      now,
    );

    expect(from.value).toBe(50);
    expect(from.valorInvestido).toBe(0);
  });
});
