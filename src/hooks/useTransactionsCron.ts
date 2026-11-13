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
import { Timestamp, runTransaction } from 'firebase/firestore';
import {
  parseTransactionDate,
  parseTransactionAmount,
  isExpenseTransaction,
  isYieldTransaction,
  isTransferTransaction,
  resolveTransferRole,
  createTransferId,
  matchLegacyCounterpart,
} from '../lib/finance';
import { addAssetDelta, applyAssetDeltas, AssetDeltaMap } from './useTransactionsData';
import { parseAssetDate } from '../lib/adapters/assetYieldService';
import type { Asset, Transaction } from '../types/app';
import type { ZenithUser } from './useZenithData';

/**
 * Processa e aplica transações agendadas elegíveis (T1, T2, T3).
 *
 * - T1 (Atomicidade): pares completos de transferências são aplicados em um único writeBatch.
 * - T2 (Preservação): transferId e transferRole são mantidos no update.
 * - T3 (Legado Futuro): pares legados inequívocos recebem transferId antes da aplicação conjunta;
 *   pernas ambíguas ou sem par são aplicadas isoladamente sem transferId.
 */
export async function applyEligibleScheduledTransactions(
  eligibleDocs: Transaction[],
  rawAssets: Asset[],
  dbInstance: typeof db = db,
  isMounted: () => boolean = () => true,
  runTransactionFn: typeof runTransaction = runTransaction
): Promise<boolean> {
  let hasChanges = false;

  const transfersWithId: Transaction[] = [];
  const legacyTransfers: Transaction[] = [];
  const standardTxs: Transaction[] = [];

  for (const tx of eligibleDocs) {
    if (tx.transferId) {
      transfersWithId.push(tx);
    } else if (isTransferTransaction(tx)) {
      legacyTransfers.push(tx);
    } else {
      standardTxs.push(tx);
    }
  }

  // T1 & T2: Agrupamento atômico de transferências com transferId
  const byTransferId = new Map<string, Transaction[]>();
  for (const tx of transfersWithId) {
    const list = byTransferId.get(tx.transferId!) || [];
    list.push(tx);
    byTransferId.set(tx.transferId!, list);
  }

  for (const [transferId, legs] of byTransferId) {
    if (!isMounted()) break;
    if (legs.length === 2) {
      // Par completo (saída e entrada): D4 - comita atomicamente em runTransaction
      // lendo os saldos frescos dos ativos para evitar concorrência/last-write-wins
      const deltas: AssetDeltaMap = new Map();
      for (const leg of legs) {
        const role = resolveTransferRole(leg);
        const amount = parseTransactionAmount(leg.value);
        if (leg.assetId && role) {
          addAssetDelta(deltas, leg.assetId, role === 'out' ? -amount : amount);
        }
      }

      await runTransactionFn(dbInstance, async (transaction) => {
        // Leitura dos snapshots dos assets dentro da transação
        const assetMap = new Map<string, any>();
        for (const [assetId] of deltas) {
          const assetRef = doc(dbInstance, 'assets', assetId);
          const snap = await transaction.get(assetRef);
          if (snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists)) {
            assetMap.set(assetId, { id: assetId, ...snap.data() });
          } else {
            const fallback = rawAssets.find((a) => a.id === assetId);
            if (fallback) assetMap.set(assetId, fallback);
          }
        }

        // Atualização dos assets com recálculo atômico
        for (const [assetId, delta] of deltas) {
          if (delta === 0) continue;
          const currentAsset = assetMap.get(assetId);
          if (!currentAsset) continue;

          const hasManualBalance =
            typeof currentAsset.manualBalance === 'number' && Number.isFinite(currentAsset.manualBalance);
          const currentValue = hasManualBalance
            ? Number(currentAsset.manualBalance)
            : Number(currentAsset.value) || 0;
          const currentInvested = Number(currentAsset.valorInvestido ?? currentValue) || currentValue;

          const nextValue = Math.round((currentValue + delta) * 100) / 100;
          const nextInvested = Math.max(0, Math.round((currentInvested + delta) * 100) / 100);

          const assetPayload: Record<string, any> = {
            value: nextValue,
            valorInvestido: nextInvested,
            updatedAt: serverTimestamp(),
          };
          if (hasManualBalance) {
            assetPayload.manualBalance = Math.round((Number(currentAsset.manualBalance) + delta) * 100) / 100;
          }
          transaction.update(doc(dbInstance, 'assets', assetId), assetPayload);
        }

        // Atualização de ambas as transações na mesma transação
        for (const leg of legs) {
          const updatePayload: Record<string, any> = {
            applied: true,
            status: 'Confirmado',
            transferId: leg.transferId, // T2: Preservar transferId
          };
          if (leg.transferRole) {
            updatePayload.transferRole = leg.transferRole; // T2: Preservar transferRole
          }
          if (leg.counterpartAssetId) {
            updatePayload.counterpartAssetId = leg.counterpartAssetId;
          }
          transaction.update(doc(dbInstance, 'transactions', leg.id), updatePayload);
        }
      });
      hasChanges = true;
    } else {
      // Perna órfã: commit isolado com log específico (T1)
      for (const leg of legs) {
        console.warn(`[CRON] cron: transferência órfã aplicada isoladamente: ${leg.id}`);
        const deltas: AssetDeltaMap = new Map();
        const role = resolveTransferRole(leg);
        const amount = parseTransactionAmount(leg.value);
        if (leg.assetId && role) {
          addAssetDelta(deltas, leg.assetId, role === 'out' ? -amount : amount);
        }

        const batch = writeBatch(dbInstance);
        applyAssetDeltas(batch, deltas, rawAssets);
        batch.update(doc(dbInstance, 'transactions', leg.id), {
          applied: true,
          status: 'Confirmado',
          transferId: leg.transferId,
          ...(leg.transferRole ? { transferRole: leg.transferRole } : {}),
        });
        await batch.commit();
        hasChanges = true;
      }
    }
  }

  // T3: Agrupamento de legados Futuro antes de aplicar
  const outCandidates = legacyTransfers.filter((tx) => resolveTransferRole(tx) === 'out');
  const inCandidates = legacyTransfers.filter((tx) => resolveTransferRole(tx) === 'in');
  const usedIn = new Set<number>();
  const usedOut = new Set<Transaction>();

  for (const outLeg of outCandidates) {
    if (!isMounted()) break;
    if (usedOut.has(outLeg)) continue;

    // Checa se há múltiplos out concorrentes com mesmo valor e data
    const competingOuts = outCandidates.filter(
      (c) =>
        !usedOut.has(c) &&
        parseTransactionAmount(c.value) === parseTransactionAmount(outLeg.value) &&
        parseTransactionDate(c.date)?.toDateString() === parseTransactionDate(outLeg.date)?.toDateString()
    );
    if (competingOuts.length > 1) {
      continue;
    }

    const match = matchLegacyCounterpart(outLeg, inCandidates, usedIn);
    if (match) {
      usedIn.add(match.index);
      usedOut.add(outLeg);
      const inLeg = match.leg;

      const generatedTransferId = createTransferId();
      const deltas: AssetDeltaMap = new Map();
      const outAmount = parseTransactionAmount(outLeg.value);
      const inAmount = parseTransactionAmount(inLeg.value);
      if (outLeg.assetId) addAssetDelta(deltas, outLeg.assetId, -outAmount);
      if (inLeg.assetId) addAssetDelta(deltas, inLeg.assetId, inAmount);

      await runTransactionFn(dbInstance, async (transaction) => {
        const assetMap = new Map<string, any>();
        for (const [assetId] of deltas) {
          const assetRef = doc(dbInstance, 'assets', assetId);
          const snap = await transaction.get(assetRef);
          if (snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists)) {
            assetMap.set(assetId, { id: assetId, ...snap.data() });
          } else {
            const fallback = rawAssets.find((a) => a.id === assetId);
            if (fallback) assetMap.set(assetId, fallback);
          }
        }

        for (const [assetId, delta] of deltas) {
          if (delta === 0) continue;
          const currentAsset = assetMap.get(assetId);
          if (!currentAsset) continue;

          const hasManualBalance =
            typeof currentAsset.manualBalance === 'number' && Number.isFinite(currentAsset.manualBalance);
          const currentValue = hasManualBalance
            ? Number(currentAsset.manualBalance)
            : Number(currentAsset.value) || 0;
          const currentInvested = Number(currentAsset.valorInvestido ?? currentValue) || currentValue;

          const nextValue = Math.round((currentValue + delta) * 100) / 100;
          const nextInvested = Math.max(0, Math.round((currentInvested + delta) * 100) / 100);

          const assetPayload: Record<string, any> = {
            value: nextValue,
            valorInvestido: nextInvested,
            updatedAt: serverTimestamp(),
          };
          if (hasManualBalance) {
            assetPayload.manualBalance = Math.round((Number(currentAsset.manualBalance) + delta) * 100) / 100;
          }
          transaction.update(doc(dbInstance, 'assets', assetId), assetPayload);
        }

        transaction.update(doc(dbInstance, 'transactions', outLeg.id), {
          applied: true,
          status: 'Confirmado',
          transferId: generatedTransferId,
          transferRole: 'out',
          ...(inLeg.assetId ? { counterpartAssetId: inLeg.assetId } : {}),
        });
        transaction.update(doc(dbInstance, 'transactions', inLeg.id), {
          applied: true,
          status: 'Confirmado',
          transferId: generatedTransferId,
          transferRole: 'in',
          ...(outLeg.assetId ? { counterpartAssetId: outLeg.assetId } : {}),
        });
      });
      hasChanges = true;
      console.log(
        `[CRON] cron: legado agrupado com transferId ${generatedTransferId}: out=${outLeg.id}, in=${inLeg.id}`
      );
    }
  }

  // Legados não pareados (ambíguos ou sem par)
  const uncoupledLegados: Transaction[] = [];
  for (const tx of outCandidates) {
    if (!usedOut.has(tx)) uncoupledLegados.push(tx);
  }
  for (let i = 0; i < inCandidates.length; i += 1) {
    if (!usedIn.has(i)) uncoupledLegados.push(inCandidates[i]);
  }
  for (const tx of legacyTransfers) {
    if (!outCandidates.includes(tx) && !inCandidates.includes(tx)) {
      uncoupledLegados.push(tx);
    }
  }

  for (const tx of uncoupledLegados) {
    if (!isMounted()) break;
    console.warn(`[CRON] cron: legado sem par inequívoco aplicado isoladamente: ${tx.id}`);
    const amount = parseTransactionAmount(tx.value);
    const role = resolveTransferRole(tx);
    const deltas: AssetDeltaMap = new Map();
    if (tx.assetId && role) {
      addAssetDelta(deltas, tx.assetId, role === 'out' ? -amount : amount);
    } else if (tx.assetId) {
      const isOut = isExpenseTransaction(tx);
      addAssetDelta(deltas, tx.assetId, isOut ? -amount : amount);
    }

    const batch = writeBatch(dbInstance);
    applyAssetDeltas(batch, deltas, rawAssets);
    // NUNCA gerar transferId para doc isolado/ambíguo
    batch.update(doc(dbInstance, 'transactions', tx.id), {
      applied: true,
      status: 'Confirmado',
    });
    await batch.commit();
    hasChanges = true;
  }

  // Transações normais (receitas e despesas agendadas)
  for (const tx of standardTxs) {
    if (!isMounted()) break;
    const amount = parseTransactionAmount(tx.value);
    const isOut = isExpenseTransaction(tx);
    const deltas: AssetDeltaMap = new Map();
    if (tx.assetId) {
      addAssetDelta(deltas, tx.assetId, isOut ? -amount : amount);
    }

    const batch = writeBatch(dbInstance);
    applyAssetDeltas(batch, deltas, rawAssets);
    batch.update(doc(dbInstance, 'transactions', tx.id), {
      applied: true,
      status: 'Confirmado',
    });
    await batch.commit();
    hasChanges = true;
  }

  return hasChanges;
}

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

        const eligibleDocs: Transaction[] = [];
        for (const txDoc of snap.docs) {
          if (!isMounted) break;
          const tx = { id: txDoc.id, ...txDoc.data() } as Transaction;
          if (tx.applied === true) continue;

          const txDate = parseTransactionDate(tx.date);
          if (txDate && txDate.getTime() <= endOfToday.getTime()) {
            if (tx.assetId && !rawAssets.some((a) => a.id === tx.assetId)) {
              continue;
            }
            eligibleDocs.push(tx);
          }
        }

        if (eligibleDocs.length > 0 && isMounted) {
          const appliedScheduled = await applyEligibleScheduledTransactions(
            eligibleDocs,
            rawAssets,
            db,
            () => isMounted
          );
          if (appliedScheduled) {
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
              const yieldId = `yield_${asset.id}_${targetKey}`;
              const newYieldRef = doc(db, 'transactions', yieldId);
              const yieldTx = {
                uid: user.uid,
                label: asset.name || 'Rendimento',
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
