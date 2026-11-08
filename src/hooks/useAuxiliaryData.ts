import { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType, FIRESTORE_ERROR_EVENT } from '../firebase';
import type { DDA } from '../types/app';
import type { ZenithUser, FirestoreIssue } from './useZenithData';

export function useAuxiliaryData(user: ZenithUser | null) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [ddas, setDdas] = useState<DDA[]>([]);
  const [userRules, setUserRules] = useState<any[]>([]);
  const [firestoreIssues, setFirestoreIssues] = useState<FirestoreIssue[]>([]);

  // 7. Notifications Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('uid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a: any, b: any) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return tB - tA;
        });

        const realNotifications = items.slice(0, 10);
        const reconciliationNotification = {
          id: 'reconciliation-pending',
          title: 'Rendimentos pendentes',
          message: 'Confira se os rendimentos de hoje batem com o extrato oficial.',
          action: 'open-reconciliation',
          createdAt: new Date().toISOString(),
          read: false,
        };
        setNotifications([reconciliationNotification, ...realNotifications]);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'notifications')
    );
    return unsub;
  }, [user]);

  // 8. DDA Listener
  useEffect(() => {
    if (!user) {
      setDdas([]);
      return;
    }
    const q = query(collection(db, 'ddas'), where('uid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDdas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DDA)));
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'ddas')
    );
    return unsub;
  }, [user]);

  // 9. User Rules Listener
  useEffect(() => {
    if (!user) {
      setUserRules([]);
      return;
    }
    const q = query(collection(db, 'user_rules'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setUserRules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  // 10. Firestore Diagnostics Listener
  useEffect(() => {
    const handleDiagnostic = (event: Event) => {
      const customEvent = event as CustomEvent<{ code: string; operationType: string; path: string | null }>;
      if (!customEvent.detail) return;
      const issue: FirestoreIssue = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        code: customEvent.detail.code,
        operationType: customEvent.detail.operationType,
        path: customEvent.detail.path,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      };
      setFirestoreIssues((prev) => [issue, ...prev].slice(0, 5));
    };

    window.addEventListener(FIRESTORE_ERROR_EVENT, handleDiagnostic);
    return () => window.removeEventListener(FIRESTORE_ERROR_EVENT, handleDiagnostic);
  }, []);

  return {
    notifications,
    setNotifications,
    ddas,
    setDdas,
    userRules,
    setUserRules,
    firestoreIssues,
    setFirestoreIssues,
  };
}
