import { describe, it, expect } from 'vitest';
import { FirestoreInvestmentRepo } from './FirestoreInvestmentRepo';
import type { RawAssetDoc } from './assetToInvestment';

const makeDoc = (overrides: Partial<RawAssetDoc> = {}): RawAssetDoc => ({
  id: 'asset-99pay',
  name: '99Pay',
  value: 5069.81,
  uid: 'user-1',
  valorInvestido: 5000,
  createdAt: new Date('2026-01-15'),
  strategy: 'FIXED_INCOME_TIERED',
  investmentPolicy: {
    dayCountConvention: 'CALENDAR_DAYS_365',
    taxDisplayMode: 'GROSS',
    rateTiers: [
      { upTo: 5000, baseRateValue: 110, bonusRateValue: 29 },
      { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
    ],
  },
  ...overrides,
});

describe('FirestoreInvestmentRepo — validação de entrada', () => {
  it('rejeita userId vazio', async () => {
    const repo = new FirestoreInvestmentRepo(async () => []);
    await expect(repo.findByUser('')).rejects.toThrow();
    await expect(repo.findByUser('   ')).rejects.toThrow();
  });
});

describe('FirestoreInvestmentRepo — filtro por usuário', () => {
  it('retorna apenas assets do userId solicitado', async () => {
    const repo = new FirestoreInvestmentRepo(async () => [
      makeDoc({ id: 'a1', uid: 'user-1' }),
      makeDoc({ id: 'a2', uid: 'user-2' }),
      makeDoc({ id: 'a3', uid: 'user-1' }),
    ]);
    const result = await repo.findByUser('user-1');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['a1', 'a3']);
  });

  it('retorna [] se não há assets do usuário', async () => {
    const repo = new FirestoreInvestmentRepo(async () => [
      makeDoc({ uid: 'user-2' }),
    ]);
    const result = await repo.findByUser('user-1');
    expect(result).toEqual([]);
  });

  it('retorna [] quando fetcher devolve lista vazia', async () => {
    const repo = new FirestoreInvestmentRepo(async () => []);
    expect(await repo.findByUser('user-1')).toEqual([]);
  });
});

describe('FirestoreInvestmentRepo — filtro por strategy', () => {
  it('ignora assets sem strategy (carro, joia)', async () => {
    const repo = new FirestoreInvestmentRepo(async () => [
      makeDoc({ id: 'inv', strategy: 'FIXED_INCOME_TIERED' }),
      makeDoc({ id: 'car', strategy: undefined, name: 'Carro' }),
      makeDoc({ id: 'gold', strategy: undefined, name: 'Ouro' }),
    ]);
    const result = await repo.findByUser('user-1');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('inv');
  });

  it('ignora assets com strategy mas sem investmentPolicy', async () => {
    const repo = new FirestoreInvestmentRepo(async () => [
      makeDoc({ id: 'broken', investmentPolicy: undefined }),
    ]);
    expect(await repo.findByUser('user-1')).toEqual([]);
  });

  it('ignora assets sem createdAt e sem investmentStartDate', async () => {
    const repo = new FirestoreInvestmentRepo(async () => [
      makeDoc({ id: 'no-date', createdAt: undefined, investmentStartDate: undefined }),
    ]);
    expect(await repo.findByUser('user-1')).toEqual([]);
  });
});

describe('FirestoreInvestmentRepo — investimentos válidos', () => {
  it('mapeia 2 investimentos com policy diferentes', async () => {
    const repo = new FirestoreInvestmentRepo(async () => [
      makeDoc({
        id: '99pay',
        name: '99Pay',
        investmentPolicy: {
          dayCountConvention: 'CALENDAR_DAYS_365',
          taxDisplayMode: 'GROSS',
          rateTiers: [
            { upTo: 5000, baseRateValue: 110, bonusRateValue: 29 },
            { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
          ],
        },
      }),
      makeDoc({
        id: 'mp-saldo',
        name: 'MP Saldo',
        value: 8985.72,
        valorInvestido: 8985.72,
        investmentPolicy: {
          dayCountConvention: 'BUSINESS_DAYS_252',
          taxDisplayMode: 'NET',
          rateTiers: [{ upTo: null, baseRateValue: 105, bonusRateValue: 0 }],
        },
      }),
    ]);
    const result = await repo.findByUser('user-1');
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('99Pay');
    expect(result[0]!.policy.rateTiers).toHaveLength(2);
    expect(result[1]!.name).toBe('MP Saldo');
    expect(result[1]!.policy.rateTiers).toHaveLength(1);
    expect(result[1]!.taxDisplayMode).toBe('NET');
  });

  it('preserva a ordem dos docs', async () => {
    const repo = new FirestoreInvestmentRepo(async () => [
      makeDoc({ id: 'first' }),
      makeDoc({ id: 'second' }),
      makeDoc({ id: 'third' }),
    ]);
    const result = await repo.findByUser('user-1');
    expect(result.map((i) => i.id)).toEqual(['first', 'second', 'third']);
  });
});

describe('FirestoreInvestmentRepo — erro do fetcher', () => {
  it('propaga erro do fetcher', async () => {
    const repo = new FirestoreInvestmentRepo(async () => {
      throw new Error('Firestore offline');
    });
    await expect(repo.findByUser('user-1')).rejects.toThrow(/Firestore offline/);
  });
});
