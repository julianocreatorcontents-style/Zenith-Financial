import React, { useMemo } from 'react';
import { ArrowUpRight, TrendingUp, ArrowRightLeft } from 'lucide-react';
import { Transaction } from '../../types/app';
import { checkDuplicates } from '../../lib/dataUtils';

interface TimelineProps {
  transactions: Transaction[];
  privacyMode: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ transactions, privacyMode }) => {
  const grouped = useMemo(() => {
    const groups: Record<string, { date: Date; items: Transaction[]; total: number }> = {};
    transactions.forEach(t => {
      const date = t.date?.toDate ? t.date.toDate() : new Date();
      const key = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      if (!groups[key]) {
        groups[key] = { date, items: [], total: 0 };
      }
      groups[key].items.push(t);
      groups[key].total += t.type === 'out' ? -t.value : t.value;
    });
    const result = Object.entries(groups).sort((a, b) => b[1].date.getTime() - a[1].date.getTime());
    checkDuplicates(result, '0'); // Field '0' is the date string
    return result;
  }, [transactions]);

  return (
    <div className="space-y-6">
      {grouped.map(([dateStr, group], groupIdx) => (
        <div key={`${dateStr}-${groupIdx}`} className="space-y-3">
          <div className="sticky top-0 z-10 bg-[var(--bg-app)]/80 backdrop-blur-md py-2 flex justify-between items-center border-b border-[var(--border-card)]">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{dateStr}</span>
            <span className={`text-sm font-mono font-bold ${group.total >= 0 ? 'text-[var(--trend-up)]' : 'text-[var(--trend-down)]'}`}>
              {privacyMode ? '••••' : `R$ ${(group.total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </span>
          </div>
          <div className="space-y-2">
            {group.items.map((t, idx) => (
              <div key={`tx-group-${t.id}-${idx}`} className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition-all group">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'in' ? 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]' : t.type === 'yield' ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'}`}>
                    {t.type === 'in' ? <ArrowUpRight size={18} /> : t.type === 'yield' ? <TrendingUp size={18} /> : <ArrowRightLeft size={18} className="rotate-90" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{t.label}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono">{t.metodo_origem || 'Manual'}</span>
                      {t.etiqueta_personalizada && (
                        <span className="px-1.5 py-0.5 bg-[var(--bg-app)] text-[var(--text-muted)] text-[9px] rounded-md border border-[var(--border-card)]">
                          {t.etiqueta_personalizada}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono font-bold ${t.type === 'out' ? 'text-[var(--trend-down)]' : 'text-[var(--trend-up)]'}`}>
                    {t.type === 'out' ? '-' : '+'} {privacyMode ? '••••' : `R$ ${(t.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  </div>
                  {t.contexto_ia && (
                    <div className="text-[10px] text-[var(--accent)] italic max-w-[150px] truncate">
                      {t.contexto_ia.insight}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Timeline;
