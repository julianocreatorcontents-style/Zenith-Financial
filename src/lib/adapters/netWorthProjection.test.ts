import { describe, it, expect } from 'vitest';
import { calculateNetWorthProjection } from './netWorthProjection';
import { YieldCalculator } from '../../domain/yield/YieldCalculator';
import { Money } from '../../domain/money/Money';
import type { RawAssetDoc } from './assetToInvestment';

const makeAsset = (overrides: Partial<RawAssetDoc> = {}): RawAssetDoc => ({
  id: 'asset-1',
  name: '99Pay',
  value: 1000,
  uid: 'user-1',
  createdAt: new Date('2025-01-01'),
  strategy: 'FIXED_INCOME_TIERED',
  investmentPolicy: {
    indexer: 'CDI',
    rateType: 'PERCENT_INDEXER',
    dayCountConvention: 'CALENDAR_DAYS_365',
    taxDisplayMode: 'GROSS',
    rateTiers: [{ upTo: null, baseRateValue: 100, bonusRateValue: 0 }],
  },
  ...overrides,
});

describe('calculateNetWorthProjection', () => {
  it('retorna apenas o ponto de hoje quando months é zero', () => {
    const points = calculateNetWorthProjection({
      assets: [makeAsset()],
      months: 0,
      from: new Date('2026-01-01T12:00:00'),
    });

    expect(points).toHaveLength(1);
    expect(points[0]?.name).toBe('Hoje');
    expect(points[0]?.value).toBe(1000);
    expect(points[0]?.projected).toBe(false);
  });

  it('gera um ponto por mês, sempre marcado como projeção', () => {
    const points = calculateNetWorthProjection({
      assets: [makeAsset()],
      months: 12,
      from: new Date('2026-01-01T12:00:00'),
    });

    expect(points).toHaveLength(13);
    expect(points.slice(1).every((point) => point.projected)).toBe(true);
    expect(points[1]?.name).toBe('JAN/26');
    expect(points[12]?.name).toBe('DEZ/26');
  });

  it('projeta o saldo do investimento com o motor de rendimento', () => {
    const from = new Date('2026-01-01T12:00:00');
    const asset = makeAsset();
    const target = new Date(2026, 1, 0);
    const days = Math.round((target.getTime() - from.getTime()) / 86_400_000);

    const expected = YieldCalculator.projectTiered(
      Money.fromBRL(asset.value),
      13.65,
      {
        indexer: 'CDI',
        rateType: 'PERCENT_INDEXER',
        dayCountConvention: 'CALENDAR_DAYS_365',
        rateTiers: [{ upTo: null, baseRateValue: 100, bonusRateValue: 0 }],
      },
      days,
    ).toBRL();

    const points = calculateNetWorthProjection({ assets: [asset], months: 1, from });

    expect(points[1]?.value).toBeCloseTo(expected, 2);
  });

  it('respeita as faixas de limite do investimento', () => {
    const asset = makeAsset({
      value: 15000,
      investmentPolicy: {
        indexer: 'CDI',
        rateType: 'PERCENT_INDEXER',
        dayCountConvention: 'CALENDAR_DAYS_365',
        taxDisplayMode: 'GROSS',
        rateTiers: [
          { upTo: 10000, baseRateValue: 100, bonusRateValue: 0 },
          { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
        ],
      },
    });

    const tiered = calculateNetWorthProjection({ assets: [asset], months: 6, from: new Date('2026-01-01T12:00:00') });
    const single100 = calculateNetWorthProjection({
      assets: [makeAsset({ value: 15000 })],
      months: 6,
      from: new Date('2026-01-01T12:00:00'),
    });
    const single80 = calculateNetWorthProjection({
      assets: [makeAsset({
        value: 15000,
        investmentPolicy: {
          indexer: 'CDI',
          rateType: 'PERCENT_INDEXER',
          dayCountConvention: 'CALENDAR_DAYS_365',
          taxDisplayMode: 'GROSS',
          rateTiers: [{ upTo: null, baseRateValue: 80, bonusRateValue: 0 }],
        },
      })],
      months: 6,
      from: new Date('2026-01-01T12:00:00'),
    });

    const lastTiered = tiered[tiered.length - 1]?.value ?? 0;
    const last100 = single100[single100.length - 1]?.value ?? 0;
    const last80 = single80[single80.length - 1]?.value ?? 0;

    expect(lastTiered).toBeGreaterThan(last80);
    expect(lastTiered).toBeLessThan(last100);
  });

  it('não depende do CDI em investimentos com taxa fixa', () => {
    const fixed = makeAsset({
      investmentPolicy: {
        indexer: 'PRE',
        rateType: 'FIXED',
        dayCountConvention: 'CALENDAR_DAYS_365',
        taxDisplayMode: 'GROSS',
        rateTiers: [{ upTo: null, baseRateValue: 12, bonusRateValue: 0 }],
      },
    });

    const lowCdi = calculateNetWorthProjection({ assets: [fixed], months: 3, cdiAnnualPercent: 5, from: new Date('2026-01-01T12:00:00') });
    const highCdi = calculateNetWorthProjection({ assets: [fixed], months: 3, cdiAnnualPercent: 20, from: new Date('2026-01-01T12:00:00') });

    expect(lowCdi[3]?.value).toBeCloseTo(highCdi[3]?.value ?? 0, 2);
  });

  it('mantém o patrimônio estável quando o ativo não tem política de investimento', () => {
    const asset = makeAsset({
      id: 'asset-sem-politica',
      value: 2500,
      strategy: undefined,
      investmentPolicy: undefined,
    });

    const points = calculateNetWorthProjection({
      assets: [asset],
      months: 4,
      from: new Date('2026-01-01T12:00:00'),
    });

    expect(points.every((point) => point.value === 2500)).toBe(true);
  });
});
