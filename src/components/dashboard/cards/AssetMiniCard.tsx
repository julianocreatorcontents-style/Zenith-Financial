import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { projectYieldBetween, resolveAssetPolicy } from '../../../lib/adapters/assetYieldService';
import { useInView } from '../../../hooks/useInView';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

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
  onSettings: _onSettings,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [timeShift, setTimeShift] = useState(0);
  const { ref: cardRef, isInView } = useInView<HTMLDivElement>();

  const TIME_LABELS = ['Hoje', '1 Mês', '6 Meses', '1 Ano'];

  const currentValue = Number(asset?.currentValue ?? asset?.manualBalance ?? asset?.value ?? 0) || 0;
  const dailyYield = Number(asset?.dailyYield ?? 0) || 0;
  const weekendYield = Number(asset?.manualWeekendYield ?? 0) || 0;
  const accumulatedYield = Number(asset?.accumulatedYield ?? asset?.yieldSinceAnchor ?? 0) || 0;
  const monthYieldRemaining = Number(asset?.monthYieldRemaining ?? 0) || 0;
  const baseBalance = Number(asset?.baseBalance ?? asset?.valorInvestido ?? currentValue) || currentValue;

  const resolved = resolveAssetPolicy(asset);
  const businessDays = resolved?.policy.dayCountConvention === 'BUSINESS_DAYS_252';
  const today = new Date();
  const horizons = [
    today,
    new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()),
    new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
  ];
  const projectedValues = horizons.map((horizon) =>
    currentValue + projectYieldBetween(dailyYield, weekendYield, businessDays, today, horizon)
  );
  const projectedValue = projectedValues[timeShift] ?? currentValue;
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

  // Sem histórico diário do ativo: usa a evolução real do saldo âncora até hoje.
  const chartData = Array.from({ length: 8 }, (_, index) => ({
    v: baseBalance + (currentValue - baseBalance) * (index / 7),
  }));
  const projectedData = Array.from({ length: 8 }, (_, index) => ({
    v: currentValue + (projectedValue - currentValue) * (index / 7),
  }));

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
              <motion.p key={projectedValue} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="text-4xl font-bold text-white drop-shadow-lg">
                {privacy ? '••••••' : fmtBRL(projectedValue)}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="mt-auto space-y-4 pointer-events-auto">
            <div className="space-y-1.5 text-[10px] sm:text-xs font-mono">
              <div className="flex justify-between gap-2 text-white/80">
                <span>Rende/dia</span>
                <span className="text-green-400 font-bold">{privacy ? '•••' : '+' + fmtBRL(dailyYield)}</span>
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

export default AssetMiniCard;
