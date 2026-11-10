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
  isExpenseTransaction,
  isIncomeTransaction,
  isYieldTransaction,
} from '../lib/finance';
import { calculateAssetBalanceUpdate } from '../lib/adapters/assetBalance';
import { parseAssetDate } from '../lib/adapters/assetYieldService';
import { mapSpreadsheetRow } from '../lib/spreadsheetParser';
import { extractDocument, getAiErrorMessage, GEMINI_API_KEY_STORAGE } from '../lib/ai';
import { TransactionSchema } from '../lib/validations';
import { useTransactionsCron } from './useTransactionsCron';
import type { Asset, Transaction } from '../types/app';
import type { ZenithUser } from './useZenithData';

export type AssetDeltaMap = Map<string, number>;

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

  // Recálculo atômico de saldos parciais
  const recalculateBalances = useCallback(async (userId: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('uid', '==', userId), orderBy('date', 'asc'));
      const snap = await getDocs(q);
      let currentBal = 0;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        const tx = d.data() as Transaction;
        const val = parseTransactionAmount(tx.value);
        if (isIncomeTransaction(tx) || isYieldTransaction(tx)) {
          currentBal += val;
        } else if (isExpenseTransaction(tx)) {
          currentBal -= val;
        }
        currentBal = Math.round(currentBal * 100) / 100;
        batch.update(d.ref, { partialBalance: currentBal });
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'recalculate_balances');
    }
  }, []);

  // CRON: Aplicação de Transações Agendadas / Pendentes e Rendimentos Diários
  useTransactionsCron(user, rawAssets, transactions, recalculateBalances);

  // Mover para lixeira com reversão atômica de saldo
  const moveToTrash = useCallback(
    async (item: any, collectionName: string) => {
      try {
        if (!user) return;

        const deltas: AssetDeltaMap = new Map();
        if (collectionName === 'transactions' && item.applied && item.assetId) {
          const amount = parseTransactionAmount(item.value);
          const isOut = isExpenseTransaction(item);
          addAssetDelta(deltas, item.assetId, isOut ? amount : -amount);
        }

        const trashRef = doc(collection(db, 'trash'));
        const itemRef = doc(db, collectionName, item.id);

        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        batch.set(trashRef, {
          originalId: item.id,
          originalCollection: collectionName,
          data: item,
          deletedAt: serverTimestamp(),
          uid: user.uid,
        });
        batch.delete(itemRef);
        await batch.commit();

        if (collectionName === 'transactions') {
          await recalculateBalances(user.uid);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${item.id}`);
      }
    },
    [user, rawAssets, recalculateBalances]
  );

  const restoreFromTrash = useCallback(
    async (item: any) => {
      if (!user || !item?.originalCollection || !item?.originalId) return;
      try {
        const data = item.data || {};
        const { id: _id, ref: _ref, ...restoredData } = data;

        const deltas: AssetDeltaMap = new Map();
        if (item.originalCollection === 'transactions' && data.applied && data.assetId) {
          const amount = Number(data.value) || 0;
          const isOut = isExpenseTransaction(data);
          addAssetDelta(deltas, data.assetId, isOut ? -amount : amount);
        }

        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        batch.set(doc(db, item.originalCollection, item.originalId), restoredData);
        batch.delete(doc(db, 'trash', item.id));
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

      const deltas: AssetDeltaMap = new Map();
      if (applied && data.assetId) {
        const amount = Number(data.value) || 0;
        const isOut = isExpenseTransaction(data as Transaction);
        addAssetDelta(deltas, data.assetId, isOut ? -amount : amount);
      }

      try {
        const batch = writeBatch(db);
        applyAssetDeltas(batch, deltas, rawAssets);
        batch.set(newTxRef, txData);
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'transactions');
        return;
      }

      await recalculateBalances(user.uid);
    },
    [user, rawAssets, recalculateBalances]
  );

  const updateTransaction = useCallback(
    async (selectedTx: Transaction, data: Partial<Transaction>) => {
      if (!user) return;
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const txDate = parseTransactionDate(data.date) || now;
      const isFuture = txDate.getTime() > endOfToday.getTime();
      const applied = !isFuture;

      const txRef = doc(db, 'transactions', selectedTx.id);
      const txData = {
        ...data,
        uid: user.uid,
        applied,
        status: isFuture ? 'Futuro' : 'Confirmado',
        date: data.date ? Timestamp.fromDate(txDate) : serverTimestamp(),
      };

      const deltas: AssetDeltaMap = new Map();
      if (selectedTx.applied && selectedTx.assetId) {
        const oldAmount = parseTransactionAmount(selectedTx.value);
        const wasOut = isExpenseTransaction(selectedTx);
        addAssetDelta(deltas, selectedTx.assetId, wasOut ? oldAmount : -oldAmount);
      }
      if (applied && data.assetId) {
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
    [user, rawAssets, recalculateBalances]
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
        if (!isFuture && validated.assetId) {
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

            const batch = writeBatch(db);
            parsedTxList.forEach((tx) => {
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
    updateTransaction,
    confirmPendingTransaction,
    handleFileUpload,
  };
}
