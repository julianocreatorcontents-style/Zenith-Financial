import { motion } from 'motion/react';
import { ArrowRightLeft, Edit3, Trash2 } from 'lucide-react';
import type { Asset, Transaction } from '../../types/app';
import type { TransferGroup } from '../../lib/finance';

export interface TransferWalletRowProps {
  entry: TransferGroup<Transaction>;
  assets?: Asset[];
  language?: string;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

export function TransferWalletRow({
  entry,
  assets,
  language,
  onEdit,
  onDelete,
}: TransferWalletRowProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const assetName = (assetId?: string) =>
    assets?.find((asset) => asset.id === assetId)?.name ||
    entry.legs.find((leg) => leg.assetId === assetId)?.label ||
    t('Conta', 'Account');

  const fromName = assetName(entry.fromAssetId);
  const toName = assetName(entry.toAssetId);
  const valueLabel = entry.value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const dateLabel = entry.date
    ? entry.date.toLocaleDateString('pt-BR')
    : t('Recente', 'Recent');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-between items-center p-4 bg-[var(--bg-card)] rounded-[24px] border border-[var(--border-card)] group hover:border-[var(--accent)] transition-all"
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
          <ArrowRightLeft size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate min-w-0">
              {fromName} ↔ {toName}
            </p>
            {entry.legs.some((leg) => leg.applied === false) && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase tracking-wider shrink-0">
                {t('Agendado', 'Scheduled')}
              </span>
            )}
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--text-muted)]/10 text-[var(--text-muted)] font-bold uppercase tracking-wider shrink-0">
              {t('Transferência', 'Transfer')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider">
              {dateLabel}
            </p>
            <span className="text-[10px] text-[var(--text-muted)] opacity-40">•</span>
            <p className="text-[10px] text-[var(--text-muted)] font-medium">
              {t('Entre contas', 'Between accounts')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 shrink-0 pl-3">
        <div className="text-right">
          <p className="text-base font-mono font-bold text-[var(--text-muted)]">
            ↔ {valueLabel}
          </p>
          <div className="flex gap-1 mt-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(entry.outLeg)}
              aria-label={t('Editar transferência', 'Edit transfer')}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors bg-white/5 rounded-lg sm:bg-transparent"
            >
              <Edit3 size={16} />
            </button>
            <button
              onClick={() => onDelete(entry.outLeg)}
              aria-label={t('Excluir transferência', 'Delete transfer')}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--trend-down)] transition-colors bg-white/5 rounded-lg sm:bg-transparent active:scale-95"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default TransferWalletRow;