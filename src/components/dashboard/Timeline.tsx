import React, { useMemo } from 'react';
import { ArrowUpRight, TrendingUp, ArrowRightLeft } from 'lucide-react';
import { Transaction } from '../../types/app';
import { checkDuplicates } from '../../lib/dataUtils';
import {
  isExpenseTransaction,
  isTransferTransaction,
  isYieldTransaction,
  parseTransactionAmount,
  parseTransactionDate,
} from '../../lib/finance';

interface TimelineProps {
  transactions: Transaction[];
  privacyMode: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ transactions, privacyMode }) => {
  const grouped = useMemo(() => {
    const groups: Record<string, { date: Date; items: Transaction[]; total: number }> = {};
    transactions.forEach(t => {
      const date = parseTransactionDate((t as any).date || (t as any).createdAt) ?? new Date();
      const key = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      if (!groups[key]) {
        groups[key] = { date, items: [], total: 0 };
      }
      groups[key].items.push(t);
      if (isTransferTransaction(t)) return;
      const amount = parseTransactionAmount((t as any).value);
      groups[key].total += isExpenseTransaction(t) ? -amount : amount;
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
            {group.items.map((t, idx) => {
              const transfer = isTransferTransaction(t);
              const expense = isExpenseTransaction(t);
              const yieldTx = isYieldTransaction(t);
              const amount = parseTransactionAmount((t as any).value);
              const sign = transfer ? '↔' : expense ? '-' : '+';
              const tone = transfer
                ? 'text-[var(--text-muted)]'
                : expense
                  ? 'text-[var(--trend-down)]'
                  : yieldTx
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--trend-up)]';
              const bgTone = transfer
                ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                : expense
                  ? 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'
                  : yieldTx
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]';

              return (
                <div key={`tx-group-${t.id}-${idx}`} className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition-all group">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgTone}`}>
                      {transfer ? <ArrowRightLeft size={18} className="rotate-90" /> : yieldTx ? <TrendingUp size={18} /> : <ArrowUpRight size={18} />}
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
                    <div className={`text-sm font-mono font-bold ${tone}`}>
                      {sign} {privacyMode ? '••••' : amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    {t.contexto_ia && (
                      <div className="text-[10px] text-[var(--accent)] italic max-w-[150px] truncate">
                        {t.contexto_ia.insight}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Timeline;
