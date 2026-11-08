import React from 'react';
import { ArrowRightLeft, ArrowUpRight } from 'lucide-react';
import type { Transaction } from '../../types/app';
import {
  isExpenseTransaction,
  isTransferTransaction,
  parseTransactionAmount,
} from '../../lib/finance';

const formatBRL2 = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'R$ 0,00';

const getTransactionCategory = (transaction: Transaction) =>
  transaction?.categoria_primaria || transaction?.category || 'Outros';

export interface DashboardTimelineProps {
  transactions: Transaction[];
  privacyMode: boolean;
  t: (pt: string, en: string) => string;
}

export const DashboardTimeline: React.FC<DashboardTimelineProps> = ({
  transactions,
  privacyMode,
  t,
}) => {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-1">
        {t("Transações Recentes", "Recent Transactions")}
      </p>
      {transactions.slice(0, 3).map((tx, idx) => {
        const transfer = isTransferTransaction(tx);
        const expense = isExpenseTransaction(tx);
        const amount = parseTransactionAmount(tx.value);
        const sign = transfer ? '↔' : expense ? '-' : '+';
        const tone = transfer
          ? 'text-[var(--text-muted)]'
          : expense
            ? 'text-[var(--trend-down)]'
            : 'text-[var(--trend-up)]';
        const bgTone = transfer
          ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
          : expense
            ? 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'
            : 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]';

        return (
          <div key={`${tx.id}-${idx}`} className="flex justify-between items-center p-3 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)]">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bgTone}`}>
                {transfer ? <ArrowRightLeft size={14} className="rotate-90" /> : <ArrowUpRight size={14} />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-medium text-[var(--text-primary)]">{tx.label}</p>
                  {tx.applied === false && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase tracking-wider">
                      {t("Agendado", "Scheduled")}
                    </span>
                  )}
                </div>
                <p className="text-[8px] text-[var(--text-muted)] uppercase font-bold">{getTransactionCategory(tx)}</p>
              </div>
            </div>
            <p className={`text-xs font-mono font-bold ${tone}`}>
              {privacyMode ? '•••' : `${sign} ${formatBRL2(amount)}`}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default DashboardTimeline;
