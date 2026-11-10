import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Building2,
  Droplets,
  ShoppingBag,
  Car,
  Smile,
  Sparkles,
  Tag,
  History,
  Edit3,
  Trash2,
  ArrowLeftRight,
  Search,
  X,
  Plus,
} from 'lucide-react';
import {
  parseTransactionAmount,
  parseTransactionDate,
  isExpenseTransaction,
  isIncomeTransaction,
  isYieldTransaction,
  isTransferTransaction,
} from '../lib/finance';
import { parseAssetDate } from '../lib/adapters/assetYieldService';
import Card from '../components/ui/Card';
import type { Transaction, Asset } from '../types/app';

export interface WalletTransactionsViewProps {
  transactions: Transaction[];
  assets?: Asset[];
  language?: string;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onAddTransaction?: () => void;
}

export function WalletTransactionsView({
  transactions,
  assets,
  language,
  onEdit,
  onDelete,
  onAddTransaction,
}: WalletTransactionsViewProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [period, setPeriod] = useState<'current' | 'previous' | 'all'>('current');
  const [searchTerm, setSearchTerm] = useState('');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const getTransactionDate = (tx: Transaction): Date | null => {
    const raw = tx?.date ?? tx?.createdAt ?? (tx as unknown as Record<string, unknown>)?.timestamp ?? (tx as unknown as Record<string, unknown>)?.data;
    return parseTransactionDate(raw);
  };

  const getCategory = (tx: Transaction): string => {
    return tx.categoria_primaria || tx.category || 'Outros';
  };

  // Garante que todos os lançamentos reais e rendimentos diários dos ativos (ex: 8 e 9 de novembro)
  // estejam visíveis na Carteira mesmo antes de serem persistidos no banco
  const allTransactions = useMemo(() => {
    const list = [...transactions];
    if (!assets || assets.length === 0) return list;

    const today = new Date();
    // Verifica os últimos 7 dias para cobrir rendimentos recentes (incluindo 08/11 e 09/11)
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset, 12, 0, 0);
      const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      for (const asset of assets) {
        const isBusinessDays =
          (asset as unknown as { investmentPolicy?: { dayCountConvention?: string } })?.investmentPolicy?.dayCountConvention === 'BUSINESS_DAYS_252' ||
          (asset.name || '').toLowerCase().includes('mercado pago');
        if (isBusinessDays && isWeekend) continue;

        const daily = Number(asset.dailyYield ?? asset.manualDailyYield ?? 0);
        const weekend = Number(asset.manualWeekendYield ?? 0);
        const amount = isWeekend && weekend > 0 ? weekend : daily;
        if (amount <= 0) continue;

        const anchor =
          parseAssetDate(asset.manualBalanceDate) ??
          parseAssetDate(asset.investmentStartDate) ??
          parseAssetDate(asset.createdAt);
        if (anchor && d < new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) {
          continue;
        }

        const alreadyPresent = list.some((t) => {
          if (!isYieldTransaction(t)) return false;
          const tDate = getTransactionDate(t);
          if (!tDate) return false;
          const matchAsset =
            (t.assetId && t.assetId === asset.id) ||
            String(t.label || '').toLowerCase().includes(asset.name.toLowerCase());
          if (!matchAsset) return false;
          const tKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}-${String(tDate.getDate()).padStart(2, '0')}`;
          return tKey === dKey;
        });

        if (!alreadyPresent) {
          list.push({
            id: `yield-${asset.id}-${dKey}`,
            label: `Rendimento ${asset.name}`,
            value: Math.round(amount * 100) / 100,
            type: 'yield',
            categoria_primaria: 'Rendimentos',
            assetId: asset.id,
            applied: true,
            status: 'Confirmado',
            date: d,
            uid: asset.uid || '',
          });
        }
      }
    }

    list.sort((a, b) => {
      const da = getTransactionDate(a)?.getTime() || 0;
      const db = getTransactionDate(b)?.getTime() || 0;
      return db - da;
    });

    return list;
  }, [transactions, assets]);

  const periodFiltered = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (period === 'all') return true;
      const date = getTransactionDate(tx);
      if (!date) return false;
      if (period === 'current') {
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      }
      return (
        date.getMonth() === previousMonthDate.getMonth() &&
        date.getFullYear() === previousMonthDate.getFullYear()
      );
    });
  }, [allTransactions, period, currentMonth, currentYear, previousMonthDate]);

  const periodTotals = useMemo(() => {
    return periodFiltered.reduce(
      (acc, tx) => {
        const val = parseTransactionAmount(tx.value);
        if (isTransferTransaction(tx)) return acc;
        if (isExpenseTransaction(tx)) {
          acc.expenses += val;
        } else if (isIncomeTransaction(tx) || isYieldTransaction(tx)) {
          acc.income += val;
        }
        return acc;
      },
      { income: 0, expenses: 0 }
    );
  }, [periodFiltered]);

  const periodBalance = periodTotals.income - periodTotals.expenses;

  const filteredTransactions = useMemo(() => {
    if (!searchTerm.trim()) return periodFiltered;
    const term = searchTerm.toLowerCase().trim();
    return periodFiltered.filter((tx) => {
      const labelMatch = tx.label?.toLowerCase().includes(term);
      const catMatch = getCategory(tx).toLowerCase().includes(term);
      return labelMatch || catMatch;
    });
  }, [periodFiltered, searchTerm]);

  const getIcon = (cat: string) => {
    switch (cat) {
      case 'Moradia':
        return <Building2 size={20} />;
      case 'Energia':
        return <Zap size={20} />;
      case 'Água':
        return <Droplets size={20} />;
      case 'Alimentação':
      case 'Mercado':
        return <ShoppingBag size={20} />;
      case 'Transporte':
        return <Car size={20} />;
      case 'Lazer':
        return <Smile size={20} />;
      case 'Investimentos':
        return <TrendingUp size={20} />;
      case 'Rendimentos':
        return <Sparkles size={20} />;
      default:
        return <Tag size={20} />;
    }
  };

  const getColor = (cat: string) => {
    switch (cat) {
      case 'Moradia':
        return 'var(--trend-down)';
      case 'Energia':
        return 'var(--accent)';
      case 'Água':
        return '#3498db';
      case 'Alimentação':
      case 'Mercado':
        return '#f59e0b';
      case 'Transporte':
        return '#f97316';
      case 'Lazer':
        return '#a855f7';
      case 'Investimentos':
      case 'Rendimentos':
        return 'var(--accent)';
      default:
        return 'var(--text-muted)';
    }
  };

  const periodOptions = [
    { id: 'current' as const, label: t('Mês Atual', 'Current Month') },
    { id: 'previous' as const, label: t('Mês Anterior', 'Previous Month') },
    { id: 'all' as const, label: t('Todos', 'All') },
  ];

  const periodMetadata = {
    current: {
      title: t('Saldo do Mês', 'Month Balance'),
      subtitle: t('Entradas menos saídas do mês atual', 'Income minus expenses for the current month'),
    },
    previous: {
      title: t('Saldo do Mês Anterior', 'Previous Month Balance'),
      subtitle: t('Entradas menos saídas do mês anterior', 'Income minus expenses for the previous month'),
    },
    all: {
      title: t('Saldo Geral', 'Total Balance'),
      subtitle: t('Entradas menos saídas do histórico completo', 'Income minus expenses for complete history'),
    },
  }[period];

  return (
    <div className="space-y-8 pb-32">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('Carteira', 'Wallet')}</h2>
          <p className="text-[var(--text-muted)] text-xs">
            {t('Gestão financeira completa', 'Complete financial management')}
          </p>
        </div>
        {onAddTransaction && (
          <button
            onClick={onAddTransaction}
            className="flex items-center gap-2 px-3.5 py-2 bg-[var(--accent)] text-[var(--bg-app)] font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">{t('Nova Transação', 'New Transaction')}</span>
          </button>
        )}
      </header>

      {/* Card Saldo do Período */}
      <Card as="section" className="relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-[var(--accent)]/10 transition-colors" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em]">
              {t('Resumo Financeiro', 'Financial Summary')}
            </span>
            <div className="flex items-center gap-3 mt-1">
              <h3 className="text-2xl font-medium text-[var(--text-primary)]">
                {periodMetadata.title}
              </h3>
            </div>
          </div>
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              periodBalance >= 0
                ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'
            }`}
          >
            {periodBalance >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
          </div>
        </div>
        <p
          className={`text-4xl font-mono tracking-tighter ${
            periodBalance >= 0 ? 'text-[var(--accent)]' : 'text-[var(--trend-down)]'
          }`}
        >
          {periodBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
          {periodMetadata.subtitle}
        </p>

        {/* Detalhamento de Entradas e Saídas do Período */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[var(--border-card)]">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              {t('Entradas', 'Income')}
            </span>
            <span className="text-sm font-mono font-bold text-[var(--accent)]">
              +{periodTotals.income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              {t('Saídas', 'Expenses')}
            </span>
            <span className="text-sm font-mono font-bold text-[var(--trend-down)]">
              -{periodTotals.expenses.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>
      </Card>

      {/* Histórico de Transações */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest">
              {t('Histórico de Transações', 'Transaction History')}
            </h2>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {filteredTransactions.length} {t('itens', 'items')}
            </span>
          </div>
          <div className="flex gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl w-full sm:w-auto">
            {periodOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setPeriod(option.id)}
                className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  period === option.id
                    ? 'bg-[var(--accent)] text-[var(--bg-app)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Barra de Busca Rápida */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('Buscar por descrição ou categoria...', 'Search by description or category...')}
            className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl pl-11 pr-10 py-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label={t('Limpar busca', 'Clear search')}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="space-y-3">
          {filteredTransactions.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-[var(--border-card)] rounded-[32px] p-6">
              <History size={32} className="mx-auto text-[var(--text-muted)] mb-3 opacity-30" />
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3">
                {searchTerm
                  ? t('Nenhuma transação encontrada para a busca', 'No transactions found for this search')
                  : t('Nenhuma transação neste período', 'No transactions in this period')}
              </p>
              {searchTerm ? (
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-xs font-bold text-[var(--accent)] hover:underline"
                >
                  {t('Limpar filtros', 'Clear filters')}
                </button>
              ) : onAddTransaction ? (
                <button
                  onClick={onAddTransaction}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  <Plus size={14} />
                  {t('Adicionar Transação', 'Add Transaction')}
                </button>
              ) : null}
            </div>
          ) : (
            filteredTransactions.map((tx, idx) => {
              const isTransfer = isTransferTransaction(tx);
              const isIncome = !isTransfer && !isExpenseTransaction(tx);
              const isYield = isYieldTransaction(tx);
              const value = parseTransactionAmount(tx.value);
              const date = getTransactionDate(tx);
              const category = getCategory(tx);

              return (
                <motion.div
                  key={`transaction-history-${tx.id}-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-between items-center p-4 bg-[var(--bg-card)] rounded-[24px] border border-[var(--border-card)] group hover:border-[var(--accent)] transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        isTransfer
                          ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                          : isIncome
                          ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'bg-[var(--trend-down)]/10'
                      }`}
                      style={isTransfer || isIncome ? undefined : { color: getColor(category) }}
                    >
                      {isTransfer ? (
                        <ArrowLeftRight size={20} />
                      ) : (
                        getIcon(category)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[150px] sm:max-w-xs">
                          {tx.label}
                        </p>
                        {tx.applied === false && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase tracking-wider shrink-0">
                            {t('Agendado', 'Scheduled')}
                          </span>
                        )}
                        {isTransfer && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--text-muted)]/10 text-[var(--text-muted)] font-bold uppercase tracking-wider shrink-0">
                            {t('Transferência', 'Transfer')}
                          </span>
                        )}
                        {isYield && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-wider shrink-0">
                            {t('Rendimento', 'Yield')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider">
                          {date ? date.toLocaleDateString('pt-BR') : t('Recente', 'Recent')}
                        </p>
                        <span className="text-[10px] text-[var(--text-muted)] opacity-40">•</span>
                        <p className="text-[10px] text-[var(--text-muted)] font-medium">
                          {category}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 pl-3">
                    <div className="text-right">
                      <p
                        className={`text-base font-mono font-bold ${
                          isTransfer
                            ? 'text-[var(--text-muted)]'
                            : isIncome
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--trend-down)]'
                        }`}
                      >
                        {isTransfer ? '↔' : isIncome ? '+' : '-'} {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <div className="flex gap-1 mt-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onEdit(tx)}
                          aria-label={t('Editar transação', 'Edit transaction')}
                          className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors bg-white/5 rounded-lg sm:bg-transparent"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => onDelete(tx)}
                          aria-label={t('Excluir transação', 'Delete transaction')}
                          className="p-2 text-[var(--text-muted)] hover:text-[var(--trend-down)] transition-colors bg-white/5 rounded-lg sm:bg-transparent"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Export default and alias for backwards compatibility
export default WalletTransactionsView;
export { WalletTransactionsView as DetalhesGastosPage };
