import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  LayoutGrid,
  Zap,
  TrendingUp,
  CreditCard,
  History,
  Edit3,
  Trash2,
} from 'lucide-react';

export interface WalletTransactionsViewProps {
  transactions: any[];
  language?: string;
  onEdit: (tx: any) => void;
  onDelete: (tx: any) => void;
}

export function WalletTransactionsView({
  transactions,
  language,
  onEdit,
  onDelete,
}: WalletTransactionsViewProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [period, setPeriod] = useState<'current' | 'previous' | 'all'>('current');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const getTransactionDate = (tx: any): Date | null => {
    if (!tx?.date) return null;
    const date = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const monthBalance = transactions.reduce((acc: number, tx: any) => {
    const date = getTransactionDate(tx);
    if (!date || date.getMonth() !== currentMonth || date.getFullYear() !== currentYear) return acc;
    const value = Number(tx.value) || 0;
    return acc + (tx.type === 'out' ? -value : value);
  }, 0);

  const filteredTransactions = transactions.filter((tx: any) => {
    if (period === 'all') return true;
    const date = getTransactionDate(tx);
    if (!date) return false;
    if (period === 'current') {
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }
    return date.getMonth() === previousMonthDate.getMonth() && date.getFullYear() === previousMonthDate.getFullYear();
  });

  const getIcon = (cat: string) => {
    switch (cat) {
      case 'Moradia': return <LayoutGrid size={20} />;
      case 'Energia': return <Zap size={20} />;
      case 'Água': return <TrendingUp size={20} />;
      case 'Mercado': return <CreditCard size={20} />;
      default: return <History size={20} />;
    }
  };

  const getColor = (cat: string) => {
    switch (cat) {
      case 'Moradia': return 'var(--trend-down)';
      case 'Energia': return 'var(--accent)';
      case 'Água': return '#3498db';
      default: return 'var(--text-muted)';
    }
  };

  const periodOptions = [
    { id: 'current' as const, label: t('Mês Atual', 'Current Month') },
    { id: 'previous' as const, label: t('Mês Anterior', 'Previous Month') },
    { id: 'all' as const, label: t('Todos', 'All') },
  ];

  return (
    <div className="space-y-8 pb-32">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('Carteira', 'Wallet')}</h2>
          <p className="text-[var(--text-muted)] text-xs">{t('Gestão financeira completa', 'Complete financial management')}</p>
        </div>
      </header>

      {/* Card Saldo do Mês */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-[var(--accent)]/10 transition-colors" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em]">{t("Resumo Financeiro", "Financial Summary")}</span>
            <div className="flex items-center gap-3 mt-1">
              <h3 className="text-2xl font-medium text-[var(--text-primary)]">{t("Saldo do Mês", "Month Balance")}</h3>
            </div>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${monthBalance >= 0 ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'}`}>
            <TrendingUp size={24} />
          </div>
        </div>
        <p className={`text-4xl font-mono tracking-tighter ${monthBalance >= 0 ? 'text-[var(--accent)]' : 'text-[var(--trend-down)]'}`}>
          {monthBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
          {t("Entradas menos saídas do mês atual", "Income minus expenses for the current month")}
        </p>
      </section>

      {/* Histórico de Transações */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest">{t("Histórico de Transações", "Transaction History")}</h2>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">{filteredTransactions.length} {t("itens", "items")}</span>
          </div>
          <div className="flex gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl w-full sm:w-auto">
            {periodOptions.map(option => (
              <button
                key={option.id}
                onClick={() => setPeriod(option.id)}
                className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${period === option.id ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredTransactions.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-[var(--border-card)] rounded-[32px]">
              <History size={32} className="mx-auto text-[var(--text-muted)] mb-3 opacity-30" />
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                {t("Nenhuma transação neste período", "No transactions in this period")}
              </p>
            </div>
          ) : filteredTransactions.map((tx: any, idx: number) => {
            const isIncome = tx.type !== 'out';
            const value = Math.abs(Number(tx.value) || 0);
            const date = getTransactionDate(tx);

            return (
              <motion.div 
                key={`transaction-history-${tx.id}-${idx}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-between items-center p-4 bg-[var(--bg-card)] rounded-[24px] border border-[var(--border-card)] group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isIncome ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-[var(--trend-down)]/10'}`}
                    style={isIncome ? undefined : { color: getColor(tx.categoria_primaria) }}
                  >
                    {getIcon(tx.categoria_primaria)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{tx.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider">
                      {date ? date.toLocaleDateString('pt-BR') : t("Recente", "Recent")}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className={`text-base font-mono font-bold ${isIncome ? 'text-[var(--accent)]' : 'text-[var(--trend-down)]'}`}>
                      {isIncome ? '+' : '-'} {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <div className="flex gap-1 mt-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => onEdit(tx)}
                        className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors bg-white/5 rounded-lg sm:bg-transparent"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button 
                        onClick={() => onDelete(tx)}
                        className="p-2 text-[var(--text-muted)] hover:text-[var(--trend-down)] transition-colors bg-white/5 rounded-lg sm:bg-transparent"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Export default and alias for backwards compatibility
export default WalletTransactionsView;
export { WalletTransactionsView as DetalhesGastosPage };
