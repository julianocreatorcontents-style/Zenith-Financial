import {
  isExpenseTransaction,
  isIncomeTransaction,
  isTransferTransaction,
  isYieldTransaction,
  parseTransactionAmount,
  parseTransactionDate,
  type TransactionInput,
} from './finance';

export interface ReconciliableTransaction extends TransactionInput {
  status?: string;
  partialBalance?: number;
}

export interface RecalculatedBalance {
  id: string;
  partialBalance: number;
}

export interface TransferEffectAudit {
  assetId: string;
  incoming: number;
  outgoing: number;
  net: number;
  count: number;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function isAppliedTransaction(tx: ReconciliableTransaction): boolean {
  const status = String(tx.status ?? '').toLowerCase();
  return tx.applied !== false && status !== 'futuro' && status !== 'agendado';
}

export function recalculateTransactionPartialBalances(
  transactions: ReconciliableTransaction[]
): RecalculatedBalance[] {
  const sorted = transactions
    .filter((tx): tx is ReconciliableTransaction & { id: string } => Boolean(tx.id))
    .sort((a, b) => {
      const dateA = parseTransactionDate(a.date ?? a.createdAt)?.getTime() ?? 0;
      const dateB = parseTransactionDate(b.date ?? b.createdAt)?.getTime() ?? 0;
      if (dateA !== dateB) return dateA - dateB;
      return a.id.localeCompare(b.id);
    });

  let runningBalance = 0;
  return sorted.map((tx) => {
    const value = parseTransactionAmount(tx.value);

    if (isIncomeTransaction(tx) || isYieldTransaction(tx)) {
      runningBalance += value;
    } else if (isExpenseTransaction(tx)) {
      runningBalance -= value;
    }

    runningBalance = roundCurrency(runningBalance);
    return { id: tx.id, partialBalance: runningBalance };
  });
}

export function auditAppliedTransferEffects(
  transactions: ReconciliableTransaction[]
): TransferEffectAudit[] {
  const byAsset = new Map<string, TransferEffectAudit>();

  for (const tx of transactions) {
    if (!isTransferTransaction(tx) || !isAppliedTransaction(tx) || !tx.assetId) continue;

    const value = parseTransactionAmount(tx.value);
    const type = String(tx.type ?? '').toLowerCase().trim();
    const isOutgoing = ['out', 'saida', 'saída', 'despesa', 'debito'].includes(type);
    const current = byAsset.get(tx.assetId) ?? {
      assetId: tx.assetId,
      incoming: 0,
      outgoing: 0,
      net: 0,
      count: 0,
    };

    if (isOutgoing) {
      current.outgoing = roundCurrency(current.outgoing + value);
    } else {
      current.incoming = roundCurrency(current.incoming + value);
    }
    current.net = roundCurrency(current.incoming - current.outgoing);
    current.count += 1;
    byAsset.set(tx.assetId, current);
  }

  return [...byAsset.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
}
