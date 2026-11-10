import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings as SettingsIcon } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import { useInView } from '../../../hooks/useInView';

export interface MiniMetricCardProps {
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
  const { ref: cardRef, isInView } = useInView<HTMLDivElement>();

  const mainColor = color || (resolveStyle ? resolveStyle(id, 'main_color', color) : color);
  const showValues = resolveStyle ? resolveStyle(id, 'show_values', true) : true;
  const gridStyle = resolveStyle ? resolveStyle(id, 'grid_style', 'none') : 'none';
  const marginTop = resolveStyle ? Number(resolveStyle(id, 'margin_top', 0)) || 0 : 0;

  const isBadTrend = isExpense ? trend === 'up' : trend === 'down';
  const hasChartData = Array.isArray(data) && data.length > 0;

  const haptic = () => { if (navigator.vibrate) navigator.vibrate(15); };

  const handleToggle = () => {
    haptic();
    setIsRevealed(!isRevealed);
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
                  type="button"
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
              <AreaChart data={hasChartData ? data : []} margin={{ top: 80, right: 0, left: 0, bottom: 0 }}>
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
                <motion.p key={String(value)} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="text-2xl sm:text-4xl font-bold text-white drop-shadow-lg">
                  {privacy ? '••••••' : value}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {overlayDetails && overlayDetails.length > 0 && (
            <div className="mt-auto">
              {overlayDetails.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex justify-between items-center border-b border-white/10 pb-1.5 mb-1.5">
                  <span className="text-xs text-white/70">{item.label}</span>
                  <span className="text-sm font-bold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export const MiniMetricCard = React.memo(MiniMetricCardBase);

export default MiniMetricCard;
