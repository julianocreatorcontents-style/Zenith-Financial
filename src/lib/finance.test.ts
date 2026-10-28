import { describe, it, expect } from 'vitest';
import {
  calculateMonthBalance,
  calculateTotals,
  calculateNetWorth,
  calculateVariation,
  calculateCashFlowData,
  calculateRealProfitability,
  calculateEvolutionData,
  getMiniChartData,
  parseTransactionDate,
  isExpenseTransaction,
  isIncomeTransaction,
} from './finance';

describe('finance utils', () => {
  describe('calculateRealProfitability', () => {
    it('calcula rentabilidade real segundo a fórmula de Fisher', () => {
      const real = calculateRealProfitability(10, 5);
      expect(real).toBeCloseTo(0.047619, 5);
    });
  });

  describe('parseTransactionDate', () => {
    it('faz parse correto de Timestamp, Date, seconds e string local', () => {
      const d = new Date(2026, 9, 28, 12, 0, 0);
      expect(parseTransactionDate(d)?.getTime()).toBe(d.getTime());
      expect(parseTransactionDate({ toDate: () => d })?.getTime()).toBe(d.getTime());
      expect(parseTransactionDate({ seconds: Math.floor(d.getTime() / 1000) })?.getTime()).toBe(
        Math.floor(d.getTime() / 1000) * 1000
      );
      const parsedStr = parseTransactionDate('2026-10-28');
      expect(parsedStr?.getFullYear()).toBe(2026);
      expect(parsedStr?.getMonth()).toBe(9); // Outubro
      expect(parsedStr?.getDate()).toBe(28);
    });

    it('retorna null para valores nulos ou inválidos', () => {
      expect(parseTransactionDate(null)).toBeNull();
      expect(parseTransactionDate(undefined)).toBeNull();
      expect(parseTransactionDate('data-invalida')).toBeNull();
    });
  });

  describe('isExpenseTransaction', () => {
    it('reconhece variações de tipo de saída', () => {
      expect(isExpenseTransaction({ type: 'out' })).toBe(true);
      expect(isExpenseTransaction({ type: 'saida' })).toBe(true);
      expect(isExpenseTransaction({ type: 'Saída' })).toBe(true);
      expect(isExpenseTransaction({ type: 'despesa' })).toBe(true);
      expect(isExpenseTransaction({ type: 'in' })).toBe(false);
      expect(isIncomeTransaction({ type: 'in' })).toBe(true);
      expect(isIncomeTransaction({ type: 'entrada' })).toBe(true);
    });
  });

  describe('calculateMonthBalance', () => {
    it('soma entradas e rendimentos e subtrai saídas do mês especificado', () => {
      const txs = [
        { type: 'in', value: 1000.5, date: new Date(2026, 3, 10) },
        { type: 'yield', value: 50.25, date: new Date(2026, 3, 15) },
        { type: 'out', value: 200.75, date: new Date(2026, 3, 20) },
        { type: 'in', value: 500, date: new Date(2026, 2, 10) }, // mês anterior
      ];

      const balance = calculateMonthBalance(txs, 3, 2026);
      expect(balance).toBe(850.0); // 1000.50 + 50.25 - 200.75
    });

    it('ignora transações com datas inválidas ou nulas', () => {
      const txs = [
        { type: 'in', value: 500, date: null },
        { type: 'in', value: 500, date: 'invalid-date' },
        { type: 'in', value: 200, date: new Date(2026, 5, 1) },
      ];

      expect(calculateMonthBalance(txs, 5, 2026)).toBe(200);
    });
  });

  describe('calculateTotals', () => {
    it('filtra corretamente por mês/ano e não inclui transações sem data', () => {
      const txs = [
        { type: 'in', value: 1500, date: new Date(2026, 5, 10) },
        { type: 'out', value: 300, date: new Date(2026, 5, 12) },
        { type: 'yield', value: 45.67, date: new Date(2026, 5, 15) },
        { type: 'in', value: 9999, date: null }, // sem data - NÃO deve cair no mês
        { type: 'in', value: 9999, date: undefined },
      ];

      const assets = [
        { type: 'investment', value: 50000 },
        { type: 'checking', value: 2000 },
      ];

      const totals = calculateTotals(txs, 5, 2026, assets);

      expect(totals.in).toBe(1500);
      expect(totals.out).toBe(300);
      expect(totals.yield).toBe(45.67);
      expect(totals.investments).toBe(50000);
    });

    it('suporta Timestamp do Firestore com .toDate()', () => {
      const firestoreTimestamp = {
        toDate: () => new Date(2026, 5, 10),
      };

      const txs = [{ type: 'in', value: 1200, date: firestoreTimestamp }];
      const totals = calculateTotals(txs, 5, 2026, []);
      expect(totals.in).toBe(1200);
    });
  });

  describe('calculateNetWorth', () => {
    it('consolida todos os ativos mais o saldo do mês para transações unapplied', () => {
      const assets = [
        { value: 10000 },
        { value: 5000.5 },
      ];
      const txs = [
        { type: 'in', value: 1000, date: new Date(2026, 0, 1) },
        { type: 'out', value: 200, date: new Date(2026, 0, 2) },
      ];

      const nw = calculateNetWorth(assets, txs, 0, 2026);
      expect(nw).toBe(15800.5);
    });

    it('não duplica dedução de transações já aplicadas a uma conta de ativo', () => {
      // Ex: Saldo do MP já foi descontado de 1000 para 850 pelo pagamento Copel
      const assets = [{ id: 'mp-1', value: 850 }];
      const txs = [
        { id: 'tx-copel', type: 'out', value: 150, date: new Date(2026, 9, 15), applied: true, assetId: 'mp-1' },
      ];

      const nw = calculateNetWorth(assets, txs, 9, 2026);
      // Não deve subtrair 150 novamente, mantendo 850
      expect(nw).toBe(850);
    });
  });

  describe('getMiniChartData', () => {
    it('retorna 2 pontos para renderização suave quando houver apenas 1 transação', () => {
      const txs = [{ type: 'out', value: 150 }];
      const data = getMiniChartData(txs, 'out');
      expect(data).toHaveLength(2);
      expect(data[0].v).toBe(0);
      expect(data[1].v).toBe(150);
    });
  });

  describe('calculateVariation', () => {
    it('calcula variação percentual corretamente', () => {
      expect(calculateVariation(110, 100)).toBe('+10.0%');
      expect(calculateVariation(90, 100)).toBe('-10.0%');
      expect(calculateVariation(100, 0)).toBe('+100%');
      expect(calculateVariation(0, 0)).toBe('0%');
    });
  });

  describe('calculateCashFlowData', () => {
    it('preserva precisão em centavos nos valores de fluxo de caixa', () => {
      const txs = [
        { type: 'in', value: 1000.45, date: new Date() },
        { type: 'out', value: 300.20, date: new Date() },
      ];

      const points = calculateCashFlowData(txs);
      const currentMonthIndex = new Date().getMonth();
      const currentMonthPoint = points[currentMonthIndex];

      expect(currentMonthPoint?.value).toBe(700.25);
    });
  });

  describe('calculateEvolutionData', () => {
    it('calcula evolução diária acumulativa do mês sem contaminação de outros meses', () => {
      const assets = [{ value: 10000 }];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const txs = [
        { type: 'in', value: 2000, date: new Date(currentYear, currentMonth, 5) },
        { type: 'yield', value: 100, date: new Date(currentYear, currentMonth, 10) },
        { type: 'out', value: 500, date: new Date(currentYear, currentMonth, 15) },
        { type: 'in', value: 50000, date: new Date(currentYear, currentMonth + 1, 1) },
      ];

      const points = calculateEvolutionData(assets, txs, { period: 'Meses', month: 'Atual', day: 'Todos' });
      expect(points.length).toBeGreaterThan(0);

      const p1 = points.find(p => p.name === '01');
      if (p1 && typeof p1.value === 'number') {
        expect(p1.value).toBe(10000);
      }

      const expectedNetWorth = calculateNetWorth(assets, txs, currentMonth, currentYear);
      expect(expectedNetWorth).toBe(11600);

      const todayDay = now.getDate().toString().padStart(2, '0');
      const todayPoint = points.find(p => p.name === todayDay);
      if (todayPoint && typeof todayPoint.value === 'number') {
        expect(todayPoint.value).toBe(expectedNetWorth);
      }
    });

    it('sincroniza curva com saldo descontado para transações aplicadas no mês', () => {
      // Ativo começa com 10.000. Copel (-150) foi paga no dia 15 e descontada do saldo do ativo (hoje tem 9.850).
      const assets = [{ id: 'mp-1', value: 9850 }];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const txs = [
        { id: 'tx-copel', type: 'out', value: 150, date: new Date(currentYear, currentMonth, 15, 12), applied: true, assetId: 'mp-1' },
      ];

      const points = calculateEvolutionData(assets, txs, { period: 'Meses', month: 'Atual', day: 'Todos' });

      // No dia 01 (antes do pagamento da Copel): o saldo era 10.000
      const p1 = points.find(p => p.name === '01');
      if (p1 && typeof p1.value === 'number') {
        expect(p1.value).toBe(10000);
      }

      // No dia 15 em diante (ou hoje): o saldo é 9.850
      const todayDay = now.getDate().toString().padStart(2, '0');
      const todayPoint = points.find(p => p.name === todayDay);
      if (todayPoint && typeof todayPoint.value === 'number') {
        expect(todayPoint.value).toBe(9850);
      }

      // Sincronizado perfeitamente com calculateNetWorth
      expect(calculateNetWorth(assets, txs, currentMonth, currentYear)).toBe(9850);
    });

    it('em período Anos retorna pontos com o cálculo exato do patrimônio de cada mês', () => {
      const assets = [{ value: 20000 }];
      const points = calculateEvolutionData(assets, [], { period: 'Anos' });
      expect(points).toHaveLength(12);
      expect(points.every(p => p.value === 20000)).toBe(true);
    });
  });
});
