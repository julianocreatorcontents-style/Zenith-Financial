/**
 * @Agente02 - Builder
 * Funções puras para cálculos financeiros e formatação de dados.
 * Segue o princípio de Responsabilidade Única (SRP).
 */

export const calculateSplitValue = (total: number, participantsCount: number) => {
  return Math.round((total / (participantsCount + 1)) * 100) / 100;
};

export const calculateRealProfitability = (nominalRate: number, inflationRate: number) => {
  // Formula: ((1 + r_nominal) / (1 + i)) - 1
  return ((1 + nominalRate / 100) / (1 + inflationRate / 100)) - 1;
};

export const calculateTotals = (transactions: any[], month: number, year: number, splits: any[] = [], assets: any[] = []) => {
  const filtered = transactions.filter(t => {
    const d = t.date?.toDate ? t.date.toDate() : new Date();
    return d.getMonth() === month && d.getFullYear() === year;
  });
  
  const sum = (acc: number, val: number) => Math.round((acc + val) * 100) / 100;

  const investmentTotal = assets
    .filter(a => a.type === 'investment')
    .reduce((acc, a) => sum(acc, a.value ?? 0), 0);

  return {
    in: filtered.filter(t => t.type === 'in').reduce((acc, t) => sum(acc, t.value ?? 0), 0),
    out: filtered.filter(t => t.type === 'out').reduce((acc, t) => sum(acc, t.value ?? 0), 0),
    yield: filtered.filter(t => t.type === 'yield').reduce((acc, t) => sum(acc, t.value ?? 0), 0),
    toReceive: splits.reduce((acc, s) => sum(acc, s.shareValue ?? 0), 0),
    investments: investmentTotal
  };
};

export const calculateVariation = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const v = ((current - previous) / previous) * 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

export const getMiniChartData = (transactions: any[], type: string, defaultData: any[]) => {
  const filtered = transactions.filter(t => t.type === type).slice(0, 10).reverse();
  if (filtered.length === 0) return defaultData;
  return filtered.map(t => ({ v: t.value }));
};

export const calculateEvolutionData = (assets: any[], transactions: any[]) => {
  const total = assets.reduce((acc, curr) => Math.round((acc + curr.value) * 100) / 100, 0);
  const sortedTx = [...transactions].sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate().getTime() : Date.now();
    const dateB = b.date?.toDate ? b.date.toDate().getTime() : Date.now();
    return dateB - dateA;
  });

  const data = [];
  let runningTotal = total;
  const now = new Date();
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dayStr = date.getDate().toString().padStart(2, '0');
    const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const monthStr = monthNames[date.getMonth()];
    
    data.push({
      name: dayStr,
      value: Math.round(runningTotal),
      date: `${dayStr} de ${monthStr}`
    });

    const dayTx = sortedTx.filter(t => {
      const txDate = t.date?.toDate ? t.date.toDate() : new Date();
      return txDate.getDate() === date.getDate() && 
             txDate.getMonth() === date.getMonth() && 
             txDate.getFullYear() === date.getFullYear();
    });

    dayTx.forEach(t => {
      if (t.type === 'in' || t.type === 'yield') {
        runningTotal = Math.round((runningTotal - t.value) * 100) / 100;
      }
      if (t.type === 'out') {
        runningTotal = Math.round((runningTotal + t.value) * 100) / 100;
      }
    });
  }

  data.push({ name: '', value: 0, date: 'Início' });
  const reversed = data.reverse();

  const lastPoint = reversed[reversed.length - 1];
  const lastValue = lastPoint?.value || 0;
  const lastDate = new Date();

  for (let i = 1; i <= 5; i++) {
    const projDate = new Date(lastDate);
    projDate.setDate(lastDate.getDate() + i);
    const dayStr = projDate.getDate().toString().padStart(2, '0');
    
    reversed.push({
      name: dayStr,
      value: null,
      predicted: Math.round(lastValue * (1 + (i * 0.005))),
      date: `${dayStr} (Projeção)`
    });
  }

  return reversed;
};

export const calculateCashFlowData = (transactions: any[]) => {
  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const getMonthValue = (month: number, year: number) => {
    const monthTx = transactions.filter(t => {
      const txDate = t.date?.toDate ? t.date.toDate() : (t.date ? new Date(t.date) : null);
      if (!txDate || isNaN(txDate.getTime())) return false;
      return txDate.getMonth() === month && txDate.getFullYear() === year;
    });

    const income = monthTx
      .filter(t => t.type === 'in' || t.type === 'yield')
      .reduce((acc, t) => Math.round((acc + (t.value ?? 0)) * 100) / 100, 0);
    const expense = monthTx
      .filter(t => t.type === 'out')
      .reduce((acc, t) => Math.round((acc + (t.value ?? 0)) * 100) / 100, 0);

    return {
      value: Math.round((income - expense) / 1000),
      hasData: monthTx.length > 0
    };
  };

  const previousMonths = [0, 1, 2].map(offset => {
    const date = new Date(currentYear, currentMonth - offset, 1);
    return getMonthValue(date.getMonth(), date.getFullYear());
  });
  const monthsWithData = previousMonths.filter(m => m.hasData);

  let projection = 0;
  if (monthsWithData.length >= 3) {
    projection = Math.round(monthsWithData.reduce((acc, m) => acc + m.value, 0) / 3);
  } else if (previousMonths[1].hasData) {
    projection = previousMonths[1].value;
  } else if (previousMonths[0].hasData) {
    projection = previousMonths[0].value;
  }

  return months.map((name, index) => {
    const isPredicted = index > currentMonth;
    const value = isPredicted
      ? projection
      : getMonthValue(index, currentYear).value;

    return { name, value, isPredicted };
  });
};
