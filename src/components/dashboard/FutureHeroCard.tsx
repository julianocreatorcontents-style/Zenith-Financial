import React, { useState, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { isRecurringActiveInMonth, parseTransactionDate } from '../../lib/finance';

interface FutureHeroCardProps {
  currentNetWorth: number;
  assets: any[];
  transactions: any[];
  cdiAnnualPercent: number;
  privacy: boolean;
  onTogglePrivacy: () => void;
}

const FMT = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const FMT0 = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type Tab = 'diario' | 'mensal' | 'anual';

export const FutureHeroCard: React.FC<FutureHeroCardProps> = ({
  currentNetWorth, assets, transactions, cdiAnnualPercent, privacy, onTogglePrivacy,
}) => {
  const [tab, setTab] = useState<Tab>('mensal');

  const { chartData, projectedTotal, gain } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // 1. Separar transações
    let entradasFixas = 0, saidasFixas = 0, entradasUnicas = 0, saidasUnicas = 0;
    const varExp: Record<string, { total: number; count: number }> = {};
    

    for (const tx of transactions) {
      const value = Number(tx.value) || 0;
      const isIn = tx.type === 'in';
      const isOut = tx.type === 'out';
      if (!isIn && !isOut) continue;

      if (tx.isRecurring) {
        if (isRecurringActiveInMonth(tx, today)) {
          if (isIn) entradasFixas += value; else saidasFixas += value;
        }
      } else {
        const parsedTxDate = parseTransactionDate(tx.date);
        const txDate = parsedTxDate || today;
        const monthsFromNow = (txDate.getFullYear() - currentYear) * 12 + (txDate.getMonth() - currentMonth);
        
        const label = tx.label?.toLowerCase().trim() || 'desconhecido';
        if (isOut) { 
          if (!varExp[label]) varExp[label] = { total: 0, count: 0 }; 
          varExp[label].total += value; 
          varExp[label].count += 1; 
        }

        // currentNetWorth já contém as transações do mês até hoje; somamos apenas as futuras.
        if (monthsFromNow === 0) {
          const alreadyInCurrentBalance = parsedTxDate !== null && txDate.getTime() <= endOfToday.getTime();
          if (!alreadyInCurrentBalance) {
            if (isIn) entradasUnicas += value; else saidasUnicas += value;
          }
        }
      }
    }

    let avgOut = 0; Object.values(varExp).forEach(v => { avgOut += v.total / v.count; });
    const fluxoVariavelMedio = -avgOut; // Apenas saídas entram na média

    const saldoBase = currentNetWorth + entradasUnicas - saidasUnicas;
    
    // 2. Gerar Gráfico com Simulação de Sweep
    const points: any[] = [{ name: 'Hoje', value: saldoBase, date: 'Hoje' }];

    if (tab === 'diario') {
      // Para 30 dias, usamos uma aproximação de 1 mês exato
      let rendimentoMes1 = 0;
      for (const asset of assets) {
        const isMP = (asset.name || '').toLowerCase().includes('mercado pago');
        const daily = Number(asset.manualDailyYield ?? asset.dailyYield ?? 0);
        rendimentoMes1 += daily * (isMP ? 22 : 30);
      }
      const fluxoPrimeiroMes = entradasFixas - saidasFixas + fluxoVariavelMedio;
      const saldoFimMes = saldoBase + rendimentoMes1 + fluxoPrimeiroMes;
      
      for (let d = 1; d <= 30; d++) {
        const interpolado = saldoBase + ((saldoFimMes - saldoBase) * d) / 30;
        points.push({ name: 'Dia ' + d, value: Math.round(interpolado * 100) / 100, date: 'Dia ' + d });
      }
      return { chartData: points, projectedTotal: saldoFimMes, gain: saldoFimMes - currentNetWorth };
    }

    const numMonths = tab === 'mensal' ? 12 : 60;
    let saldoTotal = saldoBase;
    
    // Clona os ativos para simular o Sweep
    let simulatedAssets = JSON.parse(JSON.stringify(assets));

    for (let m = 1; m <= numMonths; m++) {
      let rendimentoDoMes = 0;
      let mpSaldoIndex = -1;

      // Roda o rendimento do mês para cada ativo
      for (let j = 0; j < simulatedAssets.length; j++) {
        const asset = simulatedAssets[j];
        const isMP = (asset.name || '').toLowerCase().includes('mercado pago');
        if (asset.name === 'Mercado Pago · Saldo') mpSaldoIndex = j;

        const daily = Number(asset.manualDailyYield ?? asset.dailyYield ?? 0);
        const dias = isMP ? 22 : 30;
        
        const rend = daily * dias;
        rendimentoDoMes += rend;
        
        asset.currentValue = (asset.currentValue || asset.value) + rend;
      }

      const targetDate = new Date(today.getFullYear(), today.getMonth() + m, 1);

      // Fluxo de caixa do mês (entradas/saídas fixas + únicas futuras)
      // O fluxo variável já engloba as transações únicas futuras (média),
      // então não somamos futureSingles aqui para não duplicar.
      let fixasIn = 0, fixasOut = 0;
      for (const tx of transactions) {
        if (!tx.isRecurring) continue;
        const isIn = tx.type === 'in';
        const isOut = tx.type === 'out';
        if (!isIn && !isOut) continue;
        if (!isRecurringActiveInMonth(tx, targetDate)) continue;
        const value = Number(tx.value) || 0;
        if (isIn) fixasIn += value; else fixasOut += value;
      }

      const fluxoEsteMes = fixasIn - fixasOut + fluxoVariavelMedio;

      saldoTotal = saldoTotal + rendimentoDoMes + fluxoEsteMes;

      // SWEEP: Rendimentos vão para o MP Saldo, outros ativos resetam
      if (mpSaldoIndex !== -1) {
        simulatedAssets[mpSaldoIndex].currentValue += rendimentoDoMes;
      }
      for (let j = 0; j < simulatedAssets.length; j++) {
        if (j !== mpSaldoIndex) {
          simulatedAssets[j].currentValue = simulatedAssets[j].baseBalance || simulatedAssets[j].valorInvestido || simulatedAssets[j].value;
        }
      }

      points.push({
        name: MONTHS_SHORT[targetDate.getMonth()] + '/' + String(targetDate.getFullYear()).slice(-2),
        value: Math.round(saldoTotal * 100) / 100,
        date: MONTHS_SHORT[targetDate.getMonth()] + ' de ' + targetDate.getFullYear(),
      });
    }

    return { chartData: points, projectedTotal: saldoTotal, gain: saldoTotal - currentNetWorth };
  }, [tab, assets, transactions, currentNetWorth]);

  const horizon = tab === 'diario' ? '30 dias' : tab === 'mensal' ? '12 meses' : '5 anos';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'diario', label: '30 Dias' }, { id: 'mensal', label: '12 Meses' }, { id: 'anual', label: '5 Anos' },
  ];

  return (
    <section className="bg-[var(--bg-card)] border-2 border-[var(--accent)]/40 rounded-[32px] p-5 sm:p-6 relative overflow-hidden bg-gradient-to-br from-[var(--accent)]/5 via-[var(--bg-card)] to-[var(--bg-card)] h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">Futuro</span>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] uppercase tracking-wider">{horizon}</span>
      </div>

      <div className="flex items-center gap-3 mb-2 mt-4">
        <h2 className="text-3xl font-mono tracking-tighter font-medium text-[var(--text-primary)]">
          {privacy ? '••••••••' : FMT(projectedTotal)}
        </h2>
        <button onClick={onTogglePrivacy} className="w-7 h-7 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg flex items-center justify-center text-[var(--text-muted)]">
          {privacy ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] mb-1 px-1">Saldo + rendimento + fluxo de caixa projetado (com sweep)</p>

      <div className="flex gap-2 mb-2 mt-3">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'flex-1 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ' +
              (tab === t.id ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-card)]')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-baseline gap-1 mb-1 px-1">
        <p className="text-base font-bold text-[var(--trend-up)]">{privacy ? '••••' : '+' + FMT(gain)}</p>
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">no período</span>
      </div>

      <div className="h-48 w-full -mr-5 sm:-mr-6 mt-auto overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 10, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border-card)" strokeDasharray="3 3" opacity={0.3} />
            <defs>
              <linearGradient id="future-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" hide />
            <YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontSize: 8, opacity: 0.6 }} tickFormatter={(v) => FMT0(Number(v))} domain={['dataMin - 500', 'dataMax + 500']} />
            <Tooltip cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '5 5' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1">{d.date}</p>
                      <p className="text-base font-mono font-bold text-[var(--text-primary)]">{FMT(Number(d.value ?? 0))}</p>
                    </div>
                  );
                }
                return null;
              }} />
            <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#future-grad)" activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-app)', strokeWidth: 2 }} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
