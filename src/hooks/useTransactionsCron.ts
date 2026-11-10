import { useEffect } from 'react';
import {
  db,
  collection,
  query,
  where,
  doc,
  writeBatch,
  serverTimestamp,
  getDocs,
} from '../firebase';
import { Timestamp } from 'firebase/firestore';
import {
  parseTransactionDate,
  parseTransactionAmount,
  isExpenseTransaction,
  isYieldTransaction,
} from '../lib/finance';
import { addAssetDelta, applyAssetDeltas, AssetDeltaMap } from './useTransactionsData';
import { parseAssetDate } from '../lib/adapters/assetYieldService';
import type { Asset, Transaction } from '../types/app';
import type { ZenithUser } from './useZenithData';

export function useTransactionsCron(
  user: ZenithUser | null,
  rawAssets: Asset[],
  transactions: Transaction[],
  recalculateBalances: (userId: string) => Promise<void>
) {
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const processScheduledTransactions = async () => {
      try {
        const q = query(collection(db, 'transactions'), where('uid', '==', user.uid));
        const snap = await getDocs(q);
        if (snap.empty || !isMounted) return;

        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        let hasChanges = false;

        for (const txDoc of snap.docs) {
          if (!isMounted) break;
          const tx = { id: txDoc.id, ...txDoc.data() } as Transaction;
          if (tx.applied === true && tx.status === 'Confirmado') continue;

          const txDate = parseTransactionDate(tx.date);
          if (txDate && txDate.getTime() <= endOfToday.getTime()) {
            if (tx.assetId && !rawAssets.some((a) => a.id === tx.assetId)) {
              continue;
            }

            const amount = parseTransactionAmount(tx.value);
            const isOut = isExpenseTransaction(tx);
            const deltas: AssetDeltaMap = new Map();
            addAssetDelta(deltas, tx.assetId, isOut ? -amount : amount);

            const batch = writeBatch(db);
            applyAssetDeltas(batch, deltas, rawAssets);
            batch.update(doc(db, 'transactions', tx.id), {
              applied: true,
              status: 'Confirmado',
            });
            await batch.commit();
            hasChanges = true;
          }
        }

        // Sincroniza lançamentos de rendimento diário dos ativos
        for (const asset of rawAssets) {
          const dailyYield = Number(
            asset.manualDailyYield ??
              (asset as any).calculatedDailyYield ??
              (asset as any).dailyYield ??
              0
          );
          const weekendYield = Number(asset.manualWeekendYield);
          if (dailyYield <= 0 && (!Number.isFinite(weekendYield) || weekendYield <= 0)) continue;

          const anchor =
            parseAssetDate(asset.manualBalanceDate) ??
            parseAssetDate(asset.investmentStartDate) ??
            parseAssetDate(asset.createdAt);
          const isBusinessDays =
            (asset as any).investmentPolicy?.dayCountConvention ===
              'BUSINESS_DAYS_252' || (asset.name || '').toLowerCase().includes('mercado pago');

          // Percorre os últimos 7 dias até hoje
          for (let offset = 7; offset >= 0; offset--) {
            const targetDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12, 0, 0);
            if (anchor && targetDay < new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) continue;

            const isWeekend = targetDay.getDay() === 0 || targetDay.getDay() === 6;
            if (isBusinessDays && isWeekend) continue;

            const yieldAmount = isWeekend && weekendYield > 0 ? weekendYield : dailyYield;
            if (yieldAmount <= 0) continue;

            const targetKey = `${targetDay.getFullYear()}-${String(targetDay.getMonth() + 1).padStart(2, '0')}-${String(targetDay.getDate()).padStart(2, '0')}`;
            const alreadyExists = transactions.some((t) => {
              if (!isYieldTransaction(t)) return false;
              const tD = parseTransactionDate(t.date ?? t.createdAt);
              if (!tD) return false;
              const matchAsset =
                (t.assetId && t.assetId === asset.id) ||
                String(t.label || '').toLowerCase().includes(asset.name.toLowerCase());
              if (!matchAsset) return false;
              const tKey = `${tD.getFullYear()}-${String(tD.getMonth() + 1).padStart(2, '0')}-${String(tD.getDate()).padStart(2, '0')}`;
              return tKey === targetKey;
            });

            if (!alreadyExists) {
              const newYieldRef = doc(collection(db, 'transactions'));
              const yieldTx = {
                uid: user.uid,
                label: `Rendimento ${asset.name}`,
                value: Math.round(yieldAmount * 100) / 100,
                type: 'yield',
                categoria_primaria: 'Rendimentos',
                assetId: asset.id,
                applied: true,
                status: 'Confirmado',
                date: Timestamp.fromDate(targetDay),
                createdAt: serverTimestamp(),
              };
              const batch = writeBatch(db);
              batch.set(newYieldRef, yieldTx);
              await batch.commit();
              hasChanges = true;
            }
          }
        }

        if (hasChanges && isMounted) {
          await recalculateBalances(user.uid);
        }
      } catch (err) {
        console.error('[CRON] Erro ao processar transações agendadas:', err);
      }
    };

    processScheduledTransactions();

    return () => {
      isMounted = false;
    };
  }, [user, rawAssets, transactions, recalculateBalances]);
}
