import { describe, it, expect } from 'vitest';
import {
  parseAssetDate,
  countCalendarDays,
  countBusinessDays,
  resolveAssetPolicy,
  calculateAssetYieldInfo,
  enrichAsset,
} from './assetYieldService';

describe('assetYieldService — Âncora de Saldo e Rendimentos', () => {
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
      const start = new Date(2026, 9, 25); // 25/10/2026
      const end = new Date(2026, 9, 27);   // 27/10/2026
      expect(countCalendarDays(start, end)).toBe(2);
    });

    it('conta dias úteis pulando finais de semana', () => {
      const start = new Date(2026, 9, 23); // sexta
      const end = new Date(2026, 9, 26);   // segunda
      expect(countBusinessDays(start, end)).toBe(1);
    });
  });

  describe('resolveAssetPolicy', () => {
    it('reconhece preset da 99Pay automaticamente pelo nome', () => {
      const policy = resolveAssetPolicy({
        id: '1',
        name: 'Conta 99Pay Rendimento',
        value: 5082.12,
        uid: 'user-1',
      });
      expect(policy).not.toBeNull();
      expect(policy?.policy.dayCountConvention).toBe('CALENDAR_DAYS_365');
      expect(policy?.policy.rateTiers).toHaveLength(2);
      expect(policy?.policy.rateTiers[0]!.baseRateValue).toBe(110);
      expect(policy?.policy.rateTiers[0]!.bonusRateValue).toBe(27);
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
      expect(policy?.policy.rateTiers[0]!.baseRateValue).toBe(105);
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

  describe('Cenário Real 99Pay — Âncora no dia 25/10 e rendimento dos dias seguintes', () => {
    it('soma os rendimentos dos dias decorridos (26 e 27/10) sobre o saldo base registrado no dia 25 (R$ 5.082,12)', () => {
      const anchorDate = new Date(2026, 9, 25); // 25 de Outubro (corte do extrato)
      const today = new Date(2026, 9, 27);      // Hoje: 27 de Outubro (2 dias decorridos)

      const asset = {
        id: 'asset-99pay',
        name: '99Pay',
        value: 5082.12,          // Saldo registrado no extrato do dia 25
        valorInvestido: 5000.00, // Aporte original feito no dia 01/10
        investmentStartDate: anchorDate,
        uid: 'user-1',
      };

      const info = calculateAssetYieldInfo(asset, 13.65, today);

      expect(info.baseBalance).toBe(5082.12);
      expect(info.principal).toBe(5000.00);
      expect(info.daysInvested).toBe(2);

      // Rendimento diário na 99Pay: ~R$ 2,37/dia
      expect(info.dailyYield).toBeCloseTo(2.37, 1);

      // Em 2 dias decorridos (26 e 27): soma ~R$ 4,74
      expect(info.yieldSinceAnchor).toBeCloseTo(4.74, 1);
      expect(info.currentValue).toBeCloseTo(5086.86, 1);

      // Rendimento total desde o aporte de R$ 5.000: R$ 82,12 + R$ 4,74 = R$ 86,86
      expect(info.accumulatedYield).toBeCloseTo(86.86, 1);

      // Projeção para o fim do mês de referência (31/10): 6 dias desde a âncora
      expect(info.monthEndValue).toBeCloseTo(5096.34, 1);
      // Rendimento restante do mês (dias 28, 29, 30 e 31): 4 dias adicionais ~R$ 9,48
      expect(info.monthYieldRemaining).toBeCloseTo(9.48, 1);
    });

    it('quando o ativo acabou de ser criado/editado hoje (0 dias decorridos), saldo é o próprio saldo registrado', () => {
      const today = new Date(2026, 9, 27);
      const asset = {
        id: 'asset-editado',
        name: '99Pay',
        value: 5086.86,
        valorInvestido: 5000.00,
        investmentStartDate: today,
        uid: 'user-1',
      };

      const info = calculateAssetYieldInfo(asset, 13.65, today);
      expect(info.currentValue).toBe(5086.86);
      expect(info.yieldSinceAnchor).toBe(0);
      expect(info.daysInvested).toBe(0);
      expect(info.accumulatedYield).toBeCloseTo(86.86, 1);
      expect(info.dailyYield).toBeCloseTo(2.37, 1);
    });
  });

  describe('Saldo manual e impostos', () => {
    it('soma o rendimento desde a âncora ao saldo manual (não congela o valor)', () => {
      const today = new Date(2026, 9, 27);
      const asset: any = {
        id: 'asset-manual',
        name: '99Pay',
        value: 10000,
        valorInvestido: 5000,
        manualBalance: 10000,
        manualBalanceDate: new Date(2026, 9, 25),
        investmentStartDate: new Date(2026, 9, 25),
        uid: 'user-1',
      };

      const info = calculateAssetYieldInfo(asset, 13.65, today);

      expect(info.baseBalance).toBe(10000);
      expect(info.yieldSinceAnchor).toBeGreaterThan(0);
      expect(info.currentValue).toBeCloseTo(info.baseBalance + info.yieldSinceAnchor, 2);
      expect(info.currentValue).toBeGreaterThan(info.baseBalance);
    });

    it('ignora manualBalance nulo e usa o value do ativo', () => {
      const today = new Date(2026, 9, 27);
      const asset: any = {
        id: 'asset-null-manual',
        name: '99Pay',
        value: 5000,
        valorInvestido: 5000,
        manualBalance: null,
        investmentStartDate: new Date(2026, 9, 25),
        uid: 'user-1',
      };

      const info = calculateAssetYieldInfo(asset, 13.65, today);

      expect(info.baseBalance).toBe(5000);
      expect(info.currentValue).toBeGreaterThan(5000);
    });

    it('usa o tempo total do investimento no IR, não os dias desde a âncora', () => {
      const today = new Date(2026, 9, 27);
      const policy = {
        indexer: 'CDI' as const,
        rateType: 'PERCENT_INDEXER' as const,
        dayCountConvention: 'CALENDAR_DAYS_365' as const,
        rateTiers: [{ upTo: null, baseRateValue: 100, bonusRateValue: 0 }],
      };

      const asset: any = {
        id: 'asset-tax',
        name: 'CDB Teste',
        value: 10000,
        valorInvestido: 10000,
        type: 'investment',
        uid: 'user-1',
        strategy: 'FIXED_INCOME_SIMPLE',
        investmentStartDate: new Date(2024, 9, 25),
        manualBalance: 10000,
        manualBalanceDate: new Date(2026, 9, 25),
        investmentPolicy: { ...policy, taxDisplayMode: 'NET' },
      };

      const net = calculateAssetYieldInfo(asset, 13.65, today);
      const gross = calculateAssetYieldInfo(
        { ...asset, investmentPolicy: { ...policy, taxDisplayMode: 'GROSS' } },
        13.65,
        today
      );

      expect(net.daysInvested).toBe(2);
      expect(gross.yieldSinceAnchor).toBeGreaterThan(0);
      // Após 720 dias a alíquota é 15%; a âncora recente não deve rebaixar para 22,5%.
      expect(net.yieldSinceAnchor).toBeCloseTo(gross.yieldSinceAnchor * 0.85, 1);
    });

    it('aplica IOF apenas nos primeiros 29 dias contados do início do investimento', () => {
      const today = new Date(2026, 9, 27);
      const policy = {
        indexer: 'CDI' as const,
        rateType: 'PERCENT_INDEXER' as const,
        dayCountConvention: 'CALENDAR_DAYS_365' as const,
        rateTiers: [{ upTo: null, baseRateValue: 100, bonusRateValue: 0 }],
      };

      const asset: any = {
        id: 'asset-iof',
        name: 'CDB Novo',
        value: 10000,
        valorInvestido: 10000,
        type: 'investment',
        uid: 'user-1',
        strategy: 'FIXED_INCOME_SIMPLE',
        investmentStartDate: new Date(2026, 9, 25),
        manualBalance: 10000,
        manualBalanceDate: new Date(2026, 9, 25),
        investmentPolicy: { ...policy, taxDisplayMode: 'NET' },
      };

      const net = calculateAssetYieldInfo(asset, 13.65, today);
      const gross = calculateAssetYieldInfo(
        { ...asset, investmentPolicy: { ...policy, taxDisplayMode: 'GROSS' } },
        13.65,
        today
      );

      expect(gross.yieldSinceAnchor).toBeGreaterThan(0);
      expect(net.yieldSinceAnchor).toBe(0);
    });
  });

  describe('enrichAsset', () => {
    it('atualiza value dinamicamente e fornece métricas da âncora e do mês', () => {
      const anchorDate = new Date(2026, 9, 25);
      const today = new Date(2026, 9, 27);

      const raw = {
        id: 'asset-99pay',
        name: '99Pay',
        value: 5082.12,
        valorInvestido: 5000.00,
        investmentStartDate: anchorDate,
        type: 'investment',
        detail: 'Conta 99Pay Rendimento',
        uid: 'user-1',
      };

      const enriched = enrichAsset(raw, 13.65, today);

      expect(enriched.baseBalance).toBe(5082.12);
      expect(enriched.valorInvestido).toBe(5000.00);
      expect(enriched.currentValue).toBeCloseTo(5086.86, 1);
      expect(enriched.value).toBe(enriched.currentValue);
      expect(enriched.yieldSinceAnchor).toBeCloseTo(4.74, 1);
      expect(enriched.accumulatedYield).toBeCloseTo(86.86, 1);
      expect(enriched.monthEndValue).toBeCloseTo(5096.34, 1);
      expect(enriched.monthYieldRemaining).toBeCloseTo(9.48, 1);
      expect(enriched.change).toContain('+R$');
    });

    it('mantém saldo negativo sem gerar rendimento sobre a dívida', () => {
      const raw = {
        id: 'asset-mp-saldo',
        name: 'Mercado Pago · Saldo',
        value: -50,
        manualBalance: -50,
        manualBalanceDate: new Date(2026, 9, 25),
        investmentStartDate: new Date(2026, 9, 25),
        valorInvestido: 0,
        type: 'investment',
        uid: 'user-1',
      };

      const enriched = enrichAsset(raw, 13.65, new Date(2026, 9, 27));

      expect(enriched.currentValue).toBe(-50);
      expect(enriched.yieldSinceAnchor).toBe(0);
      expect(enriched.dailyYield).toBe(0);
    });

    it('mantém o acumulado desde o aporte, mesmo quando há transações de yield no mês', () => {
      const today = new Date(2026, 9, 27);
      const raw = {
        id: 'asset-99pay',
        name: '99Pay',
        value: 5082.12,
        valorInvestido: 5000.00,
        investmentStartDate: new Date(2026, 9, 25),
        type: 'investment',
        uid: 'user-1',
      };
      const yieldTx = {
        type: 'yield',
        value: 4.74,
        assetId: 'asset-99pay',
        date: new Date(2026, 9, 26),
      };

      const info = calculateAssetYieldInfo(raw, 13.65, today, false, [yieldTx]);

      expect(info.accumulatedYield).toBeCloseTo(86.86, 1);
      expect(info.yieldPercent).toBeCloseTo(1.74, 2);
      expect(info.yieldSinceAnchor).toBeCloseTo(4.74, 1);
    });

    it('projeta o mês restante do override manual apenas pelos dias que faltam', () => {
      const today = new Date(2026, 9, 27);
      const raw = {
        id: 'asset-manual-99',
        name: '99Pay',
        value: 5082.12,
        manualBalance: 5082.12,
        manualBalanceDate: new Date(2026, 9, 25),
        manualDailyYield: 2.37,
        manualWeekendYield: 2.37,
        valorInvestido: 5000.00,
        type: 'investment',
        uid: 'user-1',
      };

      const enriched = enrichAsset(raw, 13.65, today);

      expect(enriched.monthYieldRemaining).toBeCloseTo(2.37 * 4, 1);
      expect(enriched.monthEndValue).toBeCloseTo(enriched.currentValue + 2.37 * 4, 1);
    });
  });
});
