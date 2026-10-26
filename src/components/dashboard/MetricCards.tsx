import React from 'react';
import { motion } from 'motion/react';
import { MoreVertical, Settings as SettingsIcon, ShieldCheck, X, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import { DDA } from '../../types/app';

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
  children?: React.ReactNode;
}

export const MiniMetricCard: React.FC<MiniMetricCardProps> = ({
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
  children
}) => {
  const mainColor = color || (resolveStyle ? resolveStyle(id, 'main_color', color) : color);
  const showValues = resolveStyle ? resolveStyle(id, 'show_values', true) : true;
  const gridStyle = resolveStyle ? resolveStyle(id, 'grid_style', 'none') : 'none';
  const marginTop = resolveStyle ? Number(resolveStyle(id, 'margin_top', 0)) || 0 : 0;

  // For expenses, trend 'up' (increase) is bad (red)
  const isBadTrend = isExpense ? trend === 'up' : trend === 'down';
  const hasChartData = Array.isArray(data) && data.length > 0;

  return (
    <div 
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 sm:p-5 rounded-[24px] sm:rounded-[32px] flex flex-col gap-2 sm:gap-3 relative overflow-hidden group hover:border-[var(--accent)] transition-all"
      style={{ borderColor: color ? `${color}40` : 'var(--border-card)', opacity: opacity ?? 1 }}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-0">
        <div>
          <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
            <p className="text-[8px] sm:text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{label}</p>
            {onSettings && (
              <button 
                onClick={onSettings}
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
        {hasChartData ? (
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
                animationDuration={2000}
                hide={!showValues}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <div className="w-2/3 border-t border-dashed border-[var(--border-card)]" />
          </div>
        )}
      </div>

      {children}
    </div>
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
