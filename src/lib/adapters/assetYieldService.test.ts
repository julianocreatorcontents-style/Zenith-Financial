import { describe, it, expect } from 'vitest';
import {
  parseAssetDate,
  countCalendarDays,
  countBusinessDays,
  resolveAssetPolicy,
  calculateAssetYieldInfo,
  enrichAsset,
} from './assetYieldService';

describe('assetYieldService', () => {
  describe('parseAssetDate', () => {
    it('lida com Date nativo', () => {
      const d = new Date('2026-10-15T00:00:00Z');
      expect(parseAssetDate(d)).toEqual(d);
    });

    it('lida com Firestore Timestamp simulado ({ toDate: () => Date })', () => {
      const d = new Date('2026-10-15T12:00:00Z');
      const fakeTimestamp = { toDate: () => d };
      expect(parseAssetDate(fakeTimestamp)).toEqual(d);
    });

    it('lida com ISO string e timestamp numérico', () => {
      const iso = '2026-10-10T10:00:00Z';
      expect(parseAssetDate(iso)?.toISOString()).toBe(new Date(iso).toISOString());
      expect(parseAssetDate(1760000000000)?.getTime()).toBe(1760000000000);
    });

    it('retorna null para valores nulos/inválidos', () => {
      expect(parseAssetDate(null)).toBeNull();
      expect(parseAssetDate(undefined)).toBeNull();
      expect(parseAssetDate('data-invalida')).toBeNull();
    });
  });

  describe('countCalendarDays e countBusinessDays', () => {
    it('conta dias corridos corretamente', () => {
      const start = new Date(2026, 9, 10); // 10/10/2026
      const end = new Date(2026, 9, 20);   // 20/10/2026
      expect(countCalendarDays(start, end)).toBe(10);
    });

    it('conta dias úteis pulando finais de semana', () => {
      // 16/10/2026 é sexta-feira, 19/10/2026 é segunda-feira
      const start = new Date(2026, 9, 16);
      const end = new Date(2026, 9, 19);
      expect(countBusinessDays(start, end)).toBe(1);
    });
  });

  describe('resolveAssetPolicy', () => {
    it('reconhece preset da 99Pay automaticamente pelo nome', () => {
      const policy = resolveAssetPolicy({
        id: '1',
        name: 'Conta 99Pay Rendimento',
        value: 5080.12,
        uid: 'user-1',
      });
      expect(policy).not.toBeNull();
      expect(policy?.policy.dayCountConvention).toBe('CALENDAR_DAYS_365');
      expect(policy?.policy.rateTiers).toHaveLength(2);
      expect(policy?.policy.rateTiers[0].baseRateValue).toBe(110);
      expect(policy?.policy.rateTiers[0].bonusRateValue).toBe(27);
    });

    it('reconhece preset do Mercado Pago automaticamente pelo nome', () => {
      const policy = resolveAssetPolicy({
        id: '2',
        name: 'Mercado Pago Saldo',
        value: 1000,
        uid: 'user-1',
      });
      expect(policy).not.toBeNull();
      expect(policy?.policy.dayCountConvention).toBe('BUSINESS_DAYS_252');
      expect(policy?.policy.rateTiers[0].baseRateValue).toBe(105);
    });

    it('retorna null para ativos físicos ou liquidez sem preset', () => {
      expect(resolveAssetPolicy({
        id: '3',
        name: 'Carro HB20',
        value: 70000,
        type: 'physical',
        uid: 'user-1',
      })).toBeNull();
    });
  });

  describe('calculateAssetYieldInfo — Exemplo Real 99Pay', () => {
    it('calcula o saldo atualizado e rendimento diário de R$ 5.080,12 após 10 dias', () => {
      const startDate = new Date(2026, 9, 17); // 17 de Outubro
      const today = new Date(2026, 9, 27);     // 27 de Outubro (10 dias corridos)

      const asset = {
        id: 'asset-99pay',
        name: '99Pay',
        value: 5080.12,
        valorInvestido: 5080.12,
        investmentStartDate: startDate,
        uid: 'user-1',
      };

      const info = calculateAssetYieldInfo(asset, 13.65, today);

      expect(info.principal).toBe(5080.12);
      expect(info.daysInvested).toBe(10);
      // Saldo projetado após 10 dias de 5080.12 com faixas 137% até 5k e 80% excedente
      expect(info.currentValue).toBeCloseTo(5103.87, 1);
      expect(info.accumulatedYield).toBeCloseTo(23.75, 1);
      expect(info.dailyYield).toBeCloseTo(2.37, 1);
      expect(info.yieldPercent).toBeGreaterThan(0.4);
    });

    it('no dia do aporte (0 dias decorridos), saldo é igual ao aporte', () => {
      const today = new Date(2026, 9, 27);
      const asset = {
        id: 'asset-new',
        name: '99Pay',
        value: 5080.12,
        investmentStartDate: today,
        uid: 'user-1',
      };

      const info = calculateAssetYieldInfo(asset, 13.65, today);
      expect(info.currentValue).toBe(5080.12);
      expect(info.accumulatedYield).toBe(0);
      expect(info.dailyYield).toBeCloseTo(2.36, 1); // Rende ~2.36 no primeiro dia
      expect(info.daysInvested).toBe(0);
    });
  });

  describe('enrichAsset', () => {
    it('enriquece o objeto do ativo atualizando value e preservando originalValue', () => {
      const startDate = new Date(2026, 9, 17);
      const today = new Date(2026, 9, 27);

      const raw = {
        id: 'asset-99pay',
        name: '99Pay',
        value: 5080.12,
        investmentStartDate: startDate,
        type: 'investment',
        detail: 'Conta 99Pay',
        uid: 'user-1',
      };

      const enriched = enrichAsset(raw, 13.65, today);

      expect(enriched.originalValue).toBe(5080.12);
      expect(enriched.valorInvestido).toBe(5080.12);
      expect(enriched.currentValue).toBeCloseTo(5103.87, 1);
      expect(enriched.value).toBe(enriched.currentValue);
      expect(enriched.accumulatedYield).toBeCloseTo(23.75, 1);
      expect(enriched.dailyYield).toBeCloseTo(2.37, 1);
      expect(enriched.change).toContain('+R$');
    });
  });
});
