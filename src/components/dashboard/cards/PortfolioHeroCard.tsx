import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Briefcase } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

export interface PortfolioHeroCardProps {
  totalBalance: number;
  dailyTotal: number;
  monthTotal: number;
  yearTotal: number;
  assetCount: number;
  avgPercent: number;
  chartData?: { v: number }[];
  /** Valores reais projetados para Hoje, 1 mês, 6 meses e 1 ano. */
  projectionValues?: number[];
  privacy?: boolean;
  onSettings?: () => void;
}

export const PortfolioHeroCard: React.FC<PortfolioHeroCardProps> = ({
  totalBalance,
  dailyTotal,
  monthTotal,
  yearTotal,
  assetCount,
  avgPercent,
  chartData = [],
  projectionValues,
  privacy,
  onSettings: _onSettings,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [timeShift, setTimeShift] = useState(0);

  const TIME_LABELS = ['Hoje', '1 Mês', '6 Meses', '1 Ano'];

  const haptic = () => { if (navigator.vibrate) navigator.vibrate(15); };

  const safeChart = chartData.length > 0 ? chartData : Array.from({ length: 8 }, () => ({ v: totalBalance }));
  const projectedTotal = projectionValues?.[timeShift] ?? totalBalance;
  const projectedData = Array.from({ length: 8 }, (_, i) => ({
    v: totalBalance + (projectedTotal - totalBalance) * (i / 7),
  }));

  const toggle = () => {
    haptic();
    setIsRevealed(!isRevealed);
    if (!isRevealed) setTimeShift(0);
  };

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative overflow-hidden rounded-[32px] shadow-xl flex flex-col flex-shrink-0 cursor-pointer group h-[80vh] aspect-[9/16] snap-center min-w-0 bg-gradient-to-br from-[var(--accent)]/20 via-[var(--bg-card)] to-[var(--bg-card)] border-2 border-[var(--accent)]/40 hover:border-[var(--accent)] transition-all"
      onClick={toggle}
    >
      <motion.div layout className={'absolute inset-0 flex flex-col p-6 transition-opacity duration-300 ' + (isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/40">
            <Briefcase size={14} className="text-[var(--accent)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">Portfólio</span>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] whitespace-nowrap">
            {avgPercent >= 0 ? '+' : ''}{avgPercent.toFixed(2)}%
          </span>
        </div>
        <div className="flex flex-col mt-auto">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Total da Carteira</p>
          <p className="text-3xl font-bold text-[var(--text-primary)] mb-1">{privacy ? '••••••' : fmtBRL(totalBalance)}</p>
          <p className="text-[10px] text-[var(--text-muted)] mb-4">{assetCount} {assetCount === 1 ? 'ativo' : 'ativos'}</p>
          <div className="h-16 w-full -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={safeChart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolio-front-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2.5} fill="url(#portfolio-front-grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: isRevealed ? 1 : 0, scale: isRevealed ? 1 : 0.95 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={'absolute inset-0 flex flex-col justify-between bg-black/85 backdrop-blur-md z-20 ' + (isRevealed ? 'pointer-events-auto' : 'pointer-events-none')}
      >
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projectedData} margin={{ top: 120, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolio-overlay-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={3} fill="url(#portfolio-overlay-grad)" dot={false} isAnimationActive={true} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="absolute inset-0 z-5 bg-gradient-to-b from-black/90 via-transparent to-black/95 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full p-6">
          <div className="pointer-events-none">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase size={14} className="text-[var(--accent)]" />
              <p className="text-[10px] text-white/70 uppercase tracking-widest font-black">Portfólio</p>
            </div>
            <AnimatePresence mode="popLayout">
              <motion.p key={projectedTotal} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="text-4xl font-bold text-white drop-shadow-lg">
                {privacy ? '••••••' : fmtBRL(projectedTotal)}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="mt-auto space-y-4 pointer-events-auto">
            <div className="space-y-1.5 text-[10px] sm:text-xs font-mono">
              <div className="flex justify-between gap-2 text-white/80">
                <span>Rende/dia</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(dailyTotal)}</span>
              </div>
              <div className="flex justify-between gap-2 text-white/80">
                <span>Até fim do mês</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(monthTotal)}</span>
              </div>
              <div className="flex justify-between gap-2 text-white/80">
                <span>Projeção anual</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(yearTotal)}</span>
              </div>
              <div className="flex justify-between gap-2 text-white/80">
                <span>Ativos</span>
                <span className="text-white font-bold">{assetCount}</span>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-[10px] sm:text-xs text-white/60 mb-2 uppercase font-bold tracking-widest">
                {TIME_LABELS.map((lbl, i) => (
                  <span key={lbl} className={timeShift === i ? 'text-green-400 font-black scale-110 transition-transform' : ''}>{lbl}</span>
                ))}
              </div>
              <input
                type="range" min="0" max="3" step="1" value={timeShift}
                onChange={(e) => { setTimeShift(Number(e.target.value)); haptic(); }}
                onClick={(e) => e.stopPropagation()}
                className="w-full accent-green-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PortfolioHeroCard;
