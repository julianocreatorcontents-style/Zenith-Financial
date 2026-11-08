import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Settings as SettingsIcon } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { Transaction } from '../../types/app';
import { calculateCategoryExpenses } from '../../lib/finance';
import { DashboardTimeline } from './DashboardTimeline';

export type DrawerPage = 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash';
export type NavigationTab = 'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Armazenamento';

export interface CategoryDistributionChartProps {
  id?: string;
  transactions: Transaction[];
  recentTransactions?: Transaction[];
  chartFilterValue: { type: 'category' | 'asset' | null; value: string | null };
  setChartFilterValue: React.Dispatch<React.SetStateAction<{ type: 'category' | 'asset' | null; value: string | null }>>;
  opacity?: number;
  tooltipsEnabled?: boolean;
  privacyMode: boolean;
  onNavigateTab: (tab: NavigationTab) => void;
  openDrawer: (page?: DrawerPage) => void;
  t: (pt: string, en: string) => string;
}

export const CategoryDistributionChart: React.FC<CategoryDistributionChartProps> = ({
  id = 'CHART_DIST_CATEG',
  transactions,
  recentTransactions = [],
  chartFilterValue,
  setChartFilterValue,
  opacity = 1,
  tooltipsEnabled = true,
  privacyMode,
  onNavigateTab,
  openDrawer,
  t,
}) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const categoryData = useMemo(() => {
    return calculateCategoryExpenses(transactions, currentMonth, currentYear).map((item) => ({
      ...item,
      color: item.name === 'Moradia' ? 'var(--trend-down)' : 'var(--accent)',
    }));
  }, [transactions, currentMonth, currentYear]);

  if (categoryData.length === 0) {
    return (
      <section key={id} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 border-dashed opacity-60">
        <div className="flex justify-between items-center mb-6">
          <span className="text-xs font-medium text-[var(--text-muted)]">{t('Distribuição de Gastos', 'Expense Distribution')}</span>
          <div className="px-2 py-1 bg-[var(--accent)]/10 rounded-lg">
            <span className="text-[8px] font-bold text-[var(--accent)] uppercase tracking-widest">IA Placeholder</span>
          </div>
        </div>
        <div className="h-32 flex flex-col items-center justify-center gap-3">
          <Sparkles className="text-[var(--accent)] animate-pulse" size={24} />
          <p className="text-[10px] text-[var(--text-muted)] text-center max-w-[200px]">
            {t("Este gráfico será injetado dinamicamente após o processamento de dados pela IA.", "This chart will be dynamically injected after AI data processing.")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <motion.section 
      key={`${id}-${categoryData.length > 0}`} 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6"
    >
      <div className="flex justify-between items-center mb-6">
        <span className="text-xs font-medium text-[var(--text-muted)]">{t('Distribuição de Gastos', 'Expense Distribution')}</span>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigateTab('IA')}
            className="flex items-center gap-1.5 text-[var(--accent)] hover:text-[var(--text-primary)] transition-colors group"
          >
            <Sparkles size={14} className="group-hover:animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">Zenith IA</span>
          </button>
          <button onClick={() => openDrawer('settings')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
            <SettingsIcon size={16} />
          </button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="w-32 h-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Pie
                data={categoryData}
                innerRadius={35}
                outerRadius={55}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
                onClick={(data) => {
                  if (data && data.name) {
                    setChartFilterValue(prev => 
                      prev.value === data.name ? { type: null, value: null } : { type: 'category', value: data.name ?? null }
                    );
                  }
                }}
              >
                {categoryData.map((entry, entryIdx) => (
                  <Cell 
                    key={`cell-dist-${entry.name}-${entryIdx}`} 
                    fill={entry.color} 
                    fillOpacity={chartFilterValue.value === entry.name ? 1 : opacity}
                    className="cursor-pointer outline-none"
                  />
                ))}
              </Pie>
              {tooltipsEnabled && <Tooltip />}
            </RePieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 w-full space-y-3">
          {categoryData.map((item, idx) => (
            <div key={`cat-info-${item.name}-${idx}`} className="flex justify-between items-center w-full p-2 rounded-xl hover:bg-[var(--text-primary)]/5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-[var(--text-secondary)]">{item.name}</span>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-primary)]">
                {privacyMode ? '•••' : (item.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Transações Recentes */}
      {recentTransactions.length > 0 && (
        <div className="mt-8 space-y-6">
          <DashboardTimeline
            transactions={recentTransactions}
            privacyMode={privacyMode}
            t={t}
          />
        </div>
      )}
    </motion.section>
  );
};

export default CategoryDistributionChart;
