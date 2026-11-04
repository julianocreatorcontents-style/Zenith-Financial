import { describe, it, expect, vi } from 'vitest';
import {
  calculateMonthBalance,
  calculateTotals,
  calculateNetWorth,
  calculateCategoryExpenses,
  calculateVariation,
  calculateCashFlowData,
  calculateRealProfitability,
  calculateEvolutionData,
  calculateGoalProjection,
  isRecurringActiveInMonth,
  resolveGoalTargets,
  DEFAULT_FINANCIAL_GOALS,
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

    it('reconstrói o patrimônio de um mês passado revertendo aplicações posteriores', () => {
      const now = new Date();
      const month = (now.getMonth() + 11) % 12;
      const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();

      const assets = [{ id: 'mp-1', value: 15000 }];
      const txs = [
        { type: 'in', value: 5000, date: new Date(year, month + 1, 5), applied: true, assetId: 'mp-1' },
        { type: 'in', value: 500, date: new Date(year, month - 1, 5) },
      ];

      // 15.000 atuais - 5.000 aplicados depois do mês + 500 ainda não aplicados antes dele
      expect(calculateNetWorth(assets, txs, month, year)).toBe(10500);
    });
  });

  describe('calculateCategoryExpenses', () => {
    it('agrega despesas por categoria, converte strings e arredonda centavos', () => {
      const txs = [
        { type: 'out', value: '1.234,56', categoria_primaria: 'Moradia', date: new Date(2026, 10, 2) },
        { type: 'out', value: '25,44', categoria_primaria: 'Moradia', date: new Date(2026, 10, 3) },
        { type: 'out', value: 300, category: 'Lazer', date: new Date(2026, 10, 4) },
        { type: 'in', value: 999, category: 'Salário', date: new Date(2026, 10, 5) },
      ];

      expect(calculateCategoryExpenses(txs, 10, 2026)).toEqual([
        { name: 'Moradia', value: 1260 },
        { name: 'Lazer', value: 300 },
      ]);
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

    it('ordena cronologicamente antes de montar o sparkline', () => {
      const txs = [
        { type: 'out', value: 30, date: new Date(2026, 0, 3) },
        { type: 'out', value: 10, date: new Date(2026, 0, 1) },
        { type: 'out', value: 20, date: new Date(2026, 0, 2) },
      ];
      expect(getMiniChartData(txs, 'out')).toEqual([{ v: 10 }, { v: 20 }, { v: 30 }]);
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

    it('projeta meses futuros pela média dos meses completos, sem o mês parcial', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));

        const txs = [
          { type: 'in', value: 1000, date: new Date(2026, 8, 10) },
          { type: 'in', value: 2000, date: new Date(2026, 9, 10) },
          { type: 'out', value: 10000, date: new Date(2026, 10, 3) },
        ];

        const points = calculateCashFlowData(txs);
        expect(points[10]?.value).toBe(-10000);
        expect(points[11]?.isPredicted).toBe(true);
        expect(points[11]?.value).toBe(1500);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('calculateEvolutionData', () => {
    const MONTHS_PT = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Usa o mês anterior ao atual para que as transações dos dias 5/10/15
    // sejam sempre passadas, independentemente do dia em que o teste rodar.
    const previousMonthAnchor = () => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const month = (currentMonth + 11) % 12;
      const year = month > currentMonth ? now.getFullYear() - 1 : now.getFullYear();
      return { month, year, name: MONTHS_PT[month] };
    };
    const lastDayOfMonth = (month: number, year: number) =>
      new Date(year, month + 1, 0).getDate().toString().padStart(2, '0');

    it('calcula evolução diária acumulativa do mês sem contaminação de outros meses', () => {
      const assets = [{ value: 10000 }];
      const { month, year, name } = previousMonthAnchor();

      const txs = [
        { type: 'in', value: 2000, date: new Date(year, month, 5) },
        { type: 'yield', value: 100, date: new Date(year, month, 10) },
        { type: 'out', value: 500, date: new Date(year, month, 15) },
        { type: 'in', value: 50000, date: new Date(year, month + 1, 1) },
      ];

      const points = calculateEvolutionData(assets, txs, { period: 'Meses', month: name, day: 'Todos' });
      expect(points.length).toBeGreaterThan(0);

      const p1 = points.find(p => p.name === '01');
      if (p1 && typeof p1.value === 'number') {
        expect(p1.value).toBe(10000);
      }

      const expectedNetWorth = calculateNetWorth(assets, txs, month, year);
      expect(expectedNetWorth).toBe(11600);

      const lastPoint = points.find(p => p.name === lastDayOfMonth(month, year));
      if (lastPoint && typeof lastPoint.value === 'number') {
        expect(lastPoint.value).toBe(expectedNetWorth);
      }
    });

    it('sincroniza curva com saldo descontado para transações aplicadas no mês', () => {
      // Ativo começa com 10.000. Copel (-150) foi paga no dia 15 e descontada do saldo do ativo (hoje tem 9.850).
      const assets = [{ id: 'mp-1', value: 9850 }];
      const { month, year, name } = previousMonthAnchor();

      const txs = [
        { id: 'tx-copel', type: 'out', value: 150, date: new Date(year, month, 15, 12), applied: true, assetId: 'mp-1' },
      ];

      const points = calculateEvolutionData(assets, txs, { period: 'Meses', month: name, day: 'Todos' });

      // No dia 01 (antes do pagamento da Copel): o saldo era 10.000
      const p1 = points.find(p => p.name === '01');
      if (p1 && typeof p1.value === 'number') {
        expect(p1.value).toBe(10000);
      }

      // No fim do mês (após o pagamento): o saldo é 9.850
      const lastPoint = points.find(p => p.name === lastDayOfMonth(month, year));
      if (lastPoint && typeof lastPoint.value === 'number') {
        expect(lastPoint.value).toBe(9850);
      }

      // Sincronizado perfeitamente com calculateNetWorth
      expect(calculateNetWorth(assets, txs, month, year)).toBe(9850);
    });

    it('reverte aplicações de meses posteriores e soma pendências anteriores', () => {
      const assets = [{ id: 'mp-1', value: 15000 }];
      const { month, year, name } = previousMonthAnchor();

      const txs = [
        { type: 'in', value: 5000, date: new Date(year, month + 1, 5), applied: true, assetId: 'mp-1' },
        { type: 'in', value: 500, date: new Date(year, month - 1, 5) },
      ];

      const points = calculateEvolutionData(assets, txs, { period: 'Meses', month: name, day: 'Todos' });
      const firstPoint = points.find(p => p.name === '01');
      const lastPoint = points.find(p => p.name === lastDayOfMonth(month, year));

      expect(firstPoint?.value).toBe(10500);
      expect(lastPoint?.value).toBe(10500);
      expect(calculateNetWorth(assets, txs, month, year)).toBe(10500);
    });

    it('usa o valor histórico dos ativos quando um resolvedor é informado', () => {
      const assets = [{ value: 10000 }];
      const points = calculateEvolutionData(
        assets,
        [],
        { period: 'Meses', month: 'Atual', day: 'Todos' },
        { assetsValueAt: (date) => 10000 + date.getDate() }
      );

      const firstPoint = points.find(p => p.name === '01');
      expect(firstPoint?.value).toBe(10001);
    });

    it('em período Anos retorna pontos com o cálculo exato do patrimônio de cada mês', () => {
      const assets = [{ value: 20000 }];
      const points = calculateEvolutionData(assets, [], { period: 'Anos' });
      expect(points).toHaveLength(12);
      expect(points.every(p => p.value === 20000)).toBe(true);
    });
  });

  describe('isRecurringActiveInMonth', () => {
    it('respeita o número de meses da recorrência', () => {
      const tx = { isRecurring: true, date: new Date(2026, 10, 4), durationMonths: 3 };

      expect(isRecurringActiveInMonth(tx, new Date(2026, 10, 1))).toBe(true);
      expect(isRecurringActiveInMonth(tx, new Date(2026, 11, 1))).toBe(true);
      expect(isRecurringActiveInMonth(tx, new Date(2027, 0, 1))).toBe(true);
      expect(isRecurringActiveInMonth(tx, new Date(2027, 1, 1))).toBe(false);
    });

    it('considera recorrência sem duração como infinita', () => {
      const tx = { isRecurring: true, date: new Date(2026, 0, 1), durationMonths: null };
      expect(isRecurringActiveInMonth(tx, new Date(2036, 0, 1))).toBe(true);
    });

    it('não ativa antes do mês de início', () => {
      const tx = { isRecurring: true, date: new Date(2026, 11, 1), durationMonths: 12 };
      expect(isRecurringActiveInMonth(tx, new Date(2026, 10, 1))).toBe(false);
    });
  });

  describe('resolveGoalTargets', () => {
    it('usa os valores padrão quando não há configuração', () => {
      expect(resolveGoalTargets()).toEqual(DEFAULT_FINANCIAL_GOALS);
      expect(resolveGoalTargets(null)).toEqual(DEFAULT_FINANCIAL_GOALS);
    });

    it('respeita metas válidas configuradas', () => {
      expect(resolveGoalTargets({ emergencyReserve: 50000, financialFreedom: 2500000 })).toEqual({
        emergencyReserve: 50000,
        financialFreedom: 2500000,
      });
    });

    it('ignora valores inválidos, zero ou negativos', () => {
      expect(
        resolveGoalTargets({ emergencyReserve: 0, financialFreedom: -10 })
      ).toEqual(DEFAULT_FINANCIAL_GOALS);
      expect(
        resolveGoalTargets({ emergencyReserve: Number.NaN, financialFreedom: Number.POSITIVE_INFINITY })
      ).toEqual(DEFAULT_FINANCIAL_GOALS);
    });

    it('preenche apenas a meta inválida com o padrão', () => {
      expect(resolveGoalTargets({ emergencyReserve: 60000 })).toEqual({
        emergencyReserve: 60000,
        financialFreedom: DEFAULT_FINANCIAL_GOALS.financialFreedom,
      });
    });
  });

  describe('calculateGoalProjection', () => {
    it('não conta duas vezes transações do mês já refletidas no patrimônio', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));

        const alreadyCounted = {
          type: 'out',
          value: 100,
          date: new Date(2026, 10, 4),
          isRecurring: false,
          label: 'Mercado',
        };

        const result = calculateGoalProjection(1000, [alreadyCounted], [], 100000);

        expect(result.saldoBase).toBe(1000);
        expect(result.debug.saidasUnicas).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('soma apenas as transações futuras do mês atual', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));

        const future = {
          type: 'out',
          value: 100,
          date: new Date(2026, 10, 20),
          isRecurring: false,
          label: 'Conta futura',
        };

        const result = calculateGoalProjection(1000, [future], [], 100000);

        expect(result.saldoBase).toBe(900);
        expect(result.debug.saidasUnicas).toBe(100);
      } finally {
        vi.useRealTimers();
      }
    });

    it('soma entrada agendada do mês atual ao saldo base do Hero Card', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));

        const futureIncome = {
          type: 'in',
          value: 1621,
          date: new Date(2026, 10, 20),
          isRecurring: false,
          label: 'Entrada agendada',
        };

        const result = calculateGoalProjection(1000, [futureIncome], [], 100000);

        expect(result.saldoBase).toBe(2621);
        expect(result.debug.entradasUnicas).toBe(1621);
      } finally {
        vi.useRealTimers();
      }
    });

    it('encerra a recorrência após durationMonths e retorna Infinity quando a meta não é atingida', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));

        const income = {
          type: 'in',
          value: 100,
          date: new Date(2026, 10, 4),
          isRecurring: true,
          durationMonths: 1,
          label: 'Renda curta',
        };

        const result = calculateGoalProjection(1000, [income], [], 2000);

        expect(result.monthsToGoal).toBe(Infinity);
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignora transações de meses anteriores no saldo base', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));

        const past = {
          type: 'out',
          value: 200,
          date: new Date(2026, 9, 20),
          isRecurring: false,
          label: 'Conta passada',
        };

        const result = calculateGoalProjection(1000, [past], [], 100000);

        expect(result.saldoBase).toBe(1000);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
