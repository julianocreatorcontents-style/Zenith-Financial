import { useState, useEffect, useMemo } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, handleFirestoreError, OperationType } from '../firebase';
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

  return { rawAssets, assets, setRawAssets };
}
