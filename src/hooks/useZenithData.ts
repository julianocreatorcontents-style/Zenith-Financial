import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  collection, doc, setDoc, updateDoc, serverTimestamp,
  handleFirestoreError, OperationType
} from '../firebase';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, User } from 'firebase/auth';
import { 
  CachedAuthUser, 
  getSyncCachedUser, 
  getCachedUser, 
  saveCachedUser, 
  clearCachedUser 
} from '../lib/authSession';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GEMINI_API_KEY_STORAGE,
  MissingApiKeyError,
  clearAIApiKey,
  redactApiKey,
} from '../lib/ai';
import { friendlyFirebaseError } from '../lib/errorUtils';
import { deleteAccount } from '../lib/deleteAccount';
import { 
  calculateTotals, 
  calculateVariation, 
  getMiniChartData, 
  calculateEvolutionData, 
  calculateCashFlowData,
  calculateMonthBalance,
  calculateNetWorth,
  resolveGoalTargets,
  hasAssetMovementSince,
} from '../lib/finance';
import type { FinancialGoalTargets } from '../lib/finance';
import { calculateNetWorthProjection } from '../lib/adapters/netWorthProjection';
import { enrichAsset, parseAssetDate } from '../lib/adapters/assetYieldService';
import { getCachedCdiRate, fetchLiveCdiRate } from '../lib/adapters/marketRateService';
import type { MarketRateState } from '../lib/adapters/marketRateService';
import type { DDA, Settings } from '../types/app';

import { useUserSettings, DEFAULT_SETTINGS } from './useUserSettings';
import { useTransactionsData } from './useTransactionsData';
import { useAssetsData } from './useAssetsData';
import { useAuxiliaryData } from './useAuxiliaryData';

export interface FirestoreIssue {
  id: string;
  code: string;
  operationType: string;
  path: string | null;
  timestamp: string;
}

export type ZenithUser = User | CachedAuthUser;

export { DEFAULT_SETTINGS };

export function useZenithData() {
  const [user, setUser] = useState<ZenithUser | null>(() => auth.currentUser || getSyncCachedUser());
  const [isAuthReady, setIsAuthReady] = useState(() => Boolean(auth.currentUser || getSyncCachedUser()));
  const [marketRate, setMarketRate] = useState<MarketRateState>(getCachedCdiRate);
  const [error, setError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try {
      return localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Sub-hook: Configurações, Perfil e Preferências
  const {
    settings,
    setSettings,
    profile,
    setProfile,
    privacyMode,
    setPrivacyMode,
    investorProfile,
    setInvestorProfile,
    isBiometryModalOpen,
    setIsBiometryModalOpen,
  } = useUserSettings(user);

  const handleSaveProfile = useCallback(
    async (data: any) => {
      if (!user) return;
      const { uid: _uid, pix_key: _pixKey, ...updateData } = data;
      await updateDoc(doc(db, 'users', user.uid), updateData).catch((e) =>
        handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`)
      );
    },
    [user]
  );

  // Sub-hook: Dados Auxiliares (Notificações, DDA, Regras, Diagnósticos)
  const {
    notifications,
    setNotifications: _setNotifications,
    ddas,
    setDdas: _setDdas,
    userRules,
    setUserRules: _setUserRules,
    firestoreIssues,
    setFirestoreIssues,
  } = useAuxiliaryData(user);

  // CDI Live Fetcher
  useEffect(() => {
    let isMounted = true;
    fetchLiveCdiRate()
      .then((rate) => {
        if (!isMounted) return;
        setMarketRate(rate);
      })
      .catch((e) => {
        console.warn('[MarketRate] Usando fallback estático:', e);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Sub-hooks de Ativos e Transações
  const [currentRawAssets, setCurrentRawAssets] = useState<import('../types/app').Asset[]>([]);

  const {
    transactions,
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
  } = useTransactionsData({ user, rawAssets: currentRawAssets, setError });

  const {
    rawAssets,
    assets,
    createAsset,
    updateAsset,
    deleteAsset,
  } = useAssetsData(user, transactions, marketRate.cdiAnnualPercent);

  useEffect(() => {
    setCurrentRawAssets(rawAssets);
  }, [rawAssets]);

  // Auth State Listener
  useEffect(() => {
    getCachedUser().then((cached) => {
      if (cached && !auth.currentUser) {
        setUser(cached);
        setIsAuthReady(true);
      }
    });

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        saveCachedUser(firebaseUser);
        setUser(firebaseUser);
      } else {
        clearCachedUser();
        setUser(null);
      }
      setIsAuthReady(true);
    });
    return unsub;
  }, []);

  // Alternar modo de privacidade
  const togglePrivacyMode = useCallback(() => {
    const newVal = !privacyMode;
    setPrivacyMode(newVal);
    if (user) {
      updateDoc(doc(db, 'settings', user.uid), {
        privacyMode: newVal,
        updatedAt: serverTimestamp(),
      }).catch((e) => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
    }
  }, [privacyMode, user, setPrivacyMode]);

  // Ações de DDA
  const handleAcceptDDA = useCallback(
    async (dda: DDA) => {
      if (!user) return;
      try {
        await updateDoc(doc(db, 'ddas', dda.id), { status: 'accepted' });
        const txRef = doc(collection(db, 'transactions'));
        await setDoc(txRef, {
          label: `DDA: ${dda.beneficiary}`,
          value: dda.value,
          type: 'out',
          date: serverTimestamp(),
          uid: user.uid,
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'transactions');
      }
    },
    [user]
  );

  const handleRejectDDA = useCallback(async (dda: DDA) => {
    try {
      await updateDoc(doc(db, 'ddas', dda.id), { status: 'rejected' });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'ddas');
    }
  }, []);

  // Chave Gemini
  const handleSaveApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    const persist = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const { Preferences } = await import('@capacitor/preferences');
          await Preferences.set({ key: GEMINI_API_KEY_STORAGE, value: trimmed });
        } else {
          localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmed);
        }
      } catch {
        // Fallback em memória
      }
    };
    persist();
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
        const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true }).catch(
          async (error) => {
            const message = String(error?.message ?? error);
            const isReauthError = message.includes('[16]') || /account reauth/i.test(message);
            if (!isReauthError) throw error;
            return FirebaseAuthentication.signInWithGoogle({
              skipNativeAuth: true,
              useCredentialManager: false,
            });
          }
        );

        const idToken = result.credential?.idToken;
        if (!idToken) {
          throw new Error('O Google não retornou um token de identidade.');
        }
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (e: unknown) {
      const message = String((e as Error)?.message ?? e);
      if (message.includes('[16]') || /account reauth/i.test(message)) {
        setError(
          'Falha de autenticação com o Google (erro 16). Instale o APK mais recente, confirme a conta Google no dispositivo e tente novamente.'
        );
      } else {
        setError(friendlyFirebaseError(e));
      }
    }
  }, []);

  const handleEmailLogin = useCallback(async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: unknown) {
      setError(friendlyFirebaseError(e));
    }
  }, []);

  const handleRegister = useCallback(async (name: string, email: string, pass: string) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, { displayName: name });
    } catch (e: unknown) {
      setError(friendlyFirebaseError(e));
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setLogoutError(null);
    try {
      // T3: signOut PRIMEIRO — se falhar, o estado visual permanece coerente com auth.currentUser
      await signOut(auth);
      // Só limpa estado local após signOut confirmar sucesso
      await clearAIApiKey();
      await clearCachedUser();
      setUser(null);
      setProfile(null);
      setGeminiApiKey('');
    } catch (e: unknown) {
      console.error('Erro ao fazer logout:', redactApiKey(e));
      // NÃO limpar estado — manter usuário logado visualmente
      setLogoutError('Não foi possível encerrar a sessão. Tente novamente.');
    }
  }, [setProfile]);

  const handleDeleteAccount = useCallback(
    async (options?: import('../lib/accountDeletion').DeleteAccountOptions): Promise<import('../lib/deleteAccount').AccountDeletionResult> => {
      if (!auth.currentUser) {
        return { status: 'error', success: false, error: 'Usuário não autenticado.' };
      }
      const result = await deleteAccount(auth.currentUser, options);
      if (result.status === 'success') {
        // clearAllLocalUserData já foi chamado pelo executor; apenas sincroniza estado React
        try { await clearCachedUser(); } catch { /* ignore */ }
        setUser(null);
        setProfile(null);
        setGeminiApiKey('');
        // signOut pode falhar silenciosamente – o Auth user já foi deletado
        try { await signOut(auth); } catch { /* ignore */ }
      }
      return result;
    },
    [setProfile]
  );

  // Cálculos de Projeção Patrimonial
  const assetsValueAt = useCallback(
    (date: Date) => {
      return rawAssets.reduce((sum, asset) => {
        const anchor = parseAssetDate(asset.manualBalanceDate);
        const hasMovement = anchor && transactions ? hasAssetMovementSince(asset, transactions, anchor) : false;
        return sum + enrichAsset(asset, marketRate.cdiAnnualPercent, date, hasMovement, transactions).currentValue;
      }, 0);
    },
    [rawAssets, transactions, marketRate.cdiAnnualPercent]
  );

  const metrics = useMemo(() => {
    const now = new Date();
    const [cM, cY] = [now.getMonth(), now.getFullYear()];
    const [pM, pY] = [cM === 0 ? 11 : cM - 1, cM === 0 ? cY - 1 : cY];

    const currentTotals = calculateTotals(transactions, cM, cY, assets);
    const prevTotals = calculateTotals(transactions, pM, pY, assets);
    const monthBalance = calculateMonthBalance(transactions, cM, cY);
    const netWorth = calculateNetWorth(assets, transactions, cM, cY, assetsValueAt);
    const prevNetWorth = calculateNetWorth(assets, transactions, pM, pY, assetsValueAt);

    const investmentAssets = assets.filter((a) => a.type === 'investment');
    const investedCost = investmentAssets.reduce((acc, a) => acc + (a.valorInvestido ?? a.value ?? 0), 0);

    return {
      in: {
        total: currentTotals.in,
        var: calculateVariation(currentTotals.in, prevTotals.in),
        trend: currentTotals.in >= prevTotals.in ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'in', now),
      },
      out: {
        total: currentTotals.out,
        var: calculateVariation(currentTotals.out, prevTotals.out),
        trend: currentTotals.out >= prevTotals.out ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'out', now),
      },
      yield: {
        total: currentTotals.yield,
        var: calculateVariation(currentTotals.yield, prevTotals.yield),
        trend: currentTotals.yield >= prevTotals.yield ? ('up' as const) : ('down' as const),
        data: getMiniChartData(transactions, 'yield', now),
      },
      monthBalance,
      netWorth,
      netWorthVar: calculateVariation(netWorth, prevNetWorth),
      netWorthTrend: netWorth >= prevNetWorth ? ('up' as const) : ('down' as const),
      investments: currentTotals.investments,
      investmentsVar: calculateVariation(currentTotals.investments, investedCost),
      investmentsTrend: currentTotals.investments >= investedCost ? ('up' as const) : ('down' as const),
      investmentsData: investmentAssets.map((a) => ({ v: a.value ?? 0 })),
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
    return calculateNetWorthProjection({ assets, transactions, cdiAnnualPercent: marketRate.cdiAnnualPercent });
  }, [assets, transactions, marketRate.cdiAnnualPercent]);

  const portfolioAllocationPercent = useMemo(() => {
    const total = assets.reduce((acc, asset) => acc + (Number(asset?.value) || 0), 0);
    return total > 0 ? Math.max(0, Math.min(100, Math.round((metrics.investments / total) * 100))) : 0;
  }, [assets, metrics.investments]);

  const cashFlowData = useMemo(() => calculateCashFlowData(transactions), [transactions]);

  const t = useCallback(
    (pt: string, en: string) => (settings?.language === 'en-US' ? en : pt),
    [settings?.language]
  );

  const goals = useMemo(() => resolveGoalTargets(settings?.zenith_config?.goals), [settings?.zenith_config?.goals]);

  const updateGoals = useCallback(
    async (next: Partial<FinancialGoalTargets>) => {
      if (!user) return;
      const resolved = resolveGoalTargets(next);

      await updateDoc(doc(db, 'settings', user.uid), {
        'zenith_config.goals': resolved,
      }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, `settings/${user.uid}`));

      setSettings((prev) => {
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
    },
    [user, setSettings]
  );

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
    logoutError,
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
    handleDeleteAccount,
    handleAcceptDDA,
    handleRejectDDA,
    recalculateBalances,
    moveToTrash,
    restoreFromTrash,
    createAsset,
    updateAsset,
    deleteAsset,
    addTransaction,
    addTransfer,
    updateTransaction,
    confirmPendingTransaction,
    handleFileUpload,
  };
}
