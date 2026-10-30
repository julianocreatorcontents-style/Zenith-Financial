import React, { useState, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { parseTransactionDate } from '../../lib/finance';

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
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // 1. Rendimento Mensal (22/30 dias)
    let yieldMensal = 0;
    let totalAssetsValue = 0;
    for (const asset of assets) {
      const daily = Number(asset.manualDailyYield ?? asset.dailyYield ?? 0);
      const val = Number(asset.currentValue || asset.value) || 0;
      const isMP = (asset.name || '').toLowerCase().includes('mercado pago');
      yieldMensal += daily * (isMP ? 22 : 30);
      totalAssetsValue += val;
    }
    const taxaMensal = totalAssetsValue > 0 ? (yieldMensal / totalAssetsValue) : 0;

    // 2. Separar Fixas, Únicas Passadas/Futuras e calcular Média Variável
    let entradasFixas = 0, saidasFixas = 0;
    let entradasUnicas = 0, saidasUnicas = 0;
    const futureSingles: any[] = [];
    const varExp: Record<string, { total: number; count: number }> = {};
    const varInc: Record<string, { total: number; count: number }> = {};

    for (const tx of transactions) {
      const value = Number(tx.value) || 0;
      const isIn = tx.type === 'in';
      const isOut = tx.type === 'out';
      if (!isIn && !isOut) continue;

      if (tx.isRecurring) {
        if (isIn) entradasFixas += value; else saidasFixas += value;
      } else {
        const txDate = parseTransactionDate(tx.date) || today;
        const monthsFromNow = (txDate.getFullYear() - currentYear) * 12 + (txDate.getMonth() - currentMonth);

        if (monthsFromNow > 0) {
          futureSingles.push({ ...tx, monthsFromNow });
        } else {
          // Passado/Atual: ajusta saldo base E entra na média
          if (isIn) entradasUnicas += value; else saidasUnicas += value;
          const label = tx.label?.toLowerCase().trim() || 'desconhecido';
          if (isOut) { if (!varExp[label]) varExp[label] = { total: 0, count: 0 }; varExp[label].total += value; varExp[label].count += 1; }
          else { if (!varInc[label]) varInc[label] = { total: 0, count: 0 }; varInc[label].total += value; varInc[label].count += 1; }
        }
      }
    }

    let avgOut = 0; Object.values(varExp).forEach(v => { avgOut += v.total / v.count; });
    let avgIn = 0; Object.values(varInc).forEach(v => { avgIn += v.total / v.count; });
    const fluxoVariavelMedio = avgIn - avgOut;

    const saldoBase = currentNetWorth + entradasUnicas - saidasUnicas;
    const fluxoRecorrenteLiquido = entradasFixas - saidasFixas + yieldMensal + fluxoVariavelMedio;

    // 3. Gerar Gráfico
    const points: any[] = [{ name: 'Hoje', value: saldoBase, date: 'Hoje' }];

    if (tab === 'diario') {
      // 30 dias = 1 mês de projeção
      const fluxoPrimeiroMes = fluxoRecorrenteLiquido + futureSingles.filter(f => f.monthsFromNow === 1).reduce((acc, f) => acc + (f.type === 'in' ? f.value : -f.value), 0);
      const saldoFimMes = saldoBase * (1 + taxaMensal) + fluxoPrimeiroMes;
      
      for (let d = 1; d <= 30; d++) {
        const interpolado = saldoBase + ((saldoFimMes - saldoBase) * d) / 30;
        points.push({ name: 'Dia ' + d, value: Math.round(interpolado * 100) / 100, date: 'Dia ' + d });
      }
      return { chartData: points, projectedTotal: saldoFimMes, gain: saldoFimMes - currentNetWorth };
    }

    const numMonths = tab === 'mensal' ? 12 : 60;
    let saldo = saldoBase;
    let simulatedAssets = JSON.parse(JSON.stringify(assets));

    for (let m = 1; m <= numMonths; m++) {
      let rendimentoDoMes = 0;
      let mpSaldoIndex = -1;

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

      let fluxoEsteMes = fluxoVariavelMedio;
      for (const tx of transactions) {
        if (!tx.isRecurring) continue;
        if (tx.durationMonths !== null && tx.durationMonths !== undefined && m > tx.durationMonths) continue;
        const value = Number(tx.value) || 0;
        if (tx.type === 'in') fluxoEsteMes += value;
        else if (tx.type === 'out') fluxoEsteMes -= value;
      }

      for (const tx of futureSingles) {
        if (tx.monthsFromNow === m) {
          const value = Number(tx.value) || 0;
          if (tx.type === 'in') fluxoEsteMes += value;
          else if (tx.type === 'out') fluxoEsteMes -= value;
        }
      }

      saldo = saldo + rendimentoDoMes + fluxoEsteMes;

      // Sweep
      if (mpSaldoIndex !== -1) {
        simulatedAssets[mpSaldoIndex].currentValue += rendimentoDoMes;
      }
      for (let j = 0; j < simulatedAssets.length; j++) {
        if (j !== mpSaldoIndex) {
          simulatedAssets[j].currentValue = simulatedAssets[j].baseBalance || simulatedAssets[j].valorInvestido || simulatedAssets[j].value;
        }
      }

      const targetDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
      points.push({
        name: MONTHS_SHORT[targetDate.getMonth()] + '/' + String(targetDate.getFullYear()).slice(-2),
        value: Math.round(saldo * 100) / 100,
        date: MONTHS_SHORT[targetDate.getMonth()] + ' de ' + targetDate.getFullYear(),
      });
    }

    return { chartData: points, projectedTotal: saldo, gain: saldo - currentNetWorth };
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

      <p className="text-[10px] text-[var(--text-muted)] mb-1 px-1">Saldo + rendimento + fluxo de caixa projetado</p>

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
            <YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontSize: 8, opacity: 0.6 }} tickFormatter={(v) => FMT0(Number(v))} />
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
