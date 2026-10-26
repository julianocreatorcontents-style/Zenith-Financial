import { describe, it, expect } from 'vitest';
import { TaxAlertService } from './TaxAlertService';
import { Investment } from '../investment/Investment';
import { Money } from '../money/Money';
import type { YieldPolicy } from '../yield/YieldPolicy';

const MS_PER_DAY = 86_400_000;

const defaultPolicy: YieldPolicy = {
  indexer: 'CDI',
  rateType: 'PERCENT_INDEXER',
  dayCountConvention: 'CALENDAR_DAYS_365',
  rateTiers: [{ upTo: null, baseRateValue: 100, bonusRateValue: 0 }],
};

function createInvestment(daysAgo: number, options?: { taxDisplayMode?: 'NET' | 'GROSS'; principal?: number; currentBalance?: number }): Investment {
  const now = new Date('2026-10-26T12:00:00Z');
  const startDate = new Date(now.getTime() - daysAgo * MS_PER_DAY);
  return Investment.create({
    id: 'inv-test-1',
    name: 'CDB DI Liquidez Diária',
    principal: Money.fromBRL(options?.principal ?? 10000),
    currentBalance: Money.fromBRL(options?.currentBalance ?? 10500),
    startDate,
    policy: defaultPolicy,
    taxDisplayMode: options?.taxDisplayMode ?? 'NET',
  });
}

describe('TaxAlertService', () => {
  const evaluationDate = new Date('2026-10-26T12:00:00Z');

  describe('Ativos sem tributação regressiva (GROSS)', () => {
    it('retorna array vazio para investimentos com taxDisplayMode = GROSS', () => {
      const inv = createInvestment(10, { taxDisplayMode: 'GROSS' });
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);
      expect(alerts).toEqual([]);
    });
  });

  describe('Alertas de IOF (< 30 dias)', () => {
    it('alerta quando faltam 20 dias para zerar IOF (dia 10)', () => {
      const inv = createInvestment(10);
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const iofAlert = alerts.find(a => a.type === 'IOF_ZERO');
      expect(iofAlert).toBeDefined();
      expect(iofAlert?.daysRemaining).toBe(20);
      expect(iofAlert?.currentRate).toBe(0.66); // dia 10 na tabela regressiva de IOF
      expect(iofAlert?.targetRate).toBe(0);
      expect(iofAlert?.estimatedTaxSavings.toBRL()).toBe(330); // 500 de lucro * 0.66
      expect(iofAlert?.title.pt).toContain('IOF zera em 20 dias');
    });

    it('alerta quando falta apenas 1 dia para zerar IOF (dia 29)', () => {
      const inv = createInvestment(29);
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const iofAlert = alerts.find(a => a.type === 'IOF_ZERO');
      expect(iofAlert).toBeDefined();
      expect(iofAlert?.daysRemaining).toBe(1);
      expect(iofAlert?.currentRate).toBe(0.03); // dia 29
      expect(iofAlert?.title.pt).toBe('IOF zera em 1 dia');
    });

    it('não gera alerta de IOF a partir do dia 30 (já zerado)', () => {
      const inv = createInvestment(30);
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const iofAlert = alerts.find(a => a.type === 'IOF_ZERO');
      expect(iofAlert).toBeUndefined();
    });
  });

  describe('Alertas de transição de alíquota regressiva de IR', () => {
    it('não gera alerta de IR quando faltam mais de 30 dias para a mudança (ex: dia 100)', () => {
      const inv = createInvestment(100);
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const irAlert = alerts.find(a => a.type === 'IR_DROP');
      expect(irAlert).toBeUndefined();
    });

    it('alerta na fronteira de 30 dias para transição de 22,5% para 20% (dia 151)', () => {
      const inv = createInvestment(151); // 181 - 151 = 30 dias
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const irAlert = alerts.find(a => a.type === 'IR_DROP');
      expect(irAlert).toBeDefined();
      expect(irAlert?.daysRemaining).toBe(30);
      expect(irAlert?.currentRate).toBe(0.225);
      expect(irAlert?.targetRate).toBe(0.20);
      expect(irAlert?.estimatedTaxSavings.toBRL()).toBe(12.5); // 500 * (0.225 - 0.200) = 12.50
    });

    it('alerta quando falta 1 dia para o IR cair para 20% (dia 180)', () => {
      const inv = createInvestment(180); // 181 - 180 = 1 dia
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const irAlert = alerts.find(a => a.type === 'IR_DROP');
      expect(irAlert).toBeDefined();
      expect(irAlert?.daysRemaining).toBe(1);
      expect(irAlert?.currentRate).toBe(0.225);
      expect(irAlert?.targetRate).toBe(0.20);
      expect(irAlert?.title.pt).toBe('IR cai para 20.0% em 1 dia');
    });

    it('não alerta no dia 181 (já virou para a faixa de 20% e faltam 180 dias para 17,5%)', () => {
      const inv = createInvestment(181);
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const irAlert = alerts.find(a => a.type === 'IR_DROP');
      expect(irAlert).toBeUndefined();
    });

    it('alerta quando faltam 15 dias para o IR cair para 17,5% (dia 346)', () => {
      const inv = createInvestment(346); // 361 - 346 = 15 dias
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const irAlert = alerts.find(a => a.type === 'IR_DROP');
      expect(irAlert).toBeDefined();
      expect(irAlert?.daysRemaining).toBe(15);
      expect(irAlert?.currentRate).toBe(0.20);
      expect(irAlert?.targetRate).toBe(0.175);
    });

    it('alerta quando faltam 10 dias para o IR atingir o piso mínimo histórico de 15% (dia 711)', () => {
      const inv = createInvestment(711); // 721 - 711 = 10 dias
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      const irAlert = alerts.find(a => a.type === 'IR_DROP');
      expect(irAlert).toBeDefined();
      expect(irAlert?.daysRemaining).toBe(10);
      expect(irAlert?.currentRate).toBe(0.175);
      expect(irAlert?.targetRate).toBe(0.15);
      expect(irAlert?.title.pt).toBe('IR cai para 15.0% em 10 dias');
    });

    it('não alerta a partir do dia 721 (alíquota mínima de 15% já atingida)', () => {
      const inv = createInvestment(725);
      const alerts = TaxAlertService.getAlertsForInvestment(inv, evaluationDate);

      expect(alerts).toHaveLength(0);
    });
  });
});
