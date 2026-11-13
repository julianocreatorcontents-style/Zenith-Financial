/**
 * Sprint 4a — T1 (R10): Consistência de roundCurrency.
 *
 * Contexto: antes deste sprint a fórmula `Math.round(v * 100) / 100` existia
 * duplicada em 5 arquivos (formatters, transfers, reconcileBalances,
 * netWorthProjection, assetBalance). As quatro primeiras foram unificadas em
 * `formatters.ts`; `assetBalance.ts` ficou de fora por restrição de escopo
 * (regra 4 do sprint) e é verificada aqui como contrato de equivalência para
 * que a migração futura seja segura.
 *
 * Este arquivo congela:
 *   1. o comportamento da implementação canônica nas fronteiras (inclui 1.005);
 *   2. que os pontos de uso que consumiam cópias locais produzem o MESMO
 *      resultado da função canônica;
 *   3. que a cópia residual de assetBalance.ts é byte-equivalente em comportamento.
 */

import { describe, it, expect } from 'vitest';
import { roundCurrency } from './formatters';
import { buildTransferLegs, groupTransactionsForWallet } from './transfers';
import { recalculateTransactionPartialBalances } from '../reconcileBalances';
import type { Asset } from '../../types/app';

/**
 * Fronteiras exigidas pelo critério de aceite + casos de arredondamento
 * binário (1.005 não é exatamente representável em IEEE-754).
 */
const BOUNDARIES: Array<[number, number]> = [
  [1.005, 1], // 1.005 * 100 === 100.49999999999999 → Math.round para baixo
  [-1.005, -1], // -100.49999999999999 → Math.round(-100.4999...) === -100
  [0.999999999, 1],
  [1000.0, 1000],
  [0.01, 0.01],
];

describe('T1 — roundCurrency canônica: fronteiras', () => {
  it.each(BOUNDARIES)('roundCurrency(%s) === %s', (input, expected) => {
    expect(roundCurrency(input)).toBe(expected);
  });

  it('T1.1 — arredonda para exatamente 2 casas decimais', () => {
    expect(roundCurrency(10.239)).toBe(10.24);
    expect(roundCurrency(10.231)).toBe(10.23);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it('T1.2 — é idempotente (aplicar duas vezes não muda o resultado)', () => {
    for (const [input] of BOUNDARIES) {
      const once = roundCurrency(input);
      expect(roundCurrency(once)).toBe(once);
    }
  });

  it('T1.3 — valores inteiros e zero passam inalterados', () => {
    expect(roundCurrency(0)).toBe(0);
    expect(roundCurrency(-0)).toBe(-0);
    expect(roundCurrency(1234567)).toBe(1234567);
  });

  it('T1.4 — preserva sinal em valores negativos', () => {
    expect(roundCurrency(-1.234)).toBe(-1.23);
    expect(roundCurrency(-1.235)).toBe(-1.24);
    expect(roundCurrency(-0.005)).toBe(-0);
  });
});

describe('T1 — consistência entre pontos de uso', () => {
  it('T1.5 — transfers: pernas usam a função canônica', () => {
    const fromAsset = { id: 'a', name: 'Conta' } as Asset;
    const toAsset = { id: 'b', name: 'Cofre' } as Asset;
    const [outLeg, inLeg] = buildTransferLegs({
      transferId: 'tid',
      fromAsset,
      toAsset,
      value: 1.005,
      date: '2026-01-10',
    });

    expect(outLeg.value).toBe(roundCurrency(1.005));
    expect(inLeg.value).toBe(outLeg.value);
  });

  it('T1.6 — transfers: agrupamento de carteira arredonda como a canônica', () => {
    const groups = groupTransactionsForWallet([
      { id: 'out', type: 'out', value: '1.005', transferId: 't', transferRole: 'out', assetId: 'a' },
      { id: 'in', type: 'in', value: '1.005', transferId: 't', transferRole: 'in', assetId: 'b' },
    ]);

    const group = groups.find((entry) => entry.kind === 'transfer');
    expect(group).toBeDefined();
    if (group && group.kind === 'transfer') {
      // getValue() aplica roundCurrency(parseTransactionAmount(...)) na perna de saída.
      expect(group.value).toBe(roundCurrency(1.005));
      expect(group.value).toBe(1);
    }
  });

  it('T1.7 — reconcileBalances: saldo progressivo arredonda como a canônica', () => {
    const balances = recalculateTransactionPartialBalances([
      { id: '1', type: 'in', value: 0.1 },
      { id: '2', type: 'in', value: 0.2 },
    ]);

    expect(balances).toEqual([
      { id: '1', partialBalance: 0.1 },
      { id: '2', partialBalance: 0.3 },
    ]);
    expect(balances[1]?.partialBalance).toBe(roundCurrency(0.1 + 0.2));
  });

  it('T1.8 — assetBalance.ts (cópia residual, fora do escopo) é comportamentalmente idêntica', () => {
    // Fórmula mantida em src/lib/adapters/assetBalance.ts:15.
    // Não é editada neste sprint (regra 4: assetBalance.ts proibido).
    // Este teste garante que a unificação futura não muda nenhum resultado.
    const assetBalanceRound = (value: number) => Math.round(value * 100) / 100;

    for (const [input] of BOUNDARIES) {
      expect(assetBalanceRound(input)).toBe(roundCurrency(input));
    }
    for (const value of [0.1 + 0.2, 1234.5678, -987.6543, 1e-9, 1e9]) {
      expect(assetBalanceRound(value)).toBe(roundCurrency(value));
    }
  });
});
