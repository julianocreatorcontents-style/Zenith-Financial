/**
 * Transferências entre contas.
 *
 * Regras puras para modelar uma transferência como um par de lançamentos
 * (saída na origem + entrada no destino) e agrupar esse par na apresentação
 * da carteira, sem alterar a matemática do ledger.
 */

import { parseTransactionAmount, parseTransactionDate } from './parsers';
import { isTransferTransaction, type TransactionInput } from './calculators';

export type TransferLegRole = 'out' | 'in';

export interface TransferLegInput extends TransactionInput {
  transferId?: string;
  transferRole?: TransferLegRole;
  counterpartAssetId?: string;
}

export interface TransferLegDraft {
  label: string;
  value: number;
  type: TransferLegRole;
  date: string;
  categoria_primaria: 'transferencia';
  assetId: string;
  counterpartAssetId: string;
  transferId: string;
  transferRole: TransferLegRole;
}

export interface TransferLegsParams {
  transferId: string;
  fromAsset: { id: string; name?: string };
  toAsset: { id: string; name?: string };
  value: number;
  date: string;
  label?: string;
}

export interface TransferGroup<T> {
  kind: 'transfer';
  key: string;
  transferId?: string;
  legs: T[];
  outLeg: T;
  inLeg: T;
  fromAssetId?: string;
  toAssetId?: string;
  value: number;
  date: Date | null;
  sortTime: number;
}

export interface SingleEntry<T> {
  kind: 'single';
  key: string;
  transaction: T;
  sortTime: number;
}

export type WalletEntry<T> = TransferGroup<T> | SingleEntry<T>;

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

export function createTransferId(): string {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveTransferRole(tx: TransferLegInput): TransferLegRole | undefined {
  if (tx.transferRole === 'out' || tx.transferRole === 'in') return tx.transferRole;
  const type = String(tx.type ?? '').toLowerCase().trim();
  if (type === 'out' || type === 'saida' || type === 'saída' || type === 'despesa' || type === 'debito') {
    return 'out';
  }
  if (type === 'in' || type === 'entrada' || type === 'receita' || type === 'credito') {
    return 'in';
  }
  return undefined;
}

export function buildTransferLegs(params: TransferLegsParams): [TransferLegDraft, TransferLegDraft] {
  const value = roundCurrency(Number(params.value));
  const label =
    params.label?.trim() ||
    `Transferência ${params.fromAsset.name || 'Origem'} → ${params.toAsset.name || 'Destino'}`;

  const base = {
    label,
    value,
    date: params.date,
    categoria_primaria: 'transferencia' as const,
    transferId: params.transferId,
  };

  return [
    {
      ...base,
      type: 'out',
      assetId: params.fromAsset.id,
      counterpartAssetId: params.toAsset.id,
      transferRole: 'out',
    },
    {
      ...base,
      type: 'in',
      assetId: params.toAsset.id,
      counterpartAssetId: params.fromAsset.id,
      transferRole: 'in',
    },
  ];
}

const getSortTime = (tx: TransferLegInput): number =>
  parseTransactionDate(tx.date ?? tx.createdAt)?.getTime() ?? 0;

const getDateKey = (tx: TransferLegInput): string => {
  const date = parseTransactionDate(tx.date ?? tx.createdAt);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

const getValue = (tx: TransferLegInput): number => roundCurrency(parseTransactionAmount(tx.value));

function buildTransferGroup<T extends TransferLegInput>(
  legs: T[],
  key: string,
  transferId?: string
): TransferGroup<T> | null {
  const outLeg = legs.find((leg) => resolveTransferRole(leg) === 'out');
  const inLeg = legs.find((leg) => resolveTransferRole(leg) === 'in');
  if (!outLeg || !inLeg) return null;

  const date = parseTransactionDate(outLeg.date ?? outLeg.createdAt) ?? null;
  return {
    kind: 'transfer',
    key,
    transferId,
    legs: [outLeg, inLeg],
    outLeg,
    inLeg,
    fromAssetId: outLeg.assetId,
    toAssetId: inLeg.assetId,
    value: getValue(outLeg) || getValue(inLeg),
    date,
    sortTime: Math.max(getSortTime(outLeg), getSortTime(inLeg)),
  };
}

/**
 * Localiza a contraparte inequívoca de uma perna de transferência legada (sem transferId).
 *
 * Regra de Unicidade:
 * Coleta todos os candidatos do papel oposto que possuam o mesmo valor, mesma data (YYYY-MM-DD)
 * e assetId diferente da perna de saída.
 * - Se candidates.length === 1: retorna o match inequívoco.
 * - Se candidates.length > 1: retorna null (ambíguo, impede agrupamento incorreto).
 * - Se candidates.length === 0: retorna null (sem contraparte).
 */
export function matchLegacyCounterpart<T extends TransferLegInput>(
  outLeg: T,
  inCandidates: T[],
  usedIn: Set<number>
): { leg: T; index: number } | null {
  const value = getValue(outLeg);
  const dateKey = getDateKey(outLeg);
  if (!dateKey) return null;

  const matches: Array<{ leg: T; index: number }> = [];

  for (let index = 0; index < inCandidates.length; index += 1) {
    if (usedIn.has(index)) continue;
    const candidate = inCandidates[index];
    if (getValue(candidate) !== value) continue;
    if (getDateKey(candidate) !== dateKey) continue;
    if (outLeg.assetId && candidate.assetId && outLeg.assetId === candidate.assetId) continue;
    matches.push({ leg: candidate, index });
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

/**
 * Agrupa as duas pernas de uma transferência em um único evento visual.
 *
 * Documentos com `transferId` são agrupados de forma determinística. Para
 * transferências legadas (sem `transferId`), agrupa apenas quando existe um
 * par inequívoco (saída + entrada, mesmo valor, mesma data e contas
 * diferentes). Qualquer leg sem par é mantido como lançamento individual,
 * evitando esconder dados.
 */
export function groupTransactionsForWallet<T extends TransferLegInput>(
  transactions: T[]
): WalletEntry<T>[] {
  const entries: WalletEntry<T>[] = [];
  const byTransferId = new Map<string, T[]>();
  const loose: T[] = [];

  for (const tx of transactions) {
    if (tx.transferId) {
      const group = byTransferId.get(tx.transferId);
      if (group) group.push(tx);
      else byTransferId.set(tx.transferId, [tx]);
    } else {
      loose.push(tx);
    }
  }

  for (const [transferId, legs] of byTransferId) {
    const group = buildTransferGroup(legs, `transfer:${transferId}`, transferId);
    if (group) {
      entries.push(group);
    } else {
      for (const leg of legs) {
        entries.push({
          kind: 'single',
          key: `single:${leg.id ?? `${transferId}:${entries.length}`}`,
          transaction: leg,
          sortTime: getSortTime(leg),
        });
      }
    }
  }

  const singles: T[] = [];
  const transferCandidates: T[] = [];

  for (const tx of loose) {
    if (isTransferTransaction(tx)) transferCandidates.push(tx);
    else singles.push(tx);
  }

  const outCandidates = transferCandidates.filter((tx) => resolveTransferRole(tx) === 'out');
  const inCandidates = transferCandidates.filter((tx) => resolveTransferRole(tx) === 'in');
  const usedIn = new Set<number>();
  const usedOut = new Set<T>();

  for (const outLeg of outCandidates) {
    if (usedOut.has(outLeg)) continue;
    const competingOuts = outCandidates.filter(
      (candidate) =>
        !usedOut.has(candidate) &&
        getValue(candidate) === getValue(outLeg) &&
        getDateKey(candidate) === getDateKey(outLeg)
    );
    if (competingOuts.length > 1) {
      continue;
    }

    const match = matchLegacyCounterpart(outLeg, inCandidates, usedIn);
    if (!match) continue;
    usedIn.add(match.index);
    usedOut.add(outLeg);
    const group = buildTransferGroup([outLeg, match.leg], `transfer:legacy:${outLeg.id ?? entries.length}`);
    if (group) entries.push(group);
    else singles.push(outLeg, match.leg);
  }

  for (const tx of outCandidates) {
    if (!usedOut.has(tx)) singles.push(tx);
  }
  for (let index = 0; index < inCandidates.length; index += 1) {
    if (!usedIn.has(index)) singles.push(inCandidates[index]);
  }

  for (const tx of singles) {
    entries.push({
      kind: 'single',
      key: `single:${tx.id ?? entries.length}`,
      transaction: tx,
      sortTime: getSortTime(tx),
    });
  }

  return entries.sort((a, b) => b.sortTime - a.sortTime);
}

/**
 * Retorna true se a data da transferência for estritamente anterior à data de referência (hoje),
 * comparando apenas o dia civil (ignorando hora).
 */
export function isRetroactiveTransferWithManualBalance(
  txDate: Date | string,
  today: Date = new Date()
): boolean {
  const d = parseTransactionDate(txDate);
  if (!d) return false;
  const txDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return txDay.getTime() < todayDay.getTime();
}
