import { useState, useEffect, useCallback } from 'react';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  handleFirestoreError,
  OperationType,
  doc,
  writeBatch,
  serverTimestamp,
  getDocs,
} from '../firebase';
import { Timestamp, WriteBatch } from 'firebase/firestore';
import { Preferences } from '@capacitor/preferences';
import { z } from 'zod';
import {
  parseTransactionDate,
  parseTransactionAmount,
  calculatePartialBalances,
  isExpenseTransaction,
  isIncomeTransaction,
  isYieldTransaction,
  isTransferTransaction,
  buildTransferLegs,
  createTransferId,
  resolveTransferRole,
  matchLegacyCounterpart,
} from '../lib/finance';
import { calculateAssetBalanceUpdate, calculateTransferBalanceUpdate } from '../lib/adapters/assetBalance';
import { parseAssetDate } from '../lib/adapters/assetYieldService';
import { mapSpreadsheetRow } from '../lib/spreadsheetParser';
import { extractDocument, getAiErrorMessage, GEMINI_API_KEY_STORAGE } from '../lib/ai';
import {
  TransactionSchema,
  ValidationError,
  assertValidTransactionPayloads,
  validateTransactionForWrite,
  validateTransactionImportRow,
  getTransactionIssues,
} from '../lib/validations';
import { useTransactionsCron } from './useTransactionsCron';
import type { Asset, Transaction } from '../types/app';
import type { ZenithUser } from './useZenithData';

export type AssetDeltaMap = Map<string, number>;

/**
 * Sprint 4a — R5 (decisão A): issues de integridade de um doc que vai ser restaurado.
 *
 * Retorna `null` quando não há nada a avisar:
 * - coleção diferente de `transactions` (não há schema de conteúdo para ela aqui);
 * - doc em conformidade com o TransactionSchema.
 *
 * Nunca lança e nunca bloqueia: `restoreFromTrash` é recuperação, não criação.
 */
export function getRestoreIntegrityIssues(
  originalCollection: string | undefined,
  data: Record<string, unknown> | undefined
): { path: (string | number | symbol)[]; message: string }[] | null {
  if (originalCollection !== 'transactions' || !data) return null;
  return getTransactionIssues(data);
}

/** Sprint 3 — T1 (B1): limite de writes por batch do Firestore. */
export const BALANCE_BATCH_CHUNK_SIZE = 500;

export interface ChunkCommitResult {
  ok: boolean;
  totalChunks: number;
  appliedChunks: number[];
  failedChunk: number | null;
  error?: unknown;
}

export interface ChunkCommitOptions<T> {
  chunkSize?: number;
  /** Tentativas extras após a primeira falha de um lote. Default: 1. */
  retries?: number;
  /**
   * Aplica um lote. Precisa ser re-executável com o mesmo slice (idempotente),
   * pois pode ser chamado mais de uma vez em caso de falha.
   */
  apply: (slice: T[], chunkIndex: number) => Promise<void>;
  onChunkCommitted?: (chunkIndex: number, totalChunks: number, size: number) => void;
}

/**
 * Sprint 3 — T1 (B1): divide os updates em lotes independentes de até `chunkSize`
 * e commita sequencialmente, com retry por lote.
 *
 * Semântica de falha (decisão A): lotes anteriores permanecem aplicados; o lote que
 * falhou e os seguintes ficam pendentes. Como `apply` é idempotente, re-executar o
 * recálculo inteiro converge para o estado correto.
 *
 * @returns estado final com a lista de lotes aplicados (para diagnóstico).
 */
export async function commitInChunks<T>(
  items: T[],
  options: ChunkCommitOptions<T>
): Promise<ChunkCommitResult> {
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? BALANCE_BATCH_CHUNK_SIZE));
  const retries = Math.max(0, Math.floor(options.retries ?? 1));
  const totalChunks = Math.ceil(items.length / chunkSize);
  const appliedChunks: number[] = [];

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const slice = items.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
    let lastError: unknown;
    let applied = false;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await options.apply(slice, chunkIndex);
        applied = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!applied) {
      return { ok: false, totalChunks, appliedChunks, failedChunk: chunkIndex, error: lastError };
    }

    appliedChunks.push(chunkIndex);
    options.onChunkCommitted?.(chunkIndex, totalChunks, slice.length);
  }

  return { ok: true, totalChunks, appliedChunks, failedChunk: null };
}

export type BalanceRecalculationResult = ChunkCommitResult;


export function addAssetDelta(deltas: AssetDeltaMap, assetId: string | undefined, delta: number) {
  if (!assetId || !Number.isFinite(delta) || delta === 0) return;
  deltas.set(assetId, (deltas.get(assetId) ?? 0) + delta);
}

export function applyAssetDeltas(
  batch: WriteBatch,
  deltas: AssetDeltaMap,
  assets: Asset[]
) {
  for (const [assetId, delta] of deltas) {
    if (delta === 0) continue;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;
    const update = calculateAssetBalanceUpdate(asset, Math.abs(delta), delta > 0);
    batch.update(doc(db, 'assets', assetId), {
      ...update,
      updatedAt: serverTimestamp(),
    });
  }
}

export interface UseTransactionsDataProps {
  user: ZenithUser | null;
  rawAssets: Asset[];
  setError?: (msg: string | null) => void;
}

const localDateKey = (tx: Transaction): string => {
  const date = parseTransactionDate(tx.date ?? tx.createdAt);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

/**
 * Localiza a outra perna de uma transferência. Usa `transferId` quando
 * disponível e, para dados legados, exige um par inequívoco (mesmo valor,
 * mesma data, contas diferentes e papéis opostos).
 */
export function findTransferCounterpart(
  item: Transaction,
  transactions: Transaction[]
): Transaction | undefined {
  if (!isTransferTransaction(item)) return undefined;

  if (item.transferId) {
    return transactions.find(
      (tx) => tx.id !== item.id && tx.transferId === item.transferId
    );
  }

  const role = resolveTransferRole(item);
  if (!role) return undefined;
  const opposite = role === 'out' ? 'in' : 'out';
  const value = Math.round(parseTransactionAmount(item.value) * 100) / 100;
  const dateKey = localDateKey(item);

  return transactions.find((tx) => {
    if (tx.id === item.id || !isTransferTransaction(tx)) return false;
    if (resolveTransferRole(tx) !== opposite) return false;
    if (item.assetId && tx.assetId === item.assetId) return false;
    if (Math.round(parseTransactionAmount(tx.value) * 100) / 100 !== value) return false;
    return !dateKey || localDateKey(tx) === dateKey;
  });
}

/** Efeito de reversão (-1) ou reaplicação (+1) de uma perna no saldo do ativo. */
export function transferAssetDelta(tx: Transaction, direction: 1 | -1): number {
  const value = parseTransactionAmount(tx.value);
  if (!Number.isFinite(value) || value === 0) return 0;
  const role = resolveTransferRole(tx);
  if (role !== 'out' && role !== 'in') return 0;
  return role === 'out' ? -value * direction : value * direction;
}

export function useTransactionsData({ user, rawAssets, setError }: UseTransactionsDataProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingTransaction, setPendingTransaction] = useState<unknown>(null);
  const [isProcessingIA, setIsProcessingIA] = useState(false);

  // Listener de Transações
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(collection(db, 'transactions'), where('uid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));

        docs.sort((a, b) => {
          const da = parseTransactionDate(a.date || a.createdAt)?.getTime() || 0;
          const db = parseTransactionDate(b.date || b.createdAt)?.getTime() || 0;
          return db - da;
        });
        setTransactions(docs);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'transactions')
    );
    return unsub;
  }, [user]);

  /**
   * Sprint 3 — T1 (B1): Recálculo resiliente a histórico >500 transações.
   *
   * Decisão (A) — Chunking idempotente:
   *   1. Calcula TODOS os novos partialBalance em memória (puro, determinístico).
   *   2. Fatia em lotes de até BALANCE_BATCH_CHUNK_SIZE (500) e commita sequencialmente.
   *   3. Cada lote é independente e re-executável → idempotente por design.
   *   4. Retry interno de 1x por lote. Falha total devolve a lista de lotes aplicados.
   *
   * Não-regressão de atomicidade: a escrita da transação e o recálculo já eram
   * batches SEPARADOS antes deste sprint (a transação é commitada e só depois
   * recalculateBalances é chamado). O chunking não quebra nenhuma atomicidade
   * existente — apenas divide o recálculo.
   *
   * A assinatura de chamada (`(userId) => Promise<...>`) permanece compatível;
   * o retorno passa a carregar o estado da operação para diagnóstico.
   */
  const recalculateBalances = useCallback(
    async (userId: string): Promise<BalanceRecalculationResult> => {
      try {
        const q = query(
          collection(db, 'transactions'),
          where('uid', '==', userId),
          orderBy('date', 'asc')
        );
        const snap = await getDocs(q);
        const docs = snap.docs;
        const txsForCalc = docs.map((d) => d.data() as Transaction);

        // T2.5 — decisão registrada: doc legado inválido NÃO bloqueia o recálculo.
        // Aviso agregado (sem dados sensíveis) para diagnóstico.
        const legacyIssues = txsForCalc.reduce(
          (count, tx) => count + (getTransactionIssues(tx) ? 1 : 0),
          0
        );
        if (legacyIssues > 0) {
          console.warn(
            `[recalculateBalances] ${legacyIssues} doc(s) fora do TransactionSchema ` +
            `aceito(s) com warning (histórico legado não é migrado).`
          );
        }

        // Fase 1 — Cálculo puro em memória (idempotente, sem I/O)
        const balances = calculatePartialBalances(txsForCalc);
        const updates = docs.map((d, index) => ({
          ref: d.ref,
          partialBalance: balances[index],
        }));

        // Fase 2 — Commits em chunks de até BALANCE_BATCH_CHUNK_SIZE
        const result = await commitInChunks(updates, {
          chunkSize: BALANCE_BATCH_CHUNK_SIZE,
          retries: 1,
          apply: async (slice) => {
            const batch = writeBatch(db);
            slice.forEach(({ ref, partialBalance }) => {
              batch.update(ref, { partialBalance });
            });
            await batch.commit();
          },
          onChunkCommitted: (chunkIndex, totalChunks, size) => {
            console.log(
              `[recalculateBalances] chunk ${chunkIndex + 1}/${totalChunks} aplicado (${size} docs)`
            );
          },
        });

        if (!result.ok) {
          console.error(
            `[recalculateBalances] falha no chunk ${(result.failedChunk ?? 0) + 1}/${result.totalChunks}. ` +
            `Chunks aplicados: [${result.appliedChunks.join(', ')}]. ` +
            `Chunks pendentes: ${result.failedChunk}..${result.totalChunks - 1}.`
          );
          handleFirestoreError(result.error, OperationType.WRITE, 'recalculate_balances');
        }

        return result;
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'recalculate_balances');
        return {
          ok: false,
          totalChunks: 0,
          appliedChunks: [],
          failedChunk: null,
          error: e,
        };
      }
    },
    []
  );

  // Adapter para o cron, que declara a dependência como `(userId) => Promise<void>`.
  const recalculateBalancesForCron = useCallback(
    async (userId: string): Promise<void> => {
      await recalculateBalances(userId);
    },
    [recalculateBalances]
  );

  // CRON: Aplicação de Transações Agendadas / Pendentes e Rendimentos Diários
  useTransactionsCron(user, rawAssets, transactions, recalculateBalancesForCron);

  // Mover para lixeira com reversão atômica de saldo
  const moveToTrash = useCallback(
    async (item: any, collectionName: string) => {
      try {
        if (!user) return;

        const counterpart =
          collectionName === 'transactions'
            ? findTransferCounterpart(item as Transaction, transactions)
            : undefined;
        const items: any[] = counterpart ? [item, counterpart] : [item];

        const deltas: AssetDeltaMap = new Map();
        for (const entry of items) {
          if (collectionName !== 'transactions') continue;
          const wasApplied = entry.applied !== false && entry.status !== 'Futuro';
          if (!wasApplied || !entry.assetId) continue;

          if (isTransferTransaction(entry)) {
            addAssetDelta(deltas, entry.assetId, transferAssetDelta(entry as Transaction, -1));
          } else {
            const amount = parseTransactionAmount(entry.value);
            const isOut = isExpenseTransaction(entry);
            addAssetDelta(deltas, entry.assetId, isOut ? amount : -amount);
          }
        }

        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        for (const entry of items) {
          batch.set(doc(collection(db, 'trash')), {
            originalId: entry.id,
            originalCollection: collectionName,
            data: entry,
            deletedAt: serverTimestamp(),
            uid: user.uid,
          });
          batch.delete(doc(db, collectionName, entry.id));
        }
        await batch.commit();

        if (collectionName === 'transactions') {
          console.log('[Firestore] Transação(ões) movida(s) para a lixeira:', {
            ids: items.map((entry) => entry.id),
            transfer: items.length > 1,
          });
          await recalculateBalances(user.uid);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${item.id}`);
      }
    },
    [user, rawAssets, recalculateBalances, transactions, setError]
  );

  /**
   * Sprint 4a — R5 (decisão A): restauração NÃO revalida/bloqueia.
   *
   * `moveToTrash` não recebe payload novo — apenas move o doc existente — logo não há
   * o que validar por design. `restoreFromTrash` é operação de recuperação: um doc
   * legado inválido deve voltar como estava. O único efeito é um aviso de diagnóstico.
   */
  const restoreFromTrash = useCallback(
    async (item: any) => {
      if (!user || !item?.originalCollection || !item?.originalId) return;
      try {
        const data = item.data || {};
        const items: any[] = [item];

        // Restaura as duas pernas de uma transferência em conjunto:
        // Se possui transferId, busca o irmão com o mesmo transferId.
        // Se legado (sem transferId), busca contraparte inequívoca na lixeira via matchLegacyCounterpart.
        if (
          item.originalCollection === 'transactions' &&
          isTransferTransaction(data)
        ) {
          const trashSnap = await getDocs(
            query(collection(db, 'trash'), where('uid', '==', user.uid))
          );
          if (data.transferId) {
            for (const trashDoc of trashSnap.docs) {
              if (trashDoc.id === item.id) continue;
              const candidate = trashDoc.data() as {
                originalCollection?: string;
                data?: { transferId?: string };
              };
              if (
                candidate.originalCollection === 'transactions' &&
                candidate.data?.transferId === data.transferId
              ) {
                items.push({ id: trashDoc.id, ...candidate });
              }
            }
          } else {
            // D3: Legado sem transferId - busca contraparte inequívoca na lixeira
            const role = resolveTransferRole(data);
            const counterpartRole = role === 'out' ? 'in' : role === 'in' ? 'out' : null;
            const candidates: Array<{ id: string; originalCollection: string; originalId: string; data: any }> = [];

            for (const trashDoc of trashSnap.docs) {
              if (trashDoc.id === item.id) continue;
              const c = trashDoc.data() as any;
              if (c.originalCollection === 'transactions' && isTransferTransaction(c.data) && !c.data?.transferId) {
                if (!counterpartRole || resolveTransferRole(c.data) === counterpartRole) {
                  candidates.push({ id: trashDoc.id, ...c });
                }
              }
            }

            const match = matchLegacyCounterpart(
              data,
              candidates.map((c) => c.data),
              new Set<number>()
            );

            if (match) {
              const matchedCandidate = candidates[match.index];
              const generatedTransferId = createTransferId();
              data.transferId = generatedTransferId;
              data.transferRole = role || 'out';
              if (matchedCandidate.data.assetId) {
                data.counterpartAssetId = matchedCandidate.data.assetId;
              }

              matchedCandidate.data.transferId = generatedTransferId;
              matchedCandidate.data.transferRole = counterpartRole || (role === 'out' ? 'in' : 'out');
              if (data.assetId) {
                matchedCandidate.data.counterpartAssetId = data.assetId;
              }

              items.push(matchedCandidate);
            } else {
              console.warn(`[RESTORE] par legado ambíguo ou ausente: ${item.id}`);
            }
          }
        }

        const deltas: AssetDeltaMap = new Map();
        for (const entry of items) {
          if (entry.originalCollection !== 'transactions') continue;
          const entryData = entry.data || {};
          const wasApplied = entryData.applied !== false && entryData.status !== 'Futuro';
          if (!wasApplied || !entryData.assetId) continue;

          if (isTransferTransaction(entryData)) {
            addAssetDelta(
              deltas,
              entryData.assetId,
              transferAssetDelta(entryData as Transaction, 1)
            );
          } else {
            const amount = Number(entryData.value) || 0;
            const isOut = isExpenseTransaction(entryData);
            addAssetDelta(deltas, entryData.assetId, isOut ? -amount : amount);
          }
        }

        // R5 (decisão A): diagnóstico, nunca bloqueio. Doc legado volta como estava.
        for (const entry of items) {
          const issues = getRestoreIntegrityIssues(entry.originalCollection, entry.data);
          if (issues) {
            console.warn(
              `[RESTORE] doc fora do TransactionSchema restaurado como estava ` +
              `(decisão R5-A): ${entry.originalId} — ${issues.length} issue(s).`
            );
          }
        }

        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        for (const entry of items) {
          const entryData = entry.data || {};
          const { id: _id, ref: _ref, ...restoredData } = entryData;
          batch.set(doc(db, entry.originalCollection, entry.originalId), restoredData);
          batch.delete(doc(db, 'trash', entry.id));
        }
        await batch.commit();

        if (item.originalCollection === 'transactions') {
          await recalculateBalances(user.uid);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `trash/${item.id}`);
      }
    },
    [user, rawAssets, recalculateBalances]
  );

  // Operações de CRUD de Transações
  const addTransaction = useCallback(
    async (data: Partial<Transaction>) => {
      if (!user) return;
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const txDate = parseTransactionDate(data.date) || now;
      const isFuture = txDate.getTime() > endOfToday.getTime();
      const applied = !isFuture;

      const newTxRef = doc(collection(db, 'transactions'));
      const txData = {
        ...data,
        uid: user.uid,
        applied,
        status: isFuture ? 'Futuro' : 'Confirmado',
        date: data.date ? Timestamp.fromDate(txDate) : serverTimestamp(),
      };

      // Sprint 3 — T2 (A): Validação obrigatória antes do write
      try {
        validateTransactionForWrite({
          ...data,
          uid: user.uid,
          applied,
          status: isFuture ? 'Futuro' : 'Confirmado',
          date: txDate,
          value: Number(data.value),
        });
      } catch (e) {
        if (e instanceof ValidationError) {
          setError?.(e.message);
          return;
        }
        throw e;
      }

      const deltas: AssetDeltaMap = new Map();
      if (applied && data.assetId && !isTransferTransaction(data as Transaction)) {
        const amount = Number(data.value) || 0;
        const isOut = isExpenseTransaction(data as Transaction);
        addAssetDelta(deltas, data.assetId, isOut ? -amount : amount);
      }

      try {
        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        batch.set(newTxRef, txData);
        await batch.commit();
        console.log('[Firestore] Transação criada:', { id: newTxRef.id, ...txData });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'transactions');
        return;
      }

      await recalculateBalances(user.uid);
      return { id: newTxRef.id };
    },
    [user, rawAssets, recalculateBalances, setError]
  );

  /**
   * Cria uma transferência como um par de lançamentos em um único batch:
   * saída na origem + entrada no destino, com o mesmo `transferId`, e
   * movimentação dos saldos das duas contas atomicamente.
   */
  const addTransfer = useCallback(
    async (params: {
      fromAsset: Asset;
      toAsset: Asset;
      value: number;
      date?: string;
      label?: string;
      transferId?: string;
    }) => {
      if (!user) return;
      const { fromAsset, toAsset, date, label } = params;

      if (fromAsset.id === toAsset.id) {
        throw new Error('A conta de origem e a de destino são a mesma.');
      }
      const value = Math.round(Number(params.value) * 100) / 100;
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('O valor da transferência deve ser maior que zero.');
      }

      const transferId = params.transferId || createTransferId();
      const dateStr = date || new Date().toISOString().split('T')[0];
      const txDate = parseTransactionDate(dateStr) || new Date();
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const isFuture = txDate.getTime() > endOfToday.getTime();

      const [outLeg, inLeg] = buildTransferLegs({
        transferId,
        fromAsset,
        toAsset,
        value,
        date: dateStr,
        label,
      });

      const outRef = doc(collection(db, 'transactions'));
      const inRef = doc(collection(db, 'transactions'));

      // Sprint 3 — T2 (A): valida as duas pernas antes do write.
      // (A lógica de transferência do Plano C não foi alterada; apenas a validação foi adicionada.)
      const legWrites = [
        { ref: outRef, leg: outLeg },
        { ref: inRef, leg: inLeg },
      ].map(({ ref, leg }) => ({
        ref,
        payload: {
          ...leg,
          uid: user.uid,
          applied: !isFuture,
          status: isFuture ? 'Futuro' : 'Confirmado',
          date: Timestamp.fromDate(txDate),
        },
      }));

      legWrites.forEach(({ payload }) => {
        validateTransactionForWrite(payload);
      });

      try {
        const batch = writeBatch(db);
        legWrites.forEach(({ ref, payload }) => {
          batch.set(ref, payload);
        });

        if (!isFuture) {
          const fromUpdate = calculateTransferBalanceUpdate(fromAsset, value, false);
          const toUpdate = calculateTransferBalanceUpdate(toAsset, value, true);
          batch.update(doc(db, 'assets', fromAsset.id), {
            ...fromUpdate,
            updatedAt: serverTimestamp(),
          });
          batch.update(doc(db, 'assets', toAsset.id), {
            ...toUpdate,
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        console.log('[Firestore] Transferência criada:', {
          transferId,
          outId: outRef.id,
          inId: inRef.id,
          value,
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'transactions');
        throw e;
      }

      await recalculateBalances(user.uid);
      return { transferId, outId: outRef.id, inId: inRef.id };
    },
    [user, recalculateBalances]
  );

  const updateTransaction = useCallback(
    async (selectedTx: Transaction, data: Partial<Transaction>) => {
      if (!user) return;

      const counterpart = findTransferCounterpart(selectedTx, transactions);
      if (counterpart) {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const dateSource = data.date !== undefined ? data.date : selectedTx.date;
        const txDate = parseTransactionDate(dateSource) || now;
        const isFuture = txDate.getTime() > endOfToday.getTime();
        const applied = !isFuture;

        const oldValue = parseTransactionAmount(selectedTx.value);
        const newValue = data.value !== undefined ? parseTransactionAmount(data.value) : oldValue;
        const label = data.label ?? selectedTx.label;
        const transferId = selectedTx.transferId || counterpart.transferId || createTransferId();

        const outLeg = resolveTransferRole(selectedTx) === 'out' ? selectedTx : counterpart;
        const inLeg = outLeg.id === selectedTx.id ? counterpart : selectedTx;
        const selectedIsOut = outLeg.id === selectedTx.id;
        const outAssetId =
          selectedIsOut && data.assetId ? data.assetId : outLeg.assetId;
        const inAssetId =
          !selectedIsOut && data.assetId ? data.assetId : inLeg.assetId;

        const wasApplied = selectedTx.applied !== false && selectedTx.status !== 'Futuro';
        const deltas: AssetDeltaMap = new Map();
        const addMovement = (
          role: 'out' | 'in' | undefined,
          assetId: string | undefined,
          amount: number,
          direction: 1 | -1
        ) => {
          if (!assetId || !Number.isFinite(amount) || amount === 0) return;
          const movement = role === 'out' ? -amount : amount;
          addAssetDelta(deltas, assetId, movement * direction);
        };

        if (wasApplied) {
          addMovement(
            resolveTransferRole(outLeg),
            outLeg.assetId,
            parseTransactionAmount(outLeg.value),
            -1
          );
          addMovement(
            resolveTransferRole(inLeg),
            inLeg.assetId,
            parseTransactionAmount(inLeg.value),
            -1
          );
        }
        if (applied) {
          addMovement('out', outAssetId, newValue, 1);
          addMovement('in', inAssetId, newValue, 1);
        }

        const baseData = {
          uid: user.uid,
          label,
          value: newValue,
          categoria_primaria: 'transferencia',
          applied,
          status: isFuture ? 'Futuro' : 'Confirmado',
          date: Timestamp.fromDate(txDate),
          transferId,
        };

        const outPayload = {
          ...baseData,
          type: 'out',
          transferRole: 'out',
          assetId: outAssetId,
          counterpartAssetId: inAssetId,
        };
        const inPayload = {
          ...baseData,
          type: 'in',
          transferRole: 'in',
          assetId: inAssetId,
          counterpartAssetId: outAssetId,
        };

        // Sprint 4a — R4: validação atômica do par ANTES do batch.
        // Se uma perna falhar, a operação inteira é rejeitada (nenhuma perna muda).
        try {
          assertValidTransactionPayloads([outPayload, inPayload]);
        } catch (e) {
          if (e instanceof ValidationError) {
            setError?.(e.message);
            return;
          }
          throw e;
        }

        try {
          const batch = writeBatch(db);
          applyAssetDeltas(batch, deltas, rawAssets);
          batch.update(doc(db, 'transactions', outLeg.id), outPayload);
          batch.update(doc(db, 'transactions', inLeg.id), inPayload);
          await batch.commit();
          console.log('[Firestore] Transferência atualizada atomicamente:', {
            transferId,
            outId: outLeg.id,
            inId: inLeg.id,
            newValue,
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `transactions/${selectedTx.id}`);
          return;
        }

        await recalculateBalances(user.uid);
        return;
      }

      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const txDate = parseTransactionDate(data.date) || now;
      const isFuture = txDate.getTime() > endOfToday.getTime();
      const applied = !isFuture;

      // Sprint 3 — T2 (A): Validação obrigatória antes do write em updateTransaction
      try {
        validateTransactionForWrite({
          ...selectedTx,
          ...data,
          uid: user.uid,
          applied,
          status: isFuture ? 'Futuro' : 'Confirmado',
          date: txDate,
          value: Number(data.value ?? selectedTx.value),
        });
      } catch (e) {
        if (e instanceof ValidationError) {
          setError?.(e.message);
          return;
        }
        throw e;
      }

      const txRef = doc(db, 'transactions', selectedTx.id);
      const txData = {
        ...data,
        uid: user.uid,
        applied,
        status: isFuture ? 'Futuro' : 'Confirmado',
        date: data.date ? Timestamp.fromDate(txDate) : serverTimestamp(),
      };

      const deltas: AssetDeltaMap = new Map();
      if (selectedTx.applied && selectedTx.assetId && !isTransferTransaction(selectedTx)) {
        const oldAmount = parseTransactionAmount(selectedTx.value);
        const wasOut = isExpenseTransaction(selectedTx);
        addAssetDelta(deltas, selectedTx.assetId, wasOut ? oldAmount : -oldAmount);
      }
      if (applied && data.assetId && !isTransferTransaction(data as Transaction)) {
        const newAmount = parseTransactionAmount(data.value);
        const isOut = isExpenseTransaction(data as Transaction);
        addAssetDelta(deltas, data.assetId, isOut ? -newAmount : newAmount);
      }

      const shouldSaveRule = selectedTx.categoria_primaria !== data.categoria_primaria;
      const ruleRef = shouldSaveRule ? doc(collection(db, 'user_rules')) : null;

      try {
        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        batch.update(txRef, txData);
        if (ruleRef) {
          batch.set(ruleRef, {
            uid: user.uid,
            pattern: selectedTx.label,
            category: data.categoria_primaria,
            createdAt: serverTimestamp(),
          });
        }
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `transactions/${selectedTx.id}`);
        return;
      }

      await recalculateBalances(user.uid);
    },
    [user, rawAssets, recalculateBalances, transactions, setError]
  );

  const confirmPendingTransaction = useCallback(
    async (updatedTx?: Record<string, unknown>) => {
      const dataToSave = (updatedTx || pendingTransaction) as Record<string, unknown> | null;
      if (!dataToSave || !user) return;
      try {
        const now = new Date();
        const parsedDate = parseTransactionDate(dataToSave.date) || now;
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const isFuture = parsedDate.getTime() > endOfToday.getTime();

        const validated = TransactionSchema.parse({
          label: dataToSave.label,
          value: Number(dataToSave.value),
          type: dataToSave.type,
          assetId: dataToSave.assetId,
          categoria_primaria: dataToSave.categoria_primaria ?? dataToSave.category,
          etiqueta_personalizada: dataToSave.etiqueta_personalizada,
          metodo_origem: dataToSave.metodo_origem,
          isRecurring: Boolean(dataToSave.isRecurring),
          durationMonths: dataToSave.durationMonths ?? null,
          applied: !isFuture,
          status: isFuture ? 'Futuro' : 'Confirmado',
          date: parsedDate,
        });

        const deltas: AssetDeltaMap = new Map();
        if (!isFuture && validated.assetId && !isTransferTransaction(validated as Transaction)) {
          const amount = parseTransactionAmount(validated.value);
          const isOut = isExpenseTransaction(validated as Transaction);
          addAssetDelta(deltas, validated.assetId, isOut ? -amount : amount);
        }

        const newTxRef = doc(collection(db, 'transactions'));
        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        batch.set(newTxRef, {
          ...validated,
          uid: user.uid,
          date: Timestamp.fromDate(parsedDate),
        });
        await batch.commit();

        await recalculateBalances(user.uid);
        setPendingTransaction(null);
      } catch (e) {
        if (e instanceof z.ZodError) {
          setError?.(e.issues[0]?.message || 'Dados inválidos');
        } else {
          handleFirestoreError(e, OperationType.WRITE, 'transactions');
        }
      }
    },
    [pendingTransaction, user, rawAssets, recalculateBalances, setError]
  );

  // Importação de Planilhas e Extratos por IA
  const handleFileUpload = useCallback(
    async (file: File) => {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const buffer = e.target?.result as ArrayBuffer;
            const { read, utils } = await import('xlsx');
            const workbook = read(buffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rawRows = utils.sheet_to_json(worksheet) as Record<string, unknown>[];

            if (!rawRows || rawRows.length === 0) {
              setError?.('Planilha vazia ou formato inválido.');
              return;
            }

            const parsedTxList = rawRows
              .map((row) => mapSpreadsheetRow(row))
              .filter((tx): tx is NonNullable<typeof tx> => tx !== null);

            if (parsedTxList.length === 0) {
              setError?.('Nenhuma transação válida encontrada na planilha.');
              return;
            }

            // Sprint 3 — T2: validação por linha antes do write em lote.
            // Exceção documentada à decisão (A): o payload de planilha não tem assetId,
            // então usa TransactionImportRowSchema (schema reduzido) em vez do schema
            // completo de write — que rejeitaria 100% das linhas.
            const validRows: typeof parsedTxList = [];
            const invalidRows: number[] = [];
            parsedTxList.forEach((tx, idx) => {
              try {
                validateTransactionImportRow(tx);
                validRows.push(tx);
              } catch {
                invalidRows.push(idx + 1);
              }
            });

            if (validRows.length === 0) {
              setError?.(`Nenhuma linha válida na planilha (${invalidRows.length} rejeitadas).`);
              return;
            }
            if (invalidRows.length > 0) {
              console.warn(
                `[handleFileUpload] ${invalidRows.length} linha(s) rejeitadas pelo schema: linhas ${invalidRows.join(', ')}`
              );
              setError?.(
                `${invalidRows.length} linha(s) inválida(s) ignorada(s). ${validRows.length} importada(s).`
              );
            }

            // Sprint 4a — R6 (decisão D2 = D): a importação continua aceitando linhas
            // sem conta (a UI de destino é o débito R6-UI), mas o usuário é avisado —
            // essas transações não entram no saldo de nenhuma conta até serem editadas.
            const withoutAsset = validRows.filter((tx) => !tx.assetId).length;
            if (withoutAsset > 0 && invalidRows.length === 0) {
              console.warn(
                `[handleFileUpload] ${withoutAsset} transação(ões) importada(s) sem assetId (R6-UI pendente).`
              );
              setError?.(
                `${withoutAsset} transação(ões) importada(s) sem conta. Atribua a conta editando cada transação.`
              );
            }

            const batch = writeBatch(db);
            validRows.forEach((tx) => {
              const newTxRef = doc(collection(db, 'transactions'));
              batch.set(newTxRef, {
                ...tx,
                uid: user?.uid,
                createdAt: serverTimestamp(),
              });
            });

            await batch.commit();
            if (user?.uid) {
              await recalculateBalances(user.uid);
            }
          } catch (err) {
            console.error('Erro ao processar planilha:', err);
            setError?.('Erro ao ler arquivo da planilha. Verifique o formato.');
          }
        };
        reader.readAsArrayBuffer(file);
        return;
      }

      if (!user) return;
      setIsProcessingIA(true);
      setError?.(null);
      try {
        const storedKey = await Preferences.get({ key: GEMINI_API_KEY_STORAGE })
          .then((res) => res.value || '')
          .catch(() => '');
        const key = storedKey || '';

        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Data = (reader.result as string)?.split(',')[1];
            if (!base64Data) {
              setIsProcessingIA(false);
              return;
            }
            const result = await extractDocument(key, {
              data: base64Data,
              mimeType: file.type,
            });

            if (result) {
              setPendingTransaction({
                label: result.label || 'Transação Importada',
                value: result.value || 0,
                type: result.type || 'out',
                categoria_primaria: result.category || 'Geral',
                date: new Date().toISOString(),
                assetId: rawAssets.length > 0 ? rawAssets[0].id : undefined,
              });
            }
          } catch (err) {
            setError?.(getAiErrorMessage(err));
          } finally {
            setIsProcessingIA(false);
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setError?.(getAiErrorMessage(err));
        setIsProcessingIA(false);
      }
    },
    [user, rawAssets, recalculateBalances, setError]
  );

  return {
    transactions,
    setTransactions,
    pendingTransaction,
    setPendingTransaction,
    isProcessingIA,
    setIsProcessingIA,
    recalculateBalances,
    moveToTrash,
    restoreFromTrash,
    addTransaction,
    addTransfer,
    updateTransaction,
    confirmPendingTransaction,
    handleFileUpload,
  };
}
