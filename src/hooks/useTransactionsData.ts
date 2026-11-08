import { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType } from '../firebase';
import { parseTransactionDate } from '../lib/finance';
import type { Transaction } from '../types/app';
import type { ZenithUser } from './useZenithData';

export function useTransactionsData(user: ZenithUser | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

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

  return { transactions, setTransactions };
}
