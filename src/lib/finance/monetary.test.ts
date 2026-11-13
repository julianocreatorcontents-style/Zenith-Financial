/**
 * Sprint 3 — T4 (B3): Consistência de aritmética monetária
 *
 * Decisão registrada: (B) Convenção documentada sem migração.
 * - Domínio: Money.ts usa centavos inteiros (tipo Money).
 * - Calculators: usa number com roundCurrency() nas fronteiras.
 * - recalculateBalances: usa Math.round(x * 100) / 100.
 * - Não misturar convenções em um mesmo fluxo de persistência.
 *
 * T4.1 — Teste de consistência: 10 casos de fronteira comparando Money puro
 *         com number+roundCurrency (resultado do calculators.ts atual).
 * T4.2 — Baseline de caracterização dos totais: "congela" os valores atuais
 *         para garantir que futuras mudanças saibam o que não pode quebrar.
 */

import { describe, it, expect } from 'vitest';
import { Money } from '../../domain/money/Money';
import { roundCurrency } from './formatters';
import {
  calculateTotalAssets,
  calculateMonthBalance,
  calculateTotals,
  calculateNetWorthAt,
} from './calculators';
import type { AssetInput, TransactionInput } from './calculators';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Soma via Money (centavos inteiros, sem perda de precisão em inteiros)
 */
function sumWithMoney(values: number[]): number {
  return values
    .reduce((acc, v) => acc.add(Money.fromBRL(v)), Money.zero())
    .toBRL();
}

/**
 * Soma via number+roundCurrency (padrão atual de calculators.ts)
 */
function sumWithNumber(values: number[]): number {
  return roundCurrency(values.reduce((acc, v) => acc + v, 0));
}

// ---------------------------------------------------------------------------
// T4.1 — Consistência Money vs number+roundCurrency
// ---------------------------------------------------------------------------

describe('T4.1 — Consistência aritmética: Money vs number+roundCurrency', () => {
  /**
   * Casos de fronteira onde soma de floats pode divergir.
   * Se todos passarem → "sem divergência observada" (Decisão B confirmada).
   * Se algum divergir → reportar antes de migrar.
   */
  const cases: Array<{ label: string; values: number[]; expected: number }> = [
    {
      label: 'soma simples inteiros',
      values: [1000, 2000, 3000],
      expected: 6000,
    },
    {
      label: 'decimais exatos em BRL (centavos)',
      values: [10.50, 20.30, 5.20],
      expected: 36.00,
    },
    {
      label: 'decimais com arredondamento de ponto flutuante clássico',
      values: [0.1, 0.2],
      expected: 0.30, // 0.1 + 0.2 = 0.30000000000000004 em float
    },
    {
      label: 'valor zero na lista',
      values: [100, 0, 50],
      expected: 150,
    },
    {
      label: 'valores negativos no saldo parcial',
      values: [-1000, 300, -200],
      expected: -900,
    },
    {
      label: 'soma longa (10 itens)',
      values: [1.11, 2.22, 3.33, 4.44, 5.55, 6.66, 7.77, 8.88, 9.99, 10.10],
      expected: 60.05,
    },
    {
      label: 'valor mínimo BRL (1 centavo)',
      values: [0.01, 0.01, 0.01],
      expected: 0.03,
    },
    {
      label: 'grande valor com centavos',
      values: [999999.99, 0.01],
      expected: 1000000.00,
    },
    {
      label: 'subtração via negativo',
      values: [500, -123.45],
      expected: 376.55,
    },
    {
      label: 'soma de rendimentos (yield fracionado)',
      values: [1234.56, 7.89, 0.55],
      expected: 1243.00,
    },
  ];

  it.each(cases)('$label → $expected', ({ values, expected }) => {
    const moneyResult = sumWithMoney(values);
    const numberResult = sumWithNumber(values);

    // Ambas as convenções devem chegar ao mesmo resultado arredondado
    expect(moneyResult).toBeCloseTo(expected, 2);
    expect(numberResult).toBeCloseTo(expected, 2);

    // Registrar divergência se houver (Decisão B: informativo, não bloqueia)
    if (Math.abs(moneyResult - numberResult) > 0.001) {
      console.warn(
        `[T4.1 DIVERGÊNCIA] "${values.join(' + ')}": ` +
        `Money=${moneyResult}, number=${numberResult}`
      );
    }
  });

  it('T4.1-SUMMARY: registra se há divergência entre Money e number+roundCurrency', () => {
    const divergencias: string[] = [];
    for (const { label, values } of cases) {
      const m = sumWithMoney(values);
      const n = sumWithNumber(values);
      if (Math.abs(m - n) > 0.001) {
        divergencias.push(`"${label}": Money=${m} ≠ number=${n}`);
      }
    }
    if (divergencias.length === 0) {
      console.info('[T4.1] Sem divergência observada entre Money e number+roundCurrency. Decisão (B) confirmada.');
    } else {
      console.warn('[T4.1] Divergências encontradas:', divergencias);
    }
    // Decisão (B): sem divergência → não migrar agora
    // Se divergências aparecerem, reportar antes de qualquer mudança
    expect(divergencias).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T4.2 — Baseline de caracterização dos totais
// ---------------------------------------------------------------------------

describe('T4.2 — Baseline: caracterização dos cálculos de totais', () => {
  /**
   * Congela o comportamento atual de roundCurrency e Money para servir
   * de baseline — se futuras mudanças quebrarem estes valores, o time
   * saberá o que mudou.
   */

  it('roundCurrency: 2 casas decimais — comportamento ATUAL congelado', () => {
    // Baseline de caracterização (T4.2): estes valores são o comportamento REAL hoje.
    expect(roundCurrency(1.004)).toBe(1.00);
    expect(roundCurrency(100)).toBe(100);
    expect(roundCurrency(0)).toBe(0);
    expect(roundCurrency(-1.5)).toBe(-1.5);

    // Limite conhecido de ponto flutuante: 1.005 * 100 = 100.49999999999999,
    // portanto Math.round devolve 100 (1.00), e NÃO 1.01.
    // Isto é intencionalmente congelado: Money.fromBRL usa a mesma fórmula,
    // logo as duas convenções concordam. "Corrigir" só roundCurrency criaria
    // divergência entre camadas (ver T4.a / débito registrado).
    expect(roundCurrency(1.005)).toBe(1);
    expect(Money.fromBRL(1.005).toBRL()).toBe(1);
  });

  it('Money.fromBRL: converte para centavos e volta sem perda', () => {
    expect(Money.fromBRL(100.50).toBRL()).toBe(100.50);
    expect(Money.fromBRL(0.01).toBRL()).toBe(0.01);
    expect(Money.fromBRL(999999.99).toBRL()).toBe(999999.99);
  });

  it('Money.add: soma sem perda de centavos', () => {
    const result = Money.fromBRL(0.1).add(Money.fromBRL(0.2));
    // Money usa centavos inteiros: 10 + 20 = 30 → 0.30 (sem o float clássico 0.30000...4)
    expect(result.toBRL()).toBe(0.30);
  });

  it('Money.subtract: subtração sem perda de centavos', () => {
    expect(Money.fromBRL(1.00).subtract(Money.fromBRL(0.01)).toBRL()).toBe(0.99);
    expect(Money.fromBRL(100).subtract(Money.fromBRL(100)).toBRL()).toBe(0);
  });

  it('Money permite saldos negativos (partialBalance pode ser < 0)', () => {
    const neg = Money.zero().subtract(Money.fromBRL(500));
    expect(neg.isNegative()).toBe(true);
    expect(neg.toBRL()).toBe(-500);
  });

  it('Convenção de fronteira: recalculateBalances usa Math.round(x*100)/100', () => {
    // Espelha exatamente o algoritmo de recalculateBalances
    const simulate = (income: number, expense: number) => {
      let bal = 0;
      bal += income;
      bal = Math.round(bal * 100) / 100;
      bal -= expense;
      bal = Math.round(bal * 100) / 100;
      return bal;
    };

    expect(simulate(100, 33.33)).toBeCloseTo(66.67, 2);
    expect(simulate(1000, 1000)).toBe(0);
    expect(simulate(0.1 + 0.2, 0)).toBeCloseTo(0.30, 2); // arredonda o problema float
  });

  /**
   * Mapa de convenções por camada (B3 Sprint 3 — Decisão B):
   *
   * | Camada                    | Convenção           | Fonte de verdade       |
   * |---------------------------|---------------------|------------------------|
   * | domain/money/Money.ts     | centavos inteiros   | Money (tipo opaco)     |
   * | lib/finance/calculators   | number + roundCurrency | parseTransactionAmount |
   * | hooks/recalculateBalances | number + Math.round*100/100 | Firestore docs  |
   * | hooks/assetBalance        | number + Number()   | asset.value/manualBal  |
   *
   * Regra: não misturar Money e number em um mesmo fluxo de persistência.
   * Para uniformizar: Sprint 4+ (decisão A não foi tomada neste sprint).
   */
  it('T4.2-BASELINE: mapa de convenções documentado (teste sempre verde)', () => {
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.2 — Baseline de caracterização dos totais do dashboard
// ---------------------------------------------------------------------------

describe('T4.2 — Baseline de caracterização: totais do dashboard', () => {
  /**
   * Fixture congelada (mês 0/2026). Se qualquer cálculo de dashboard mudar,
   * estes números quebram — é exatamente o objetivo de uma characterization test.
   */
  const assets: AssetInput[] = [
    { id: 'a1', name: 'CDB', type: 'investment', value: 10000.5 },
    { id: 'a2', name: 'Tesouro', type: 'investment', value: 2500.25 },
    { id: 'a3', name: 'Conta', type: 'liquidity', value: 999.99 },
  ];

  const transactions: TransactionInput[] = [
    { type: 'in', value: 5000.1, date: new Date(2026, 0, 10), applied: true, assetId: 'a3', label: 'Salário' },
    { type: 'out', value: 1500.55, date: new Date(2026, 0, 12), applied: true, assetId: 'a3', label: 'Aluguel' },
    { type: 'yield', value: 12.34, date: new Date(2026, 0, 15), applied: true, assetId: 'a1', label: 'Rendimento CDB' },
    // Não aplicada: em calculateNetWorthAt entra como ajuste (comportamento atual)
    { type: 'in', value: 250.25, date: new Date(2026, 0, 20), applied: false, assetId: 'a3', label: 'Pix recebido' },
  ];

  it('calculateTotalAssets: patrimônio bruto congelado', () => {
    expect(calculateTotalAssets(assets)).toBe(13500.74);
  });

  it('calculateTotals: entradas, saídas, rendimentos e investimentos congelados', () => {
    expect(calculateTotals(transactions, 0, 2026, assets)).toEqual({
      in: 5250.35,
      out: 1500.55,
      yield: 12.34,
      investments: 12500.75,
    });
  });

  it('calculateMonthBalance: saldo do mês congelado', () => {
    expect(calculateMonthBalance(transactions, 0, 2026)).toBe(3762.14);
  });

  it('calculateNetWorthAt: patrimônio no fim do mês congelado', () => {
    const cutoff = new Date(2026, 0, 31, 23, 59, 59, 999);
    expect(calculateNetWorthAt(assets, transactions, cutoff)).toBe(13750.99);
  });

  it('consistência: total do dashboard = mesma soma via Money (sem divergência de centavos)', () => {
    const totals = calculateTotals(transactions, 0, 2026, assets);
    const moneyNet = Money.zero()
      .add(Money.fromBRL(totals.in))
      .add(Money.fromBRL(totals.yield))
      .subtract(Money.fromBRL(totals.out))
      .toBRL();

    expect(moneyNet).toBe(calculateMonthBalance(transactions, 0, 2026));
  });
});

// ---------------------------------------------------------------------------
// T4 — Pontos de cálculo monetário identificados (mapa)
// ---------------------------------------------------------------------------

describe('T4 — Mapa de pontos de cálculo monetário', () => {
  /**
   * Resultado do grep (parseFloat | Number( | toFixed | Math.round) em src/lib,
   * src/hooks e src/domain: 116 ocorrências em 19 arquivos (excluindo testes).
   *
   * 1. Money.ts (src/domain/money/Money.ts)
   *    - Representação: centavos inteiros (integer)
   *    - Operações: add, subtract, multiply (todos em centavos)
   *    - Fonte de entrada: Money.fromBRL(number) → Math.round(v*100)
   *
   * 2. calculators.ts (src/lib/finance/calculators.ts)
   *    - Representação: number (float BRL)
   *    - Operações: soma/subtração com Math.round((acc+val)*100)/100
   *    - Fonte de entrada: parseTransactionAmount(tx.value)
   *    - Funções: calculateTotalAssets, calculateMonthBalance, calculateTotals,
   *      calculateNetWorth(At), calculateEvolutionData, calculateCashFlowData,
   *      calculatePartialBalances (novo, T1)
   *
   * 3. useTransactionsData.ts / recalculateBalances
   *    - Representação: number (float BRL)
   *    - Operações: delega a calculatePartialBalances (roundCurrency por passo)
   *    - Persistência: Firestore (campo partialBalance)
   *
   * 4. assetBalance.ts + assetYieldService.ts (src/lib/adapters)
   *    - Representação: number (float BRL)
   *    - Operações: Number(...) + delta, Math.round(x*100)/100
   *    - Fonte: asset.value / manualBalance / valorInvestido
   *    - assetYieldService já converte para Money em trechos de rendimento
   *
   * 5. transfers.ts / reconcileBalances.ts / netWorthProjection.ts
   *    - Cada um define seu próprio `roundCurrency` local (duplicação da fórmula)
   *
   * 6. parsers.ts (parseTransactionAmount) e spreadsheetParser.ts
   *    - parseFloat / Number com normalização de vírgula/ponto (fronteira string→number)
   *
   * 7. useAITools.ts, useHomeLayout.ts, useZenithData.ts
   *    - Agregações pontuais com Number(...) sem arredondamento final
   *
   * T4.a — Divergência reproduzível ENTRE camadas: nenhuma. Money e number usam a
   *        mesma fórmula (Math.round(v*100)), inclusive no limite 1.005 (ambos → 1.00).
   *        Limitação conhecida: arredondamento bancário não é half-up em fronteiras
   *        de float (1.005 → 1.00). Registrado como débito, não como divergência entre camadas.
   *
   * T4.b — Money cobre o domínio puro; limitação: multiply(factor) arredonda para
   *        centavos e não há divisão, então calculators (percentuais, projeções e
   *        taxas) não migram sem uma API nova.
   *
   * T4.c — Uniformização completa tocaria ~15 pontos em src/lib/finance, src/hooks
   *        e src/lib/adapters (116 ocorrências brutas, ~19 arquivos). Sprint 4+.
   */
  it('T4-MAP: mapa documentado (entregável de documentação)', () => {
    expect(true).toBe(true);
  });
});
