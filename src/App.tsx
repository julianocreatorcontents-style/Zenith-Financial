/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CreditCard, TrendingUp,
  LayoutGrid, Plus, AlertCircle, Sparkles, ShieldCheck
} from 'lucide-react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp,
  handleFirestoreError, OperationType, getDocs, writeBatch, limit,
  FIRESTORE_ERROR_EVENT
} from './firebase';
import { Timestamp } from 'firebase/firestore';
import {
  extractDocument,
  getAiErrorMessage,
  GEMINI_API_KEY_STORAGE,
  MissingApiKeyError,
  InvalidApiKeyError,
} from './lib/ai';
import { TransactionSchema } from './lib/validations';
import { z } from 'zod';
import { 
  calculateTotals, 
  calculateVariation, 
  getMiniChartData, 
  calculateEvolutionData, 
  calculateCashFlowData,
  calculateMonthBalance,
  calculateNetWorth
} from './lib/finance';
import { onAuthStateChanged, User } from 'firebase/auth';
import LoadingSpinner from './components/LoadingSpinner';
import { calculateNetWorthProjection } from "./lib/adapters/netWorthProjection";
import { getCachedCdiRate, fetchLiveCdiRate } from "./lib/adapters/marketRateService";
import type { MarketRateState } from "./lib/adapters/marketRateService";
import { mapSpreadsheetRow } from "./lib/spreadsheetParser";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProfileDrawer } from "./components/drawers/ProfileDrawer";
import { AddTransactionModal } from "./components/modals/AddTransactionModal";
import { IngestionHub, ReviewModal } from "./components/modals/IngestionModals";
import { AssetModal, AddAssetModal, AssetDeepDiveModal } from "./components/modals/AssetModals";
import { CategoryDetailModal } from "./components/modals/CategoryDetailModal";
import { NavItem } from "./components/layout/NavItem";
import { HomeView } from "./views/HomeView";
import { WalletTransactionsView as DetalhesGastosPage } from "./views/WalletTransactionsView";
import { InvestmentsView } from "./views/InvestmentsView";
import { AuthView } from "./views/AuthView";
import { Asset, UserProfile, Transaction, DDA, Settings } from "./types/app";

const StorageTrashView = lazy(() => import('./views/StorageTrashView'));
const ZenithIAView = lazy(() => import('./views/ZenithIAView'));

// --- UTILS ---
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

export default function ZenithApp() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [forceCreateInvestment, setForceCreateInvestment] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ddas, setDdas] = useState<DDA[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [chartFilter] = useState({ period: 'Meses', month: 'Atual', day: 'Todos' });
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isEditingTransaction, setIsEditingTransaction] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [userRules, setUserRules] = useState<any[]>([]);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [drawerPageRequest, setDrawerPageRequest] = useState<'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash'>('menu');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isIngestionHubOpen, setIsIngestionHubOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<any>(null);
  const [isProcessingIA, setIsProcessingIA] = useState(false);
  const [isBiometryModalOpen, setIsBiometryModalOpen] = useState(false);
  const [chartFilterValue, setChartFilterValue] = useState<{ type: 'category' | 'asset' | null, value: string | null }>({ type: null, value: null });
  const [evolutionView, setEvolutionView] = useState<'historico' | 'projecao'>('historico');
  const [projectionTaxMode, setProjectionTaxMode] = useState<'liquido' | 'bruto'>('liquido');
  const [marketRate, setMarketRate] = useState<MarketRateState>(getCachedCdiRate);

  useEffect(() => {
    let mounted = true;
    fetchLiveCdiRate().then((res) => {
      if (mounted) setMarketRate(res);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const [isCategoryDetailsOpen, setIsCategoryDetailsOpen] = useState(false);
  const [activeCategoryDetail, setActiveCategoryDetail] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'7' | '15' | '30'>('30');
  const [error, setError] = useState<string | null>(null);
  const [firestoreIssues, setFirestoreIssues] = useState<{ id: string; code: string; operationType: string; path: string | null; timestamp: string }[]>([]);
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try {
      return localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const openDrawer = useCallback((page: 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash' = 'menu') => {
    setDrawerPageRequest(page);
    setIsProfileDrawerOpen(true);
  }, []);

  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentTotals = calculateTotals(transactions, currentMonth, currentYear, assets);
    const prevTotals = calculateTotals(transactions, prevMonth, prevYear, assets);

    const monthBalance = calculateMonthBalance(transactions, currentMonth, currentYear);
    const netWorth = calculateNetWorth(assets, transactions, currentMonth, currentYear);
    const previousNetWorth = calculateNetWorth(assets, transactions, prevMonth, prevYear);

    const investmentAssets = assets.filter(a => a.type === 'investment');
    const investedCost = investmentAssets.reduce((acc, a) => acc + (a.valorInvestido ?? a.value ?? 0), 0);

    return {
      in: {
        total: currentTotals.in,
        var: calculateVariation(currentTotals.in, prevTotals.in),
        trend: currentTotals.in >= prevTotals.in ? 'up' : 'down',
        data: getMiniChartData(transactions, 'in')
      },
      out: {
        total: currentTotals.out,
        var: calculateVariation(currentTotals.out, prevTotals.out),
        trend: currentTotals.out >= prevTotals.out ? 'up' : 'down',
        data: getMiniChartData(transactions, 'out')
      },
      yield: {
        total: currentTotals.yield,
        var: calculateVariation(currentTotals.yield, prevTotals.yield),
        trend: currentTotals.yield >= prevTotals.yield ? 'up' : 'down',
        data: getMiniChartData(transactions, 'yield')
      },
      monthBalance,
      netWorth,
      netWorthVar: calculateVariation(netWorth, previousNetWorth),
      netWorthTrend: netWorth >= previousNetWorth ? 'up' : 'down',
      investments: currentTotals.investments,
      investmentsVar: calculateVariation(currentTotals.investments, investedCost),
      investmentsTrend: currentTotals.investments >= investedCost ? 'up' : 'down',
      investmentsData: investmentAssets.map(a => ({ v: a.value ?? 0 }))
    };
  }, [transactions, assets]);

  const chartData = useMemo(() => calculateEvolutionData(assets, transactions, chartFilter), [assets, transactions, chartFilter]);

  const projectionData = useMemo(() => calculateNetWorthProjection({
    assets,
    transactions,
    cdiAnnualPercent: marketRate.cdiAnnualPercent,
  }), [assets, transactions, marketRate.cdiAnnualPercent]);

  const portfolioAllocationPercent = useMemo(() => {
    const total = assets.reduce((acc, asset) => acc + (Number(asset?.value) || 0), 0);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((metrics.investments / total) * 100)));
  }, [assets, metrics.investments]);

  const [investorProfile, setInvestorProfile] = useState<'Conservador' | 'Sofisticado' | 'Arrojado'>('Conservador');
  const [selectedAssetForDeepDive, setSelectedAssetForDeepDive] = useState<Asset | null>(null);
  const [investmentTab, setInvestmentTab] = useState<'Ativos' | 'Subcategorias' | 'Estratégias'>('Ativos');

  const cashFlowData = useMemo(() => calculateCashFlowData(transactions), [transactions]);
  const [currentTab, setCurrentTab] = useState<'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Armazenamento'>('Início');

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    }, (error) => {
      console.error("Auth Listener Error:", error);
      setIsAuthReady(true);
    });
    
    const timer = setTimeout(() => {
      if (!isAuthReady) {
        console.warn("Auth Listener timeout - proceeding as guest");
        setIsAuthReady(true);
      }
    }, 8000);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // Profile Listener
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      try {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile({ uid: snap.id, ...data });
          if (data.investor_profile) setInvestorProfile(data.investor_profile);
        } else {
          const initialProfile: any = {
            uid: user.uid,
            displayName: user.displayName || 'Usuário',
            photoURL: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`,
            email: user.email || '',
            investor_profile: 'Conservador',
            createdAt: serverTimestamp(),
            authProvider: user.providerData[0]?.providerId === 'google.com' ? 'google' : 'email'
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

  // Assets Listener
  useEffect(() => {
    if (!user) {
      setAssets([]);
      return;
    }
    const q = query(collection(db, 'assets'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
      setAssets(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'assets'));
    return unsub;
  }, [user]);

  // Transactions Listener
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }
    const q = query(collection(db, 'transactions'), where('uid', '==', user.uid), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      setTransactions(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'transactions'));
    return unsub;
  }, [user]);

  // Settings Listener
  useEffect(() => {
    if (!user) {
      setSettings(null);
      return;
    }

    try {
      const cached = localStorage.getItem(`zenith_config_${user.uid}`);
      if (cached) {
        const data = JSON.parse(cached);
        setSettings(prev => prev ? { ...prev, zenith_config: data } : { 
          theme: 'dark', 
          language: 'pt-BR', 
          privacyMode: data.master_states?.modo_privacidade || false,
          activeWidgets: [],
          yieldColor: '#00FF00',
          granularity: 'month',
          customTerms: {},
          zenith_config: data 
        } as Settings);
        setPrivacyMode(data.master_states?.modo_privacidade || false);
      }
    } catch (e) {
      console.warn("Failed to load cached settings:", e);
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
      } else {
        const initialSettings: Settings = {
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
        setDoc(doc(db, 'settings', user.uid), initialSettings).catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `settings/${user.uid}`));
    return unsub;
  }, [user]);

  // Notifications Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'notifications'));
    return unsub;
  }, [user]);

  // DDA Listener
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

  // Firestore Diagnostic Listener
  useEffect(() => {
    const handleDiagnostic = (event: Event) => {
      const customEvent = event as CustomEvent<{ code: string; operationType: string; path: string | null }>;
      if (!customEvent.detail) return;
      const issue = {
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

  const handleFileUpload = async (file: File) => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result;
          if (!buffer) return;

          const XLSX = await import('xlsx');
          const wb = XLSX.read(buffer, { type: 'binary' });
          const firstSheet = wb.SheetNames[0];
          const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet]) as any[];

          const parsedList = rawRows
            .map(row => mapSpreadsheetRow(row))
            .filter((t): t is NonNullable<typeof t> => t !== null);

          if (parsedList.length === 0) {
            setError('Nenhuma transação válida encontrada na planilha.');
            return;
          }

          const batch = writeBatch(db);
          parsedList.forEach(t => {
            const docRef = doc(collection(db, 'transactions'));
            batch.set(docRef, { ...t, uid: user!.uid, date: serverTimestamp() });
          });
          await batch.commit();
          await recalculateBalances(user!.uid);
          setIsIngestionHubOpen(false);
        } catch (e: any) {
          setError(`Erro ao processar planilha: ${e.message}`);
        }
      };
      reader.readAsBinaryString(file);
      return;
    }

    setIsProcessingIA(true);
    setIsIngestionHubOpen(false);
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
            categoria_primaria: result.category || 'Geral'
          });
          setIsReviewModalOpen(true);
        } catch (err) {
          handleAiError(err);
        } finally {
          setIsProcessingIA(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      handleAiError(err);
      setIsProcessingIA(false);
    }
  };

  const handleUniversalIngestion = async (type: 'scanner' | 'upload' | 'spreadsheet' | 'manual') => {
    if (type === 'manual') {
      setIsIngestionHubOpen(false);
      setIsAddingTransaction(true);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    if (type === 'scanner') {
      input.accept = 'image/*';
      input.capture = 'environment';
    } else if (type === 'spreadsheet') {
      input.accept = '.csv, .xlsx, .xls';
    } else {
      input.accept = 'image/*,application/pdf';
    }
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    };
    input.click();
  };

  const confirmPendingTransaction = async (updatedTx?: any) => {
    const dataToSave = updatedTx || pendingTransaction;
    if (!dataToSave || !user) return;
    try {
      const validated = TransactionSchema.parse({
        label: dataToSave.label,
        value: Number(dataToSave.value),
        type: dataToSave.type,
        categoria_primaria: dataToSave.categoria_primaria,
        etiqueta_personalizada: dataToSave.etiqueta_personalizada,
        metodo_origem: dataToSave.metodo_origem,
        date: new Date()
      });

      const newTxRef = doc(collection(db, 'transactions'));
      await setDoc(newTxRef, {
        ...validated,
        uid: user.uid,
        date: serverTimestamp()
      });
      await recalculateBalances(user.uid);
      setIsReviewModalOpen(false);
      setPendingTransaction(null);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setError(e.issues[0]?.message || 'Dados inválidos');
      } else {
        handleFirestoreError(e, OperationType.WRITE, 'transactions');
      }
    }
  };

  const recalculateBalances = async (userId: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('uid', '==', userId), orderBy('date', 'asc'));
      const snap = await getDocs(q);
      let currentBal = 0;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        const tx = d.data() as Transaction;
        if (tx.type === 'in' || tx.type === 'yield') {
          currentBal += tx.value;
        } else if (tx.type === 'out') {
          currentBal -= tx.value;
        }
        batch.update(d.ref, { partialBalance: currentBal });
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'recalculate_balances');
    }
  };

  const t = useCallback((pt: string, en: string) => {
    return settings?.language === 'en-US' ? en : pt;
  }, [settings?.language]);

  const getGeminiApiKey = useCallback(() => {
    const key = geminiApiKey.trim();
    if (!key) {
      throw new MissingApiKeyError();
    }
    return key;
  }, [geminiApiKey]);

  const handleAiError = useCallback((e: unknown) => {
    if (e instanceof MissingApiKeyError || e instanceof InvalidApiKeyError) {
      setApiKeyError(e.message);
      openDrawer('ai_key');
      return;
    }
    setError(getAiErrorMessage(e, settings?.language || 'pt-BR'));
  }, [settings?.language, openDrawer]);

  const handleAcceptDDA = async (dda: DDA) => {
    try {
      await updateDoc(doc(db, 'ddas', dda.id), { status: 'accepted' });
      const txRef = doc(collection(db, 'transactions'));
      await setDoc(txRef, {
        label: `DDA: ${dda.beneficiary}`,
        value: dda.value,
        type: 'out',
        date: serverTimestamp(),
        uid: user!.uid
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions');
    }
  };

  const handleRejectDDA = async (dda: DDA) => {
    try {
      await updateDoc(doc(db, 'ddas', dda.id), { status: 'rejected' });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'ddas');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleEmailLogin = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRegister = async (name: string, email: string, pass: string) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, { displayName: name });
    } catch (e: any) {
      setError(e.message);
    }
  };

  // User Rules Listener
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const handleSaveProfile = useCallback(async (data: any) => {
    if (!user) return;
    const { uid: _uid, pix_key: _pixKey, ...updateData } = data;
    await updateDoc(doc(db, 'users', user.uid), updateData)
      .catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`));
  }, [user]);

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

  const moveToTrash = async (item: any, collectionName: string) => {
    try {
      if (!user) return;
      const batch = writeBatch(db);
      const trashRef = doc(collection(db, 'trash'));
      batch.set(trashRef, {
        originalId: item.id,
        originalCollection: collectionName,
        data: item,
        deletedAt: serverTimestamp(),
        uid: user.uid
      });
      batch.delete(doc(db, collectionName, item.id));

      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${item.id}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        onGoogleLogin={handleGoogleLogin}
        onEmailLogin={handleEmailLogin}
        onRegister={handleRegister}
        error={error}
        onClearError={() => setError(null)}
        language={settings?.language}
      />
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest animate-pulse">
            Sincronizando Zenith Engine...
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans selection:bg-[var(--accent)]/30 pb-32 overflow-x-hidden">
        
        {/* --- HEADER --- */}
        <header className="px-6 py-6 sm:py-8 flex items-center gap-4 max-w-7xl mx-auto">
          <button
            onClick={() => setIsProfileDrawerOpen(true)}
            className="w-11 h-11 shrink-0 rounded-full border border-[var(--border-card)] overflow-hidden hover:border-[var(--accent)] transition-colors"
            aria-label={t('Abrir menu do perfil', 'Open profile menu')}
          >
            <img
              src={profile?.photoURL || user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`}
              alt="Perfil"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-medium text-[var(--text-primary)] truncate">
              {getGreeting()}, {(profile?.displayName || user.displayName || 'Juliano').split(' ')[0]}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 max-w-[280px] leading-tight">
              {t("Sua evolução patrimonial começa com a próxima decisão inteligente.", "Your net worth evolution starts with the next smart decision.")}
            </p>
          </div>
        </header>

        {/* --- CONTEÚDO PRINCIPAL --- */}
        <main className="px-6 pb-32 space-y-6 max-w-7xl mx-auto">
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="text-red-500" size={18} />
                  <p className="text-xs text-red-500 font-medium">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-red-500 hover:bg-red-500/10 p-1 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {firestoreIssues.length > 0 && (
            <div className="fixed bottom-28 left-4 right-4 z-[130] mx-auto max-w-md">
              <div className="bg-[var(--bg-card)] border border-red-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{t("Diagnóstico Firestore", "Firestore Diagnostics")}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const report = firestoreIssues.map(issue => `${issue.code} | ${issue.operationType} | ${issue.path || 'sem caminho'}`).join('\n');
                        if (navigator.clipboard) navigator.clipboard.writeText(report);
                      }}
                      className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-white px-2 py-1 rounded-lg bg-white/5"
                    >
                      {t("Copiar", "Copy")}
                    </button>
                    <button onClick={() => setFirestoreIssues([])} className="text-[var(--text-secondary)] hover:text-white p-1">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {firestoreIssues.map(issue => (
                    <p key={issue.id} className="text-[10px] font-mono leading-relaxed text-[var(--text-secondary)] break-all">
                      {issue.code} | {issue.operationType} | {issue.path || t("sem caminho", "no path")}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentTab === 'Armazenamento' && (
            <Suspense fallback={<LoadingSpinner />}>
              <StorageTrashView user={user} language={settings?.language} />
            </Suspense>
          )}

          {currentTab === 'Início' && (
            <HomeView
              user={user}
              settings={settings}
              assets={assets}
              transactions={transactions}
              ddas={ddas}
              privacyMode={privacyMode}
              onTogglePrivacy={() => {
                const newVal = !privacyMode;
                setPrivacyMode(newVal);
                if (user) {
                  updateDoc(doc(db, 'settings', user.uid), { privacyMode: newVal })
                    .catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
                }
              }}
              metrics={metrics}
              chartData={chartData}
              projectionData={projectionData}
              cashFlowData={cashFlowData}
              evolutionView={evolutionView}
              setEvolutionView={setEvolutionView}
              projectionTaxMode={projectionTaxMode}
              setProjectionTaxMode={setProjectionTaxMode}
              chartFilterValue={chartFilterValue}
              setChartFilterValue={setChartFilterValue}
              marketRate={marketRate}
              forceCreateInvestment={forceCreateInvestment}
              setForceCreateInvestment={setForceCreateInvestment}
              investorProfile={investorProfile}
              portfolioAllocationPercent={portfolioAllocationPercent}
              openDrawer={openDrawer}
              onNavigateTab={setCurrentTab}
              onSelectAsset={setSelectedAsset}
              onAcceptDDA={handleAcceptDDA}
              onRejectDDA={handleRejectDDA}
              onUpdateAsset={async (id: any, data: any) => {
                await updateDoc(doc(db, "assets", id), data).catch((e: any) => handleFirestoreError(e, OperationType.UPDATE, "assets/" + id));
              }}
              onCreateAsset={async (data: any) => {
                await addDoc(collection(db, "assets"), {
                  ...data,
                  uid: auth.currentUser?.uid,
                  createdAt: serverTimestamp()
                }).catch((e: any) => handleFirestoreError(e, OperationType.CREATE, "assets"));
              }}
              t={t}
            />
          )}

          {currentTab === 'Carteira' && (
            <DetalhesGastosPage 
              transactions={transactions}
              language={settings?.language}
              onEdit={(tx: any) => {
                setSelectedTransaction(tx);
                setIsEditingTransaction(true);
              }}
              onDelete={(tx: any) => moveToTrash(tx, 'transactions')}
            />
          )}

          {currentTab === 'Investimentos' && (
            <InvestmentsView 
              assets={assets}
              investorProfile={investorProfile} 
              onAssetClick={(asset) => setSelectedAssetForDeepDive(asset)}
              language={settings?.language}
            />
          )}

          {currentTab === 'IA' && (
            <Suspense fallback={<LoadingSpinner />}>
              <ZenithIAView
                user={user}
                language={settings?.language}
                transactions={transactions}
                assets={assets}
                getApiKey={getGeminiApiKey}
                onApiKeyError={handleAiError}
                userRules={userRules}
              />
            </Suspense>
          )}

          {/* Profile Drawer */}
          <ProfileDrawer 
            isOpen={isProfileDrawerOpen}
            onClose={() => setIsProfileDrawerOpen(false)}
            initialPage={drawerPageRequest}
            profile={profile}
            user={user}
            notifications={notifications}
            language={settings?.language}
            apiKey={geminiApiKey}
            apiKeyError={apiKeyError}
            onClearApiKeyError={() => setApiKeyError(null)}
            onSaveApiKey={handleSaveApiKey}
            onSaveProfile={handleSaveProfile}
            userId={user.uid}
            currentConfig={settings?.zenith_config}
            settingsLanguage={settings?.language}
            onLogout={handleLogout}
          />

          {/* Asset Detail / Edit Modal */}
          {selectedAsset && (
            <AssetModal 
              asset={selectedAsset} 
              onClose={() => setSelectedAsset(null)} 
              privacyMode={privacyMode}
              language={settings.language}
              onDelete={async (id) => {
                await deleteDoc(doc(db, 'assets', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `assets/${id}`));
                setSelectedAsset(null);
              }}
              onSave={async (id, data) => {
                await updateDoc(doc(db, 'assets', id), data).catch(e => handleFirestoreError(e, OperationType.UPDATE, `assets/${id}`));
                setSelectedAsset(null);
              }}
            />
          )}

          {/* Asset Deep Dive Modal */}
          {selectedAssetForDeepDive && (
            <AssetDeepDiveModal 
              asset={selectedAssetForDeepDive} 
              onClose={() => setSelectedAssetForDeepDive(null)} 
              language={settings?.language} 
            />
          )}

          {/* Add Asset Modal */}
          {isAddingAsset && (
            <AddAssetModal 
              onClose={() => setIsAddingAsset(false)}
              language={settings.language}
              investorProfile={investorProfile}
              user={user}
              getApiKey={getGeminiApiKey}
              onApiKeyError={handleAiError}
              onAdd={async (data) => {
                const newAssetRef = doc(collection(db, 'assets'));
                await setDoc(newAssetRef, { ...data, uid: user.uid, createdAt: serverTimestamp() }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'assets'));
                setIsAddingAsset(false);
              }}
            />
          )}

          {/* PÁGINA DETALHES CATEGORIA */}
          <CategoryDetailModal 
            isOpen={isCategoryDetailsOpen}
            onClose={() => setIsCategoryDetailsOpen(false)}
            activeCategoryDetail={activeCategoryDetail}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            onOpenAddMenu={() => setIsAddMenuOpen(true)}
            cashFlowData={cashFlowData}
            metricsOutTotal={metrics.out.total}
            privacyMode={privacyMode}
            transactions={transactions}
          />

          {/* Add Transaction Modal */}
          {isAddingTransaction && (
            <AddTransactionModal 
              onClose={() => setIsAddingTransaction(false)}
              language={settings.language}
              onAdd={async (data) => {
                const newTxRef = doc(collection(db, 'transactions'));
                const txData = { 
                  ...data, 
                  uid: user.uid, 
                  date: data.date ? Timestamp.fromDate(new Date(data.date + 'T12:00:00')) : serverTimestamp() 
                };
                await setDoc(newTxRef, txData).catch(e => handleFirestoreError(e, OperationType.CREATE, 'transactions'));
                await recalculateBalances(user.uid);
                setIsAddingTransaction(false);
              }}
            />
          )}

          {/* Edit Transaction Modal */}
          {isEditingTransaction && selectedTransaction && (
            <AddTransactionModal 
              initialData={selectedTransaction}
              language={settings.language}
              onClose={() => {
                setIsEditingTransaction(false);
                setSelectedTransaction(null);
              }}
              onAdd={async (data) => {
                const txRef = doc(db, 'transactions', selectedTransaction.id);
                const txData = { 
                  ...data, 
                  uid: user.uid, 
                  date: data.date ? Timestamp.fromDate(new Date(data.date + 'T12:00:00')) : serverTimestamp() 
                };
                
                if (selectedTransaction.categoria_primaria !== data.categoria_primaria) {
                  const ruleRef = doc(collection(db, 'user_rules'));
                  await setDoc(ruleRef, {
                    uid: user.uid,
                    pattern: selectedTransaction.label,
                    category: data.categoria_primaria,
                    createdAt: serverTimestamp()
                  }).catch(e => console.error("Error saving rule:", e));
                }

                await updateDoc(txRef, txData).catch(e => handleFirestoreError(e, OperationType.UPDATE, `transactions/${selectedTransaction.id}`));
                await recalculateBalances(user.uid);
                setIsEditingTransaction(false);
                setSelectedTransaction(null);
              }}
            />
          )}

          {/* Biometry Modal */}
          {isBiometryModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 max-w-sm w-full space-y-6 text-center shadow-2xl"
              >
                <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-full flex items-center justify-center mx-auto text-[var(--accent)]">
                  <ShieldCheck size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-[var(--text-primary)]">{t("Ativar Biometria?", "Activate Biometrics?")}</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {t("Deseja ativar o acesso por biometria para facilitar seus próximos logins?", "Would you like to activate biometric access to facilitate your next logins?")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => {
                      try {
                        localStorage.setItem(`biometry_${user?.uid}`, 'later');
                      } catch (e) { console.warn(e); }
                      setIsBiometryModalOpen(false);
                    }}
                    className="py-3 px-4 border border-[var(--border-card)] rounded-2xl text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5 transition-colors"
                  >
                    {t("Mais tarde", "Later")}
                  </button>
                  <button 
                    onClick={() => {
                      try {
                        localStorage.setItem(`biometry_${user?.uid}`, 'enabled');
                        localStorage.setItem(`biometry_active_${user?.uid}`, 'true');
                      } catch (e) { console.warn(e); }
                      setIsBiometryModalOpen(false);
                    }}
                    className="py-3 px-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors shadow-lg shadow-[var(--accent)]/20"
                  >
                    {t("Ativar", "Activate")}
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Ingestion Hub */}
          <IngestionHub 
            isOpen={isIngestionHubOpen} 
            onClose={() => setIsIngestionHubOpen(false)} 
            onProcess={handleUniversalIngestion}
            language={settings.language}
          />

          {/* Review Modal */}
          {isReviewModalOpen && (
            <ReviewModal 
              transaction={pendingTransaction}
              isProcessing={isProcessingIA}
              onConfirm={confirmPendingTransaction}
              onCancel={() => {
                setIsReviewModalOpen(false);
                setPendingTransaction(null);
              }}
              language={settings?.language || 'pt-BR'}
            />
          )}

        </main>

        {/* ADD MENU MODAL */}
        {isAddMenuOpen && (
          <div className="fixed inset-0 z-[150] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm pb-28 transition-opacity" onClick={() => setIsAddMenuOpen(false)}>
            <div className="bg-[var(--bg-card)] w-full max-w-md rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-5" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-[var(--text-primary)] text-center mb-2">O que deseja adicionar?</h3>
                
                <button type="button" onClick={() => { setIsAddMenuOpen(false); setIsIngestionHubOpen(true); }} className="flex items-center gap-4 p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition text-left">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] shrink-0"><LayoutGrid size={20}/></div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">Importar Dados</p>
                    <p className="text-xs text-[var(--text-muted)]">Extratos bancários ou notas</p>
                  </div>
                </button>
    
                <button type="button" onClick={() => { setIsAddMenuOpen(false); setForceCreateInvestment(true); }} className="flex items-center gap-4 p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition text-left">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] shrink-0"><TrendingUp size={20}/></div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">Novo Investimento</p>
                    <p className="text-xs text-[var(--text-muted)]">CDB, Tesouro, 99Pay, etc</p>
                  </div>
                </button>
            </div>
          </div>
        )}
        
        {/* --- NAV DOCK --- */}
        <div className="fixed bottom-0 inset-x-0 p-6 z-40 pointer-events-none">
          <nav className="max-w-md mx-auto h-20 bg-[var(--bg-card)]/95 border border-[var(--border-card)] flex items-center justify-around px-4 rounded-[35px] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] pointer-events-auto">
            <NavItem icon={<LayoutGrid size={24} />} label={t("INÍCIO", "HOME")} active={currentTab === 'Início'} onClick={() => setCurrentTab('Início')} />
            <NavItem icon={<CreditCard size={24} />} label={t("CARTEIRA", "WALLET")} active={currentTab === 'Carteira'} onClick={() => setCurrentTab('Carteira')} />
            
            {/* FAB HUB */}
            <div className="relative -top-6">
              <button 
                onClick={() => setIsAddMenuOpen(true)}
                className="w-16 h-16 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(0,255,163,0.5)] hover:scale-110 transition-transform active:scale-95 pointer-events-auto"
                aria-label="Adicionar"
              >
                <Plus size={32} className="text-[var(--bg-app)]" />
              </button>
            </div>

            <NavItem icon={<TrendingUp size={24} />} label={t("INVEST", "INVEST")} active={currentTab === 'Investimentos'} onClick={() => setCurrentTab('Investimentos')} />
            <NavItem icon={<Sparkles size={24} />} label={t("ZENITH IA", "ZENITH AI")} active={currentTab === 'IA'} onClick={() => setCurrentTab('IA')} />
          </nav>
        </div>

      </div>
    </ErrorBoundary>
  );
}
