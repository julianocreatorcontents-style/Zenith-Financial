import React from 'react';
import { motion } from 'motion/react';
import { X, Plus, BarChart as BarChartIcon, ArrowRightLeft, Landmark, TrendingUp, LayoutGrid } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { Transaction } from '../../types/app';
import { Timeline } from '../dashboard/Timeline';

interface CategoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCategoryDetail: string | null;
  timeFilter: '7' | '15' | '30';
  setTimeFilter: (f: '7' | '15' | '30') => void;
  onOpenAddMenu?: () => void;
  cashFlowData: any[];
  metricsOutTotal: number;
  privacyMode: boolean;
  transactions: Transaction[];
}

export const CategoryDetailModal: React.FC<CategoryDetailModalProps> = ({
  isOpen,
  onClose,
  activeCategoryDetail,
  timeFilter,
  setTimeFilter,
  onOpenAddMenu,
  cashFlowData,
  metricsOutTotal,
  privacyMode,
  transactions
}) => {
  if (!isOpen) return null;

  const formatBRL = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[110] bg-[var(--bg-app)] overflow-y-auto"
    >
      {/* STICKY HEADER */}
      <div className="sticky top-0 z-20 bg-[var(--bg-app)]/80 backdrop-blur-xl border-b border-[var(--border-card)] px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose} 
              className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--accent)]/10 transition-colors"
            >
              <X size={20} />
            </button>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{activeCategoryDetail || 'Detalhes'}</h2>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">Visão Analítica Zenith</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-1">
              {(['7', '15', '30'] as const).map(f => (
                <button 
                  key={f}
                  onClick={() => setTimeFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeFilter === f ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  {f}D
                </button>
              ))}
            </div>
            {onOpenAddMenu && (
              <button 
                onClick={onOpenAddMenu}
                className="w-10 h-10 bg-[var(--accent)] text-[var(--bg-app)] rounded-xl flex items-center justify-center shadow-lg shadow-[var(--accent)]/20 hover:scale-105 transition-transform"
              >
                <Plus size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* DASHBOARD VISUAL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Sazonalidade (6 Meses)</span>
              <BarChartIcon size={16} className="text-[var(--accent)]" />
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData.slice(-6)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-card)" opacity={0.3} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontSize: 10 }} />
                  <YAxis hide />
                  <Tooltip 
                    formatter={(value) => formatBRL(Number(value))}
                    contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px' }}
                    cursor={{ fill: 'var(--accent)', opacity: 0.05 }}
                  />
                  <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Total Gasto', value: metricsOutTotal, color: 'var(--trend-down)' },
              { label: 'Média Mensal', value: metricsOutTotal / 6, color: 'var(--accent)' },
              { label: 'Variação %', value: '+12.5%', color: 'var(--trend-up)', isPercent: true }
            ].map((m, i) => (
              <div key={`summary-metric-${i}`} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-3xl p-5 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">{m.label}</p>
                  <p className="text-xl font-mono font-bold text-[var(--text-primary)]">
                    {privacyMode ? '••••' : m.isPercent ? m.value : `R$ ${Number(m.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${m.color}10`, color: m.color }}>
                  {i === 0 ? <ArrowRightLeft size={18} className="rotate-90" /> : i === 1 ? <Landmark size={18} /> : <TrendingUp size={18} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TIMELINE */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <LayoutGrid size={14} className="text-[var(--accent)]" />
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Timeline de Transações</span>
          </div>
          <Timeline 
            transactions={transactions.filter(t => !activeCategoryDetail || t.categoria_primaria === activeCategoryDetail || t.label.includes(activeCategoryDetail))} 
            privacyMode={privacyMode} 
          />
        </div>
      </div>
    </motion.div>
  );
};

export default CategoryDetailModal;
