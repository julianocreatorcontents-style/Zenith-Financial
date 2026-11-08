import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
  handleFirestoreError, OperationType, getDocs, writeBatch
} from '../firebase';
import { Timestamp } from 'firebase/firestore';
import type { WriteBatch } from 'firebase/firestore';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, User } from 'firebase/auth';
import { 
  CachedAuthUser, 
  getSyncCachedUser, 
  getCachedUser, 
  saveCachedUser, 
  clearCachedUser 
} from '../lib/authSession';
import { z } from 'zod';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  extractDocument,
  getAiErrorMessage,
  GEMINI_API_KEY_STORAGE,
  MissingApiKeyError,
  InvalidApiKeyError,
} from '../lib/ai';
import { TransactionSchema } from '../lib/validations';
import { friendlyFirebaseError } from '../lib/errorUtils';
import { 
  calculateTotals, 
  calculateVariation, 
  getMiniChartData, 
  calculateEvolutionData, 
  calculateCashFlowData,
  calculateMonthBalance,
  calculateNetWorth,
  parseTransactionDate,
  parseTransactionAmount,
  isExpenseTransaction,
  isIncomeTransaction,
  isYieldTransaction,
  resolveGoalTargets,
} from '../lib/finance';
import type { FinancialGoalTargets } from '../lib/finance';
import { calculateNetWorthProjection } from '../lib/adapters/netWorthProjection';
import { enrichAsset } from '../lib/adapters/assetYieldService';
import { calculateAssetBalanceUpdate } from '../lib/adapters/assetBalance';
import { getCachedCdiRate, fetchLiveCdiRate } from '../lib/adapters/marketRateService';
import { hasAssetMovementSince } from '../lib/finance';
import { parseAssetDate } from '../lib/adapters/assetYieldService';
import type { MarketRateState } from '../lib/adapters/marketRateService';
import { mapSpreadsheetRow } from '../lib/spreadsheetParser';
import type { Asset, UserProfile, Transaction, DDA, Settings } from '../types/app';

type AssetDeltaMap = Map<string, number>;

function addAssetDelta(deltas: AssetDeltaMap, assetId: string | undefined, delta: number) {
  if (!assetId || !Number.isFinite(delta) || delta === 0) return;
  deltas.set(assetId, (deltas.get(assetId) ?? 0) + delta);
}

/**
 * Agenda as atualizações de saldo no mesmo writeBatch da transação.
 * Usa o snapshot local (`rawAssets`) para não exigir leituras extras e
 * preservar o funcionamento offline do Firestore.
 */
function applyAssetDeltas(
  batch: WriteBatch,
  deltas: AssetDeltaMap,
  assets: Asset[],
) {
  for (const [assetId, delta] of deltas) {
    if (delta === 0) continue;
    const asset = assets.find(a => a.id === assetId);
    if (!asset) continue;
    const update = calculateAssetBalanceUpdate(asset, Math.abs(delta), delta > 0);
    batch.update(doc(db, 'assets', assetId), {
      ...update,
      updatedAt: serverTimestamp(),
    });
  }
}

export interface FirestoreIssue {
  id: string;
  code: string;
  operationType: string;
  path: string | null;
  timestamp: string;
}

export type ZenithUser = User | CachedAuthUser;

import { useUserSettings, DEFAULT_SETTINGS } from './useUserSettings';
import { useTransactionsData } from './useTransactionsData';
import { useAssetsData } from './useAssetsData';
import { useAuxiliaryData } from './useAuxiliaryData';

export { DEFAULT_SETTINGS };

export function useZenithData() {
  const [user, setUser] = useState<ZenithUser | null>(() => auth.currentUser || getSyncCachedUser());
  const [isAuthReady, setIsAuthReady] = useState(() => Boolean(auth.currentUser || getSyncCachedUser()));
  const [marketRate, setMarketRate] = useState<MarketRateState>(getCachedCdiRate);
  const [error, setError] = useState<string | null>(null);
  
  const [pendingTransaction, setPendingTransaction] = useState<any>(null);
  const [isProcessingIA, setIsProcessingIA] = useState(false);

  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try {
      return localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Sub-hooks com listeners do Firestore desacoplados
  const {
    profile,
    setProfile,
    investorProfile,
    setInvestorProfile,
    isBiometryModalOpen,
    setIsBiometryModalOpen,
    settings,
    setSettings,
    privacyMode,
    setPrivacyMode,
  } = useUserSettings(user);

  const { transactions, setTransactions } = useTransactionsData(user);

  const { rawAssets, assets, setRawAssets } = useAssetsData(
    user,
    transactions,
    marketRate.cdiAnnualPercent
  );

  const {
    notifications,
    setNotifications,
    ddas,
    setDdas,
    userRules,
    setUserRules,
    firestoreIssues,
    setFirestoreIssues,
  } = useAuxiliaryData(user);

  // 1. CDI Rate dinâmico via BCB
  useEffect(() => {
    let mounted = true;
    fetchLiveCdiRate().then((res) => {
      if (mounted) setMarketRate(res);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Auth Listener com suporte a Offline Mode no APK
  useEffect(() => {
    // Busca do storage assíncrono nativo (Preferences) no startup
    getCachedUser().then((cached) => {
      if (cached) {
        // Se ainda não temos usuário ativo e estamos sem rede, entra com a sessão em cache
        if (!auth.currentUser && typeof navigator !== 'undefined' && !navigator.onLine) {
          setUser((curr) => curr || cached);
          setIsAuthReady(true);
        }
      }
    });

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setIsAuthReady(true);
        const toCache: CachedAuthUser = {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          providerData: u.providerData?.map(p => ({ providerId: p.providerId })) || []
        };
        saveCachedUser(toCache);
      } else {
        // Se Firebase Auth não tem usuário no momento
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          // Em modo offline, preserva a última sessão em cache para não deslogar
          getCachedUser().then((cached) => {
            if (cached) {
              setUser(cached);
            } else {
              setUser(null);
            }
            setIsAuthReady(true);
          });
        } else {
          setUser(null);
          setIsAuthReady(true);
        }
      }
    }, (authError) => {
      console.error("Auth Listener Error:", authError);
      getCachedUser().then((cached) => {
        if (cached) setUser(cached);
        setIsAuthReady(true);
      });
    });
    
    const timer = setTimeout(() => {
      setIsAuthReady((ready) => {
        if (!ready) {
          console.warn("Auth Listener timeout - checking offline user cache");
          getCachedUser().then((cached) => {
            if (cached) setUser(cached);
          });
          return true;
        }
        return ready;
      });
    }, 2000);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // Recálculo atômico de saldos parciais
  const recalculateBalances = useCallback(async (userId: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('uid', '==', userId), orderBy('date', 'asc'));
      const snap = await getDocs(q);
      let currentBal = 0;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        const tx = d.data() as Transaction;
        const val = Number(tx.value) || 0;
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

  // 11. CRON: Aplicação de Transações Agendadas / Pendentes (Contas a Pagar)
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const processScheduledTransactions = async () => {
      try {
        const q = query(
          collection(db, 'transactions'),
          where('uid', '==', user.uid)
        );
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
            if (tx.assetId && !rawAssets.some(a => a.id === tx.assetId)) {
              continue;
            }

            const amount = Number(tx.value) || 0;
            const isOut = isExpenseTransaction(tx);
            const deltas: AssetDeltaMap = new Map();
            addAssetDelta(deltas, tx.assetId, isOut ? -amount : amount);

            const batch = writeBatch(db);
            applyAssetDeltas(batch, deltas, rawAssets);
            batch.update(doc(db, 'transactions', tx.id), {
              applied: true,
              status: 'Confirmado'
            });
            await batch.commit();
            hasChanges = true;
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
  }, [user, rawAssets, recalculateBalances]);

  // Limpeza de lançamentos antigos pagos solicitada pelo usuário (manter apenas o lançamento Copel)

  // Mover para a lixeira com exclusão atômica e reversão do saldo no ativo
  const moveToTrash = useCallback(async (item: any, collectionName: string) => {
    try {
      if (!user) return;

      const deltas: AssetDeltaMap = new Map();
      if (collectionName === 'transactions' && item.applied && item.assetId) {
        const amount = Number(item.value) || 0;
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
        uid: user.uid
      });
      batch.delete(itemRef);
      await batch.commit();

      if (collectionName === 'transactions') {
        await recalculateBalances(user.uid);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${item.id}`);
    }
  }, [user, rawAssets, recalculateBalances]);

  const restoreFromTrash = useCallback(async (item: any) => {
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
  }, [user, rawAssets, recalculateBalances]);

  // Alternar modo de privacidade
  const togglePrivacyMode = useCallback(() => {
    const newVal = !privacyMode;
    setPrivacyMode(newVal);
    if (user) {
      updateDoc(doc(db, 'settings', user.uid), { privacyMode: newVal })
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
    }
  }, [privacyMode, user]);

  // DDA actions
  const handleAcceptDDA = useCallback(async (dda: DDA) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'ddas', dda.id), { status: 'accepted' });
      const txRef = doc(collection(db, 'transactions'));
      await setDoc(txRef, {
        label: `DDA: ${dda.beneficiary}`,
        value: dda.value,
        type: 'out',
        date: serverTimestamp(),
        uid: user.uid
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions');
    }
  }, [user]);

  const handleRejectDDA = useCallback(async (dda: DDA) => {
    try {
      await updateDoc(doc(db, 'ddas', dda.id), { status: 'rejected' });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'ddas');
    }
  }, []);

  // Perfil
  const handleSaveProfile = useCallback(async (data: any) => {
    if (!user) return;
    const { uid: _uid, pix_key: _pixKey, ...updateData } = data;
    await updateDoc(doc(db, 'users', user.uid), updateData)
      .catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`));
  }, [user]);

  // Chave Gemini
  const handleSaveApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmed);
    } catch {
      // Memory fallback
    }
    setGeminiApiKey(trimmed);
    setApiKeyError(null);
    setError(null);
  }, []);

  const getGeminiApiKey = useCallback(() => {
    const key = geminiApiKey.trim();
    if (!key) {
      throw new MissingApiKeyError();
    }
    return key;
  }, [geminiApiKey]);

  // Autenticação
  const handleGoogleLogin = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // O plugin apenas obtém a credencial nativa. O login no SDK JS é feito
        // via signInWithCredential para que o Firestore enxergue a sessão.
        const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
          .catch(async (error) => {
            const message = String(error?.message ?? error);
            const isReauthError = message.includes('[16]') || /account reauth/i.test(message);
            if (!isReauthError) throw error;
            // Fallback para o fluxo legado do Google Sign-In no Android.
            return FirebaseAuthentication.signInWithGoogle({
              skipNativeAuth: true,
              useCredentialManager: false,
            });
          });

        const idToken = result.credential?.idToken;
        if (!idToken) {
          throw new Error('O Google não retornou um token de identidade.');
        }
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      } else {
        // Se for Web (navegador), usa o popup padrão
        await signInWithPopup(auth, googleProvider);
      }
    } catch (e: any) {
      const message = String(e?.message ?? e);
      if (message.includes('[16]') || /account reauth/i.test(message)) {
        setError('Falha de autenticação com o Google (erro 16). Instale o APK mais recente, confirme a conta Google no dispositivo e tente novamente.');
      } else {
        setError(friendlyFirebaseError(e));
      }
    }
  }, []);

  const handleEmailLogin = useCallback(async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      setError(friendlyFirebaseError(e));
    }
  }, []);

  const handleRegister = useCallback(async (name: string, email: string, pass: string) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, { displayName: name });
    } catch (e: any) {
      setError(friendlyFirebaseError(e));
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await clearCachedUser();
      setUser(null);
      setProfile(null);
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  }, []);

  // Operações de Ativos
  const createAsset = useCallback(async (data: any) => {
    if (!user) return;
    const now = new Date();
    await addDoc(collection(db, 'assets'), {
      ...data,
      uid: user.uid,
      valorInvestido: data.valorInvestido ?? data.value,
      investmentStartDate: data.investmentStartDate ?? now,
      createdAt: serverTimestamp()
    }).catch((e: any) => handleFirestoreError(e, OperationType.CREATE, 'assets'));
  }, [user]);

  const updateAsset = useCallback(async (id: string, data: any) => {
    const cleanData: any = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && !(typeof val === 'number' && Number.isNaN(val))) {
        cleanData[key] = val;
      }
    }
    const updatePayload = {
      ...cleanData,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'assets', id), updatePayload).catch((e: any) => handleFirestoreError(e, OperationType.UPDATE, `assets/${id}`));
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'assets', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `assets/${id}`));
  }, []);

  // Operações de Transações
  const addTransaction = useCallback(async (data: any) => {
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
      date: data.date ? Timestamp.fromDate(txDate) : serverTimestamp() 
    };

    const deltas: AssetDeltaMap = new Map();
    if (applied && data.assetId) {
      const amount = Number(data.value) || 0;
      const isOut = isExpenseTransaction(data);
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
  }, [user, rawAssets, recalculateBalances]);

  const updateTransaction = useCallback(async (selectedTx: any, data: any) => {
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
      date: data.date ? Timestamp.fromDate(txDate) : serverTimestamp() 
    };
    
    const deltas: AssetDeltaMap = new Map();
    if (selectedTx.applied && selectedTx.assetId) {
      const oldAmount = Number(selectedTx.value) || 0;
      const wasOut = isExpenseTransaction(selectedTx);
      addAssetDelta(deltas, selectedTx.assetId, wasOut ? oldAmount : -oldAmount);
    }
    if (applied && data.assetId) {
      const newAmount = Number(data.value) || 0;
      const isOut = isExpenseTransaction(data);
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
          createdAt: serverTimestamp()
        });
      }
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `transactions/${selectedTx.id}`);
      return;
    }

    await recalculateBalances(user.uid);
  }, [user, rawAssets, recalculateBalances]);

  const confirmPendingTransaction = useCallback(async (updatedTx?: any) => {
    const dataToSave = updatedTx || pendingTransaction;
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
        date: parsedDate
      });

      const deltas: AssetDeltaMap = new Map();
      if (!isFuture && validated.assetId) {
        const amount = Number(validated.value) || 0;
        const isOut = isExpenseTransaction(validated);
        addAssetDelta(deltas, validated.assetId, isOut ? -amount : amount);
      }

      const newTxRef = doc(collection(db, 'transactions'));
      const batch = writeBatch(db);
      applyAssetDeltas(batch, deltas, rawAssets);
      batch.set(newTxRef, {
        ...validated,
        uid: user.uid,
        date: Timestamp.fromDate(parsedDate)
      });
      await batch.commit();

      await recalculateBalances(user.uid);
      setPendingTransaction(null);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setError(e.issues[0]?.message || 'Dados inválidos');
      } else {
        handleFirestoreError(e, OperationType.WRITE, 'transactions');
      }
    }
  }, [pendingTransaction, user, rawAssets, recalculateBalances]);

  // Importação de Planilhas
  const handleFileUpload = useCallback(async (file: File) => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer | null;
          if (!buffer) return;

          const userId = user?.uid;
          if (!userId) return;

          const XLSX = await import('xlsx');
          const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
          const firstSheet = wb.SheetNames[0];
          const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet]) as Array<Record<string, unknown>>;

          const parsedList = rawRows
            .map(row => mapSpreadsheetRow(row))
            .filter((t): t is NonNullable<typeof t> => t !== null)
            .filter(t => t.label.trim().length > 0 && Number.isFinite(t.value) && t.value > 0);

          if (parsedList.length === 0) {
            setError('Nenhuma transação válida encontrada na planilha.');
            return;
          }

          const now = new Date();
          const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          const batch = writeBatch(db);

          parsedList.forEach(t => {
            const txDate = t.date instanceof Date && !Number.isNaN(t.date.getTime()) ? t.date : now;
            const isFuture = txDate.getTime() > endOfToday.getTime();
            const type = t.type === 'in' || t.type === 'out' || t.type === 'yield' ? t.type : 'out';
            const docRef = doc(collection(db, 'transactions'));
            batch.set(docRef, {
              ...t,
              type,
              uid: userId,
              date: Timestamp.fromDate(txDate),
              applied: !isFuture,
              status: isFuture ? 'Futuro' : 'Confirmado',
            });
          });
          await batch.commit();
          await recalculateBalances(userId);
        } catch (e: any) {
          setError(`Erro ao processar planilha: ${e.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    setIsProcessingIA(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const result = await extractDocument(getGeminiApiKey(), {
            data: base64Data,
            mimeType: file.type
          });
          setPendingTransaction({
            label: result.label || 'Transação Importada',
            value: result.value || 0,
            type: result.type || 'out',
            categoria_primaria: result.category || 'Geral',
            date: new Date()
          });
        } catch (err) {
          if (err instanceof MissingApiKeyError || err instanceof InvalidApiKeyError) {
            setApiKeyError(err.message);
          } else {
            setError(getAiErrorMessage(err, settings?.language || 'pt-BR'));
          }
        } finally {
          setIsProcessingIA(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      if (err instanceof MissingApiKeyError || err instanceof InvalidApiKeyError) {
        setApiKeyError(err.message);
      } else {
        setError(getAiErrorMessage(err, settings?.language || 'pt-BR'));
      }
      setIsProcessingIA(false);
    }
  }, [user, getGeminiApiKey, recalculateBalances, settings?.language]);

  const assetsValueAt = useCallback((date: Date) => {
    return rawAssets.reduce((sum, asset) => {
      const anchor = parseAssetDate(asset.manualBalanceDate);
      const hasMovement = anchor && transactions
        ? hasAssetMovementSince(asset, transactions, anchor)
        : false;
      return sum + enrichAsset(asset, marketRate.cdiAnnualPercent, date, hasMovement, transactions).currentValue;
    }, 0);
  }, [rawAssets, transactions, marketRate.cdiAnnualPercent]);

  // Cálculos de Métricas
  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentTotals = calculateTotals(transactions, currentMonth, currentYear, assets);
    const prevTotals = calculateTotals(transactions, prevMonth, prevYear, assets);

    const monthBalance = calculateMonthBalance(transactions, currentMonth, currentYear);
    const netWorth = calculateNetWorth(assets, transactions, currentMonth, currentYear, assetsValueAt);
    const previousNetWorth = calculateNetWorth(assets, transactions, prevMonth, prevYear, assetsValueAt);

    const investmentAssets = assets.filter(a => a.type === 'investment');
    const investedCost = investmentAssets.reduce((acc, a) => acc + (a.valorInvestido ?? a.value ?? 0), 0);

    return {
      in: {
        total: currentTotals.in,
        var: calculateVariation(currentTotals.in, prevTotals.in),
        trend: currentTotals.in >= prevTotals.in ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'in', now)
      },
      out: {
        total: currentTotals.out,
        var: calculateVariation(currentTotals.out, prevTotals.out),
        trend: currentTotals.out >= prevTotals.out ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'out', now)
      },
      yield: {
        total: currentTotals.yield,
        var: calculateVariation(currentTotals.yield, prevTotals.yield),
        trend: currentTotals.yield >= prevTotals.yield ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'yield', now)
      },
      monthBalance,
      netWorth,
      netWorthVar: calculateVariation(netWorth, previousNetWorth),
      netWorthTrend: netWorth >= previousNetWorth ? ('up' as const) : ('down' as const),
      investments: currentTotals.investments,
      investmentsVar: calculateVariation(currentTotals.investments, investedCost),
      investmentsTrend: currentTotals.investments >= investedCost ? ('up' as const) : ('down' as const),
      investmentsData: investmentAssets.map(a => ({ v: a.value ?? 0 }))
    };
  }, [transactions, assets, assetsValueAt]);

  const chartData = useMemo(() => {
    return calculateEvolutionData(
      rawAssets,
      transactions,
      { period: 'Meses', month: 'Atual', day: 'Todos' },
      { assetsValueAt }
    );
  }, [rawAssets, transactions, assetsValueAt]);

  const projectionData = useMemo(() => {
    return calculateNetWorthProjection({
      assets,
      transactions,
      cdiAnnualPercent: marketRate.cdiAnnualPercent,
    });
  }, [assets, transactions, marketRate.cdiAnnualPercent]);

  const portfolioAllocationPercent = useMemo(() => {
    const total = assets.reduce((acc, asset) => acc + (Number(asset?.value) || 0), 0);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((metrics.investments / total) * 100)));
  }, [assets, metrics.investments]);

  const cashFlowData = useMemo(() => {
    return calculateCashFlowData(transactions);
  }, [transactions]);

  const t = useCallback((pt: string, en: string) => {
    return settings?.language === 'en-US' ? en : pt;
  }, [settings?.language]);

  const goals = useMemo(
    () => resolveGoalTargets(settings?.zenith_config?.goals),
    [settings?.zenith_config?.goals]
  );

  const updateGoals = useCallback(async (next: Partial<FinancialGoalTargets>) => {
    if (!user) return;
    const resolved = resolveGoalTargets(next);

    await updateDoc(doc(db, 'settings', user.uid), {
      'zenith_config.goals': resolved,
    }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${user.uid}`));

    setSettings(prev => {
      if (!prev) return prev;
      const nextConfig: NonNullable<Settings['zenith_config']> = {
        ...(prev.zenith_config as NonNullable<Settings['zenith_config']>),
        goals: resolved,
      };
      try {
        localStorage.setItem(`zenith_config_${user.uid}`, JSON.stringify(nextConfig));
      } catch (e) {
        console.warn('Storage failed:', e);
      }
      return { ...prev, zenith_config: nextConfig };
    });
  }, [user]);

  return {
    user,
    profile,
    assets,
    transactions,
    ddas,
    settings,
    privacyMode,
    isAuthReady,
    userRules,
    notifications,
    investorProfile,
    setInvestorProfile,
    isBiometryModalOpen,
    setIsBiometryModalOpen,
    marketRate,
    error,
    setError,
    firestoreIssues,
    setFirestoreIssues,
    geminiApiKey,
    apiKeyError,
    setApiKeyError,
    pendingTransaction,
    setPendingTransaction,
    isProcessingIA,
    setIsProcessingIA,
    metrics,
    chartData,
    projectionData,
    cashFlowData,
    portfolioAllocationPercent,
    goals,
    updateGoals,
    t,
    getGeminiApiKey,
    togglePrivacyMode,
    handleSaveProfile,
    handleSaveApiKey,
    handleGoogleLogin,
    handleEmailLogin,
    handleRegister,
    handleLogout,
    handleAcceptDDA,
    handleRejectDDA,
    recalculateBalances,
    moveToTrash,
    restoreFromTrash,
    createAsset,
    updateAsset,
    deleteAsset,
    addTransaction,
    updateTransaction,
    confirmPendingTransaction,
    handleFileUpload,
  };
}
