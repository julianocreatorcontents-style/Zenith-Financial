import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp,
  handleFirestoreError, OperationType, getDocs, writeBatch, limit,
  FIRESTORE_ERROR_EVENT
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

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  language: 'pt-BR',
  privacyMode: false,
  activeWidgets: ['all'],
  yieldColor: '#00FFA3',
  granularity: 'month',
  customTerms: {},
  zenith_config: {
    master_states: {
      modo_privacidade: false,
      insights_ia_ativo: true,
      idioma: 'pt-BR',
      tema_global: 'Escuro',
      dashboard_management_expanded: false
    },
    categories: {
      'Alimentação': { id: 'Alimentação', nome: 'Alimentação', cor_destaque: { hex: '#FF5722' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Moradia': { id: 'Moradia', nome: 'Moradia', cor_destaque: { hex: '#2196F3' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Transporte': { id: 'Transporte', nome: 'Transporte', cor_destaque: { hex: '#4CAF50' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Lazer': { id: 'Lazer', nome: 'Lazer', cor_destaque: { hex: '#9C27B0' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} },
      'Saúde': { id: 'Saúde', nome: 'Saúde', cor_destaque: { hex: '#E91E63' }, visivel_no_dash: true, config_avancada: {}, ia_insights_buffer: {} }
    },
    dashboard_order: [
      'CHART_EVOL_PATRIMONIO',
      'METRIC_ENTRADAS',
      'METRIC_SAIDAS',
      'METRIC_RENDIMENTOS',
      'CHART_ALOC_ATIV',
      'CHART_FLUXO_CAIXA',
      'CHART_DIST_CATEG',
      'CHART_SAZON_MENS',
      'CHART_PREV_CONTAS',
      'CHART_METAS_PROG'
    ]
  }
};

export function useZenithData() {
  const [user, setUser] = useState<ZenithUser | null>(() => auth.currentUser || getSyncCachedUser());
  const [cachedOfflineUser, setCachedOfflineUser] = useState<CachedAuthUser | null>(() => getSyncCachedUser());
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const u = auth.currentUser || getSyncCachedUser();
    if (!u) return null;
    return {
      uid: u.uid,
      displayName: u.displayName || 'Usuário',
      photoURL: u.photoURL || `https://picsum.photos/seed/${u.uid}/100/100`,
      email: u.email || '',
      investor_profile: 'Conservador'
    };
  });
  const [rawAssets, setRawAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ddas, setDdas] = useState<DDA[]>([]);
  const [settings, setSettings] = useState<Settings | null>(() => {
    const u = auth.currentUser || getSyncCachedUser();
    if (!u) return null;
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(`zenith_config_${u.uid}`) : null;
      if (cached) {
        const data = JSON.parse(cached);
        return {
          ...DEFAULT_SETTINGS,
          zenith_config: data,
          privacyMode: data.master_states?.modo_privacidade ?? false
        };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });
  const [privacyMode, setPrivacyMode] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(() => Boolean(auth.currentUser || getSyncCachedUser()));
  const [userRules, setUserRules] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [investorProfile, setInvestorProfile] = useState<'Conservador' | 'Sofisticado' | 'Arrojado'>('Conservador');
  const [isBiometryModalOpen, setIsBiometryModalOpen] = useState(false);
  const [marketRate, setMarketRate] = useState<MarketRateState>(getCachedCdiRate);
  const [error, setError] = useState<string | null>(null);
  const [firestoreIssues, setFirestoreIssues] = useState<FirestoreIssue[]>([]);
  
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
        setCachedOfflineUser(cached);
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
        setCachedOfflineUser(toCache);
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

  // 3. Profile Listener
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      try {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile({ ...data, uid: snap.id });
          if (data.investor_profile) setInvestorProfile(data.investor_profile);
        } else if (typeof navigator === 'undefined' || navigator.onLine) {
          const initialProfile: any = {
            uid: user.uid,
            displayName: user.displayName || 'Usuário',
            photoURL: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`,
            email: user.email || '',
            investor_profile: 'Conservador',
            createdAt: serverTimestamp(),
            authProvider: user.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email'
          };
          setDoc(doc(db, 'users', user.uid), initialProfile).then(() => {
            try {
              const biometryDecision = localStorage.getItem(`biometry_${user.uid}`);
              if (!biometryDecision && typeof window !== 'undefined' && window.PublicKeyCredential) {
                setIsBiometryModalOpen(true);
              }
            } catch (e) {
              console.warn("localStorage blocked:", e);
            }
          }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
        }
      } catch (e) {
        console.error("Error in profile listener:", e);
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}`));
    return unsub;
  }, [user]);

  // 4. Assets Listener
  useEffect(() => {
    if (!user) {
      setRawAssets([]);
      return;
    }
    const q = query(collection(db, 'assets'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
      setRawAssets(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'assets'));
    return unsub;
  }, [user]);

  // Dynamic enrichment: compounds daily yield from deposit date to today
  const assets = useMemo(() => {
    return rawAssets.map(asset => enrichAsset(asset, marketRate.cdiAnnualPercent));
  }, [rawAssets, marketRate.cdiAnnualPercent]);

  // 5. Transactions Listener
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }
    // Query sem orderBy composto para garantir funcionamento no Spark Plan sem exigir índice manual
    const q = query(collection(db, 'transactions'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      docs.sort((a, b) => {
        const da = parseTransactionDate(a.date || a.createdAt)?.getTime() || 0;
        const db = parseTransactionDate(b.date || b.createdAt)?.getTime() || 0;
        return db - da;
      });
      setTransactions(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'transactions'));
    return unsub;
  }, [user]);

  // 6. Settings Listener
  useEffect(() => {
    if (!user) {
      setSettings(null);
      return;
    }

    try {
      const cached = localStorage.getItem(`zenith_config_${user.uid}`);
      if (cached) {
        const data = JSON.parse(cached);
        setSettings({ 
          ...DEFAULT_SETTINGS,
          zenith_config: data,
          privacyMode: data.master_states?.modo_privacidade ?? false
        });
        setPrivacyMode(data.master_states?.modo_privacidade ?? false);
      } else {
        setSettings((curr) => curr || DEFAULT_SETTINGS);
      }
    } catch (e) {
      console.warn("Failed to load cached settings:", e);
      setSettings((curr) => curr || DEFAULT_SETTINGS);
    }

    const unsub = onSnapshot(doc(db, 'settings', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Settings;
        setSettings(data);
        setPrivacyMode(data.privacyMode);
        
        if (data.zenith_config) {
          try {
            localStorage.setItem(`zenith_config_${user.uid}`, JSON.stringify(data.zenith_config));
          } catch (e) {
            console.warn("Storage failed:", e);
          }
        }
      } else if (typeof navigator === 'undefined' || navigator.onLine) {
        setDoc(doc(db, 'settings', user.uid), DEFAULT_SETTINGS).catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `settings/${user.uid}`));
    return unsub;
  }, [user]);

  // 7. Notifications Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
        read: false
      };
      setNotifications([reconciliationNotification, ...realNotifications]);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'notifications'));
    return unsub;
  }, [user]);

  // 8. DDA Listener
  useEffect(() => {
    if (!user) {
      setDdas([]);
      return;
    }
    const q = query(collection(db, 'ddas'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setDdas(snap.docs.map(d => ({ id: d.id, ...d.data() } as DDA)));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'ddas'));
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
      setUserRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };
      setFirestoreIssues(prev => [issue, ...prev].slice(0, 5));
    };

    window.addEventListener(FIRESTORE_ERROR_EVENT, handleDiagnostic);
    return () => window.removeEventListener(FIRESTORE_ERROR_EVENT, handleDiagnostic);
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
      setCachedOfflineUser(null);
      setUser(null);
      setProfile(null);
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  }, []);

  const handleOfflineLogin = useCallback(async () => {
    const cached = await getCachedUser();
    if (cached) {
      setUser(cached);
      setIsAuthReady(true);
    } else {
      const guestUser: CachedAuthUser = {
        uid: 'offline_user',
        email: 'offline@zenith.local',
        displayName: 'Usuário Offline',
        photoURL: null,
        isOffline: true
      };
      await saveCachedUser(guestUser);
      setCachedOfflineUser(guestUser);
      setUser(guestUser);
      setIsAuthReady(true);
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
    const updatePayload = {
      ...data,
      investmentStartDate: data.investmentStartDate ?? new Date(),
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
          const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet]) as any[];

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
    return rawAssets.reduce(
      (sum, asset) => sum + enrichAsset(asset, marketRate.cdiAnnualPercent, date).currentValue,
      0
    );
  }, [rawAssets, marketRate.cdiAnnualPercent]);

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
        data: getMiniChartData(transactions, 'in')
      },
      out: {
        total: currentTotals.out,
        var: calculateVariation(currentTotals.out, prevTotals.out),
        trend: currentTotals.out >= prevTotals.out ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'out')
      },
      yield: {
        total: currentTotals.yield,
        var: calculateVariation(currentTotals.yield, prevTotals.yield),
        trend: currentTotals.yield >= prevTotals.yield ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'yield')
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
    handleOfflineLogin,
    cachedOfflineUser,
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
