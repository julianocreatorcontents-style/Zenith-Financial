import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  handleFirestoreError,
  OperationType,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from '../firebase';
import { enrichAsset, parseAssetDate } from '../lib/adapters/assetYieldService';
import { hasAssetMovementSince } from '../lib/finance';
import type { Asset, Transaction } from '../types/app';
import type { ZenithUser } from './useZenithData';

export function useAssetsData(
  user: ZenithUser | null,
  transactions: Transaction[],
  cdiAnnualPercent: number
) {
  const [rawAssets, setRawAssets] = useState<Asset[]>([]);

  useEffect(() => {
    if (!user) {
      setRawAssets([]);
      return;
    }
    const q = query(collection(db, 'assets'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Asset));
        setRawAssets(docs);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'assets')
    );
    return unsub;
  }, [user]);

  // Dynamic enrichment: compounds daily yield from deposit date to today
  const assets = useMemo(() => {
    return rawAssets.map((asset) => {
      const anchor = parseAssetDate(asset.manualBalanceDate);
      const hasMovement = anchor && transactions
        ? hasAssetMovementSince(asset, transactions, anchor)
        : false;
      return enrichAsset(asset, cdiAnnualPercent, new Date(), hasMovement, transactions);
    });
  }, [rawAssets, transactions, cdiAnnualPercent]);

  // Operações de CRUD de Ativos
  const createAsset = useCallback(async (data: Partial<Asset>) => {
    if (!user) return;
    const now = new Date();
    await addDoc(collection(db, 'assets'), {
      ...data,
      uid: user.uid,
      valorInvestido: data.valorInvestido ?? data.value,
      investmentStartDate: data.investmentStartDate ?? now,
      createdAt: serverTimestamp(),
    }).catch((e: unknown) => handleFirestoreError(e, OperationType.CREATE, 'assets'));
  }, [user]);

  const updateAsset = useCallback(async (id: string, data: Partial<Asset>) => {
    const cleanData: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && !(typeof val === 'number' && Number.isNaN(val))) {
        cleanData[key] = val;
      }
    }
    const updatePayload = {
      ...cleanData,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'assets', id), updatePayload).catch((e: unknown) =>
      handleFirestoreError(e, OperationType.UPDATE, `assets/${id}`)
    );
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'assets', id)).catch((e: unknown) =>
      handleFirestoreError(e, OperationType.DELETE, `assets/${id}`)
    );
  }, []);

  return {
    rawAssets,
    assets,
    setRawAssets,
    createAsset,
    updateAsset,
    deleteAsset,
  };
}
