import { describe, it, expect } from 'vitest';
import { assetToInvestment } from './assetToInvestment';
import type { RawAssetDoc } from './assetToInvestment';

const validDoc: RawAssetDoc = {
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
};

describe('assetToInvestment — retorna null', () => {
  it('sem strategy → null', () => {
    const doc = { ...validDoc, strategy: undefined };
    expect(assetToInvestment(doc)).toBeNull();
  });

  it('sem investmentPolicy → null', () => {
    const doc = { ...validDoc, investmentPolicy: undefined };
    expect(assetToInvestment(doc)).toBeNull();
  });

  it('sem startDate e sem createdAt → null', () => {
    const doc = {
      ...validDoc,
      createdAt: undefined,
      investmentStartDate: undefined,
    };
    expect(assetToInvestment(doc)).toBeNull();
  });

  it('createdAt inválido (toDate lança) → null', () => {
    const doc = {
      ...validDoc,
      createdAt: { toDate: () => { throw new Error('bad'); } },
    };
    expect(assetToInvestment(doc)).toBeNull();
  });
});

describe('assetToInvestment — mapeia corretamente', () => {
  it('cria Investment com campos obrigatórios', () => {
    const inv = assetToInvestment(validDoc);
    expect(inv).not.toBeNull();
    expect(inv!.id).toBe('asset-99pay');
    expect(inv!.name).toBe('99Pay');
    expect(inv!.principal.toBRL()).toBeCloseTo(5000, 2);
    expect(inv!.currentBalance.toBRL()).toBeCloseTo(5069.81, 2);
    expect(inv!.taxDisplayMode).toBe('GROSS');
  });

  it('usa valorInvestido como principal (não value)', () => {
    const inv = assetToInvestment(validDoc);
    expect(inv!.principal.toBRL()).toBeCloseTo(5000, 2);
    expect(inv!.currentBalance.toBRL()).toBeCloseTo(5069.81, 2);
  });

  it('fallback: sem valorInvestido, usa value como principal', () => {
    const doc = { ...validDoc, valorInvestido: undefined };
    const inv = assetToInvestment(doc);
    expect(inv!.principal.toBRL()).toBeCloseTo(5069.81, 2);
  });

  it('startDate = createdAt quando investmentStartDate ausente', () => {
    const inv = assetToInvestment(validDoc);
    expect(inv!.startDate.getTime()).toBe(new Date('2026-01-15').getTime());
  });

  it('investmentStartDate tem prioridade sobre createdAt', () => {
    const doc = {
      ...validDoc,
      investmentStartDate: new Date('2026-03-01'),
    };
    const inv = assetToInvestment(doc);
    expect(inv!.startDate.getTime()).toBe(new Date('2026-03-01').getTime());
  });

  it('aceita Firestore Timestamp (com .toDate)', () => {
    const doc = {
      ...validDoc,
      createdAt: { toDate: () => new Date('2026-05-10') },
    };
    const inv = assetToInvestment(doc);
    expect(inv!.startDate.getTime()).toBe(new Date('2026-05-10').getTime());
  });

  it('rateTiers: upTo numérico vira Money, null permanece null', () => {
    const inv = assetToInvestment(validDoc);
    const tiers = inv!.policy.rateTiers;
    expect(tiers).toHaveLength(2);
    expect(tiers[0]!.upTo!.toBRL()).toBeCloseTo(5000, 2);
    expect(tiers[1]!.upTo).toBeNull();
    expect(tiers[0]!.baseRateValue).toBe(110);
    expect(tiers[0]!.bonusRateValue).toBe(29);
  });

  it('defaults: indexer=CDI e rateType=PERCENT_INDEXER se ausentes', () => {
    const inv = assetToInvestment(validDoc);
    expect(inv!.policy.indexer).toBe('CDI');
    expect(inv!.policy.rateType).toBe('PERCENT_INDEXER');
  });

  it('respeita indexer e rateType explícitos', () => {
    const doc = {
      ...validDoc,
      investmentPolicy: {
        ...validDoc.investmentPolicy!,
        indexer: 'SELIC' as const,
        rateType: 'SPREAD' as const,
      },
    };
    const inv = assetToInvestment(doc);
    expect(inv!.policy.indexer).toBe('SELIC');
    expect(inv!.policy.rateType).toBe('SPREAD');
  });

  it('propaga erro se Investment.create rejeitar (dados inválidos)', () => {
    const doc = {
      ...validDoc,
      investmentPolicy: {
        ...validDoc.investmentPolicy!,
        rateTiers: [],
      },
    };
    expect(() => assetToInvestment(doc)).toThrow();
  });
});
