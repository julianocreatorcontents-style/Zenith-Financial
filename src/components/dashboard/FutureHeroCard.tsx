import React, { useState, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { calculateNetWorthProjection } from '../../lib/adapters/netWorthProjection';

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

type Tab = 'diario' | 'mensal' | 'anual';

export const FutureHeroCard: React.FC<FutureHeroCardProps> = ({
  currentNetWorth,
  assets,
  transactions,
  cdiAnnualPercent,
  privacy,
  onTogglePrivacy,
}) => {
  const [tab, setTab] = useState<Tab>('mensal');

  const months = tab === 'diario' ? 1 : tab === 'mensal' ? 12 : 60;
  const horizon = tab === 'diario' ? '30 dias' : tab === 'mensal' ? '12 meses' : '5 anos';

  const { chartData, projectedTotal, gain } = useMemo(() => {
    const raw = calculateNetWorthProjection({
      assets,
      transactions,
      cdiAnnualPercent,
      months,
      monthlyContribution: 0,
      includeCashFlow: true,
    });

    const finalValue = raw.length > 0
      ? (raw[raw.length - 1].valueNet ?? raw[raw.length - 1].value ?? currentNetWorth)
      : currentNetWorth;

    // Se for "diario" (months=1), interpola 30 pontos entre hoje e o final do mês
    if (tab === 'diario' && raw.length < 30) {
      const interpolated = Array.from({ length: 30 }, (_, i) => ({
        name: 'Dia ' + (i + 1),
        value: currentNetWorth + ((finalValue - currentNetWorth) * (i + 1)) / 30,
        date: 'Dia ' + (i + 1),
      }));
      return {
        chartData: interpolated,
        projectedTotal: finalValue,
        gain: finalValue - currentNetWorth,
      };
    }

    return {
      chartData: raw.map((d: any) => ({
        name: d.name,
        value: d.valueNet ?? d.value ?? 0,
        date: d.name,
      })),
      projectedTotal: finalValue,
      gain: finalValue - currentNetWorth,
    };
  }, [tab, months, assets, transactions, cdiAnnualPercent, currentNetWorth]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'diario', label: '30 Dias' },
    { id: 'mensal', label: '12 Meses' },
    { id: 'anual', label: '5 Anos' },
  ];

  return (
    <section className="bg-[var(--bg-card)] border-2 border-[var(--accent)]/40 rounded-[32px] p-5 sm:p-6 relative overflow-hidden bg-gradient-to-br from-[var(--accent)]/5 via-[var(--bg-card)] to-[var(--bg-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">Futuro</span>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] uppercase tracking-wider">
          {horizon}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-3xl font-mono tracking-tighter font-medium text-[var(--text-primary)]">
          {privacy ? '••••••••' : FMT(projectedTotal)}
        </h2>
        <button
          onClick={onTogglePrivacy}
          className="w-7 h-7 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        >
          {privacy ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] mb-1 px-1">
        Saldo + rendimento + fluxo de caixa projetado
      </p>

      <div className="flex gap-2 mb-2 mt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              'flex-1 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ' +
              (tab === t.id
                ? 'bg-[var(--accent)] text-[var(--bg-app)]'
                : 'bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-card)]')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-baseline gap-1 mb-1 px-1">
        <p className="text-base font-bold text-[var(--trend-up)]">
          {privacy ? '••••' : '+' + FMT(gain)}
        </p>
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">no período</span>
      </div>

      <div className="h-48 w-full -mr-5 sm:-mr-6 mt-2 overflow-hidden">
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
            <YAxis
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-primary)', fontSize: 8, opacity: 0.6 }}
              tickFormatter={(value) => FMT0(Number(value))}
            />
            <Tooltip
              cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '5 5' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1">{d.date}</p>
                      <p className="text-base font-mono font-bold text-[var(--text-primary)]">
                        {FMT(Number(d.value ?? 0))}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#future-grad)"
              activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--bg-app)', strokeWidth: 2 }}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
