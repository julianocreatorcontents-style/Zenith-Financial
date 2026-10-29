import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MoreVertical, Settings as SettingsIcon, ShieldCheck, X, TrendingUp, Briefcase } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import { DDA } from '../../types/app';
import { resolveAssetPolicy } from '../../lib/adapters/assetYieldService';
import { useInView } from '../../hooks/useInView';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  onClick?: () => void;
  privacy?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, onClick, privacy }) => {
  return (
    <button
      onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-4 rounded-[24px] flex flex-col items-start gap-2 active:scale-95 transition-transform hover:border-[var(--text-muted)] relative overflow-hidden group"
    >
      <div className="flex justify-between w-full items-start">
        <div className="text-[var(--text-secondary)]">{icon}</div>
        <MoreVertical size={12} className="text-[var(--text-muted)]" />
      </div>
      <div className="text-left z-10">
        <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-tight mb-0.5">{label}</p>
        <p className="text-[14px] font-mono font-bold text-[var(--text-primary)] tracking-tighter">
          {privacy ? '•••' : value}
        </p>
      </div>
    </button>
  );
};

interface MiniMetricCardProps {
  id: string;
  label: string;
  value: string | number;
  percent: string;
  trend: 'up' | 'down';
  data?: { v: number }[];
  color?: string;
  opacity?: number;
  privacy?: boolean;
  onSettings?: () => void;
  resolveStyle?: (id: string, property: string, defaultValue: any) => any;
  isExpense?: boolean;
  overlayDetails?: { label: string; value: string }[];
  children?: React.ReactNode;
}

const MiniMetricCardBase: React.FC<MiniMetricCardProps> = ({
  id,
  label,
  value,
  percent,
  trend,
  data,
  color,
  opacity,
  privacy,
  onSettings,
  resolveStyle,
  isExpense,
  overlayDetails,
  children
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [timeShift, setTimeShift] = useState(0);
  const { ref: cardRef, isInView } = useInView<HTMLDivElement>();

  const multipliers = [1, 1.05, 1.3, 1.6];
  const currentMultiplier = multipliers[timeShift];
  const TIME_LABELS = ['Hoje', '1 Mês', '6 Meses', '1 Ano'];

  const mainColor = color || (resolveStyle ? resolveStyle(id, 'main_color', color) : color);
  const showValues = resolveStyle ? resolveStyle(id, 'show_values', true) : true;
  const gridStyle = resolveStyle ? resolveStyle(id, 'grid_style', 'none') : 'none';
  const marginTop = resolveStyle ? Number(resolveStyle(id, 'margin_top', 0)) || 0 : 0;

  const isBadTrend = isExpense ? trend === 'up' : trend === 'down';
  const hasChartData = Array.isArray(data) && data.length > 0;

  const numericValue = Number(String(value).replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;

  const projectedData = hasChartData ? data.map((d: any) => ({ ...d, v: d.v * currentMultiplier })) : [];

  const haptic = () => { if (navigator.vibrate) navigator.vibrate(15); };

  const handleToggle = () => {
    haptic();
    setIsRevealed(!isRevealed);
    if (!isRevealed) setTimeShift(0);
  };

  return (
    <motion.div
      ref={cardRef}
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative overflow-hidden bg-[var(--bg-card)] border border-[var(--border-card)] p-3 sm:p-5 rounded-[24px] sm:rounded-[32px] flex flex-col gap-2 sm:gap-3 cursor-pointer group hover:border-[var(--accent)] transition-all"
      style={{ borderColor: color ? `${color}40` : 'var(--border-card)', opacity: opacity ?? 1 }}
      onClick={handleToggle}
    >
      <motion.div layout className={`flex flex-col h-full w-full transition-opacity duration-300 ${isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
              <p className="text-[8px] sm:text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{label}</p>
              {onSettings && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSettings(); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  <SettingsIcon size={10} />
                </button>
              )}
            </div>
            <h4 className="text-[11px] sm:text-xl font-mono font-bold text-[var(--text-primary)] tracking-tighter">
              {privacy ? '••••••' : value}
            </h4>
          </div>
          <div className={`text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg ${!isBadTrend ? 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]' : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'}`}>
            {percent}
          </div>
        </div>

        <div className="h-8 sm:h-12 w-full mt-1 sm:mt-2">
          {hasChartData && isInView ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: marginTop, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid
                  vertical={gridStyle === 'vertical' || gridStyle === 'both'}
                  horizontal={gridStyle === 'horizontal' || gridStyle === 'both'}
                  stroke="var(--border-card)"
                  strokeDasharray="3 3"
                  opacity={0.2}
                />
                <defs>
                  <linearGradient id={`color-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={mainColor} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={mainColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={mainColor}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill={`url(#color-${label})`}
                  isAnimationActive={false}
                  hide={!showValues}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        </div>
        {children}
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: isRevealed ? 1 : 0, scale: isRevealed ? 1 : 0.95 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`absolute inset-0 flex flex-col justify-between bg-black/80 backdrop-blur-md z-20 ${isRevealed ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {isRevealed && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectedData} margin={{ top: 80, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-mountain-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={mainColor} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={mainColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={mainColor} strokeWidth={3} fill={`url(#grad-mountain-${label})`} dot={false} isAnimationActive={false} hide={!showValues} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="absolute inset-0 z-5 bg-gradient-to-b from-black/90 via-transparent to-black/95 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full p-5 sm:p-6">
          <div className="flex justify-between items-start pointer-events-none">
            <div>
              <p className="text-[10px] sm:text-sm text-white/70 uppercase tracking-wider mb-1">{label}</p>
              <AnimatePresence mode="popLayout">
                <motion.p key={numericValue * currentMultiplier} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="text-2xl sm:text-4xl font-bold text-white drop-shadow-lg">
                  {privacy ? '••••••' : fmtBRL(numericValue * currentMultiplier)}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {overlayDetails && overlayDetails.length > 0 && (
            <div className="mt-4">
              {overlayDetails.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex justify-between items-center border-b border-white/10 pb-1.5 mb-1.5">
                  <span className="text-xs text-white/70">{item.label}</span>
                  <span className="text-sm font-bold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto space-y-4 pointer-events-auto">
            <div className="pt-2">
              <div className="flex justify-between text-[8px] sm:text-[10px] text-white/60 mb-2 uppercase font-bold tracking-widest">
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

export const MiniMetricCard = React.memo(MiniMetricCardBase);

export interface AssetMiniCardProps {
  asset: any;
  cdiAnnualPercent: number;
  privacy?: boolean;
  onSettings?: () => void;
}

export const AssetMiniCardBase: React.FC<AssetMiniCardProps> = ({
  asset,
  cdiAnnualPercent: _cdiAnnualPercent,
  privacy,
  onSettings,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [timeShift, setTimeShift] = useState(0);
  const { ref: cardRef, isInView } = useInView<HTMLDivElement>();

  const multipliers = [1, 1.05, 1.3, 1.6];
  const currentMultiplier = multipliers[timeShift];
  const TIME_LABELS = ['Hoje', '1 Mês', '6 Meses', '1 Ano'];

  const currentValue = Number(asset?.currentValue ?? asset?.value ?? 0) || 0;
  const dailyYield = Number(asset?.dailyYield ?? 0) || 0;
  const accumulatedYield = Number(asset?.accumulatedYield ?? asset?.yieldSinceAnchor ?? 0) || 0;
  const monthYieldRemaining = Number(asset?.monthYieldRemaining ?? 0) || 0;

  const resolved = resolveAssetPolicy(asset);
  const tier = resolved?.policy.rateTiers[0];
  const effectiveRate = (tier?.baseRateValue || 0) + (tier?.bonusRateValue || 0);
  const rateStr = resolved
    ? resolved.policy.rateType === 'FIXED'
      ? effectiveRate.toFixed(2) + '% a.a.'
      : resolved.policy.rateType === 'SPREAD'
        ? 'CDI + ' + effectiveRate.toFixed(2) + '%'
        : effectiveRate + '% CDI'
    : '';

  const initials = (() => {
    const n = (asset?.name || '').toLowerCase();
    if (n.includes('99')) return '99';
    if (n.includes('mercado') || n.includes('mp ')) return 'MP';
    if (n.includes('cofrinho')) return '🐷';
    return (asset?.name || '?').substring(0, 2).toUpperCase();
  })();

  const safeId = String(asset?.id ?? asset?.name ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  const lineGradientId = 'asset-line-' + safeId;
  const overlayGradientId = 'asset-overlay-' + safeId;

  const chartData = Array.from({ length: 8 }, (_, index) => ({
    v: currentValue * (0.98 + (0.02 * index) / 7),
  }));
  const projectedData = chartData.map((point) => ({ v: point.v * currentMultiplier }));

  const haptic = () => { if (navigator.vibrate) navigator.vibrate(15); };

  const handleToggle = () => {
    haptic();
    setIsRevealed(!isRevealed);
    if (!isRevealed) setTimeShift(0);
  };

  return (
    <motion.div
      ref={cardRef}
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative overflow-hidden bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] shadow-lg flex flex-col flex-shrink-0 cursor-pointer group h-[80vh] aspect-[9/16] snap-center min-w-0"
      onClick={handleToggle}
    >
      <motion.div layout className={'absolute inset-0 flex flex-col p-6 transition-opacity duration-300 ' + (isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-[var(--bg-app)] rounded-2xl flex items-center justify-center min-w-[48px] min-h-[48px]">
            <span className="text-base font-black text-[var(--accent)]">{initials}</span>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] whitespace-nowrap">
            {rateStr || '—'}
          </span>
        </div>
        <div className="flex flex-col mt-auto">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">{asset?.name}</p>
          <p className="text-3xl font-bold text-[var(--text-primary)] mb-4">{privacy ? '••••••' : fmtBRL(currentValue)}</p>
          <div className="h-16 w-full -mx-2">
            {isInView && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={lineGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00FFA3" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#00FFA3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#00FFA3" strokeWidth={2.5} fill={'url(#' + lineGradientId + ')'} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: isRevealed ? 1 : 0, scale: isRevealed ? 1 : 0.95 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={'absolute inset-0 flex flex-col justify-between bg-black/80 backdrop-blur-md z-20 ' + (isRevealed ? 'pointer-events-auto' : 'pointer-events-none')}
      >
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {isRevealed && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectedData} margin={{ top: 120, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={overlayGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00FFA3" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#00FFA3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="#00FFA3" strokeWidth={3} fill={'url(#' + overlayGradientId + ')'} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="absolute inset-0 z-5 bg-gradient-to-b from-black/90 via-transparent to-black/90 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full p-6">
          <div className="pointer-events-none">
            <p className="text-sm text-white/70 uppercase tracking-wider mb-1">{asset?.name}</p>
            <AnimatePresence mode="popLayout">
              <motion.p key={currentValue * currentMultiplier} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="text-4xl font-bold text-white drop-shadow-lg">
                {privacy ? '••••••' : fmtBRL(currentValue * currentMultiplier)}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="mt-auto space-y-4 pointer-events-auto">
            <div className="space-y-1.5 text-[10px] sm:text-xs font-mono">
              <div className="flex justify-between gap-2 text-white/80">
                <span>Rende/dia</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(dailyYield * currentMultiplier)}</span>
              </div>
              <div className="flex justify-between gap-2 text-white/80">
                <span>Acumulado</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(accumulatedYield)}</span>
              </div>
              <div className="flex justify-between gap-2 text-white/80">
                <span>Fim do mês</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(monthYieldRemaining)}</span>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-[10px] sm:text-xs text-white/60 mb-2 uppercase font-bold tracking-widest">
                {TIME_LABELS.map((lbl, index) => (
                  <span key={lbl} className={timeShift === index ? 'text-green-400 font-black scale-110 transition-transform' : ''}>{lbl}</span>
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

export const AssetMiniCard = React.memo(AssetMiniCardBase);

interface PortfolioHeroCardProps {
  totalBalance: number;
  dailyTotal: number;
  monthTotal: number;
  yearTotal: number;
  assetCount: number;
  avgPercent: number;
  chartData?: { v: number }[];
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
  privacy,
  onSettings,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [timeShift, setTimeShift] = useState(0);

  const multipliers = [1, 1.05, 1.3, 1.6];
  const currentMultiplier = multipliers[timeShift];
  const TIME_LABELS = ['Hoje', '1 Mês', '6 Meses', '1 Ano'];

  const haptic = () => { if (navigator.vibrate) navigator.vibrate(15); };

  const safeChart = chartData.length > 0 ? chartData : Array.from({ length: 8 }, (_, i) => ({
    v: totalBalance * (0.98 + (0.02 * i) / 7),
  }));
  const projectedData = safeChart.map((p) => ({ v: p.v * currentMultiplier }));

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
              <motion.p key={totalBalance * currentMultiplier} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="text-4xl font-bold text-white drop-shadow-lg">
                {privacy ? '••••••' : fmtBRL(totalBalance * currentMultiplier)}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="mt-auto space-y-4 pointer-events-auto">
            <div className="space-y-1.5 text-[10px] sm:text-xs font-mono">
              <div className="flex justify-between gap-2 text-white/80">
                <span>Rende/dia</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(dailyTotal * currentMultiplier)}</span>
              </div>
              <div className="flex justify-between gap-2 text-white/80">
                <span>Até fim do mês</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(monthTotal * currentMultiplier)}</span>
              </div>
              <div className="flex justify-between gap-2 text-white/80">
                <span>Projeção anual</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(yearTotal * currentMultiplier)}</span>
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

interface DDASuggestionProps {
  dda: DDA;
  onAccept: (dda: DDA) => void;
  onReject: (dda: DDA) => void;
  privacy: boolean;
  language: string;
}

export const DDASuggestion: React.FC<DDASuggestionProps> = ({ dda, onAccept, onReject, privacy, language }) => {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-4 flex items-center justify-between gap-4 overflow-hidden"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
          <ShieldCheck size={20} />
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest">{t("Sugestão DDA", "DDA Suggestion")}</p>
          <h4 className="text-sm font-medium text-[var(--text-primary)]">{dda.beneficiary}</h4>
          <p className="text-[10px] text-[var(--text-muted)]">
            {privacy ? '••••••' : (dda.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} •
            {t("Vencimento", "Due Date")}: {dda.dueDate?.toDate ? dda.dueDate.toDate().toLocaleDateString('pt-BR') : 'Hoje'} •
            CPF: {dda.cpf || t('Não informado', 'Not provided')}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onReject(dda)}
          className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={18} />
        </button>
        <button
          onClick={() => onAccept(dda)}
          className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-app)] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
        >
          {t("Aceitar", "Accept")}
        </button>
      </div>
    </motion.div>
  );
};

interface HomeInvestmentCardProps {
  saldoTotal: number;
  perfilAtual: string;
  privacyMode: boolean;
  allocatedPercent: number | string;
  onClick?: () => void;
}

export const HomeInvestmentCard: React.FC<HomeInvestmentCardProps> = ({
  saldoTotal,
  perfilAtual,
  privacyMode,
  allocatedPercent,
  onClick
}) => {
  const allocation = Math.max(0, Math.min(100, Number(allocatedPercent) || 0));
  
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] flex flex-col gap-4 relative overflow-hidden group cursor-pointer"
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">Meus Investimentos</p>
          <h4 className="text-2xl font-mono font-bold text-[var(--text-primary)] tracking-tighter mt-1">
            {privacyMode ? '••••••' : (saldoTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h4>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
          <TrendingUp size={20} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Foco: {perfilAtual}</span>
          <span className="text-[10px] text-[var(--accent)] font-bold">{allocation}% do patrimônio</span>
        </div>
        <div className="h-2 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${allocation}%` }}
            className="h-full bg-[var(--accent)]"
          />
        </div>
      </div>
    </motion.div>
  );
};
