import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp,
  handleFirestoreError, OperationType, getDocs, writeBatch, limit,
  FIRESTORE_ERROR_EVENT
} from '../firebase';
import { Timestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { z } from 'zod';
import {
  extractDocument,
  getAiErrorMessage,
  GEMINI_API_KEY_STORAGE,
  MissingApiKeyError,
  InvalidApiKeyError,
} from '../lib/ai';
import { TransactionSchema } from '../lib/validations';
import { 
  calculateTotals, 
  calculateVariation, 
  getMiniChartData, 
  calculateEvolutionData, 
  calculateCashFlowData,
  calculateMonthBalance,
  calculateNetWorth
} from '../lib/finance';
import { calculateNetWorthProjection } from '../lib/adapters/netWorthProjection';
import { enrichAsset } from '../lib/adapters/assetYieldService';
import { getCachedCdiRate, fetchLiveCdiRate } from '../lib/adapters/marketRateService';
import type { MarketRateState } from '../lib/adapters/marketRateService';
import { mapSpreadsheetRow } from '../lib/spreadsheetParser';
import type { Asset, UserProfile, Transaction, DDA, Settings } from '../types/app';

export interface FirestoreIssue {
  id: string;
  code: string;
  operationType: string;
  path: string | null;
  timestamp: string;
}

export function useZenithData() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [rawAssets, setRawAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ddas, setDdas] = useState<DDA[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
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

  // 2. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    }, (authError) => {
      console.error("Auth Listener Error:", authError);
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
    const q = query(collection(db, 'transactions'), where('uid', '==', user.uid), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
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
        setDoc(doc(db, 'settings', user.uid), initialSettings).catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
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
      setNotifications(items.slice(0, 10));
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
        if (tx.type === 'in' || tx.type === 'yield') {
          currentBal += val;
        } else if (tx.type === 'out') {
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

  // Mover para a lixeira com exclusão atômica
  const moveToTrash = useCallback(async (item: any, collectionName: string) => {
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
  }, [user]);

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
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const handleEmailLogin = useCallback(async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const handleRegister = useCallback(async (name: string, email: string, pass: string) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, { displayName: name });
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
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
    const newTxRef = doc(collection(db, 'transactions'));
    const txData = { 
      ...data, 
      uid: user.uid, 
      date: data.date ? Timestamp.fromDate(new Date(data.date + 'T12:00:00')) : serverTimestamp() 
    };
    await setDoc(newTxRef, txData).catch(e => handleFirestoreError(e, OperationType.CREATE, 'transactions'));
    await recalculateBalances(user.uid);
  }, [user, recalculateBalances]);

  const updateTransaction = useCallback(async (selectedTx: any, data: any) => {
    if (!user) return;
    const txRef = doc(db, 'transactions', selectedTx.id);
    const txData = { 
      ...data, 
      uid: user.uid, 
      date: data.date ? Timestamp.fromDate(new Date(data.date + 'T12:00:00')) : serverTimestamp() 
    };
    
    if (selectedTx.categoria_primaria !== data.categoria_primaria) {
      const ruleRef = doc(collection(db, 'user_rules'));
      await setDoc(ruleRef, {
        uid: user.uid,
        pattern: selectedTx.label,
        category: data.categoria_primaria,
        createdAt: serverTimestamp()
      }).catch(e => console.error("Error saving rule:", e));
    }

    await updateDoc(txRef, txData).catch(e => handleFirestoreError(e, OperationType.UPDATE, `transactions/${selectedTx.id}`));
    await recalculateBalances(user.uid);
  }, [user, recalculateBalances]);

  const confirmPendingTransaction = useCallback(async (updatedTx?: any) => {
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
      setPendingTransaction(null);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setError(e.issues[0]?.message || 'Dados inválidos');
      } else {
        handleFirestoreError(e, OperationType.WRITE, 'transactions');
      }
    }
  }, [pendingTransaction, user, recalculateBalances]);

  // Importação de Planilhas
  const handleFileUpload = useCallback(async (file: File) => {
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
        } catch (e: any) {
          setError(`Erro ao processar planilha: ${e.message}`);
        }
      };
      reader.readAsBinaryString(file);
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
            categoria_primaria: result.category || 'Geral'
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
    const netWorth = calculateNetWorth(assets, transactions, currentMonth, currentYear);
    const previousNetWorth = calculateNetWorth(assets, transactions, prevMonth, prevYear);

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
  }, [transactions, assets]);

  const chartData = useMemo(() => {
    return calculateEvolutionData(assets, transactions, { period: 'Meses', month: 'Atual', day: 'Todos' });
  }, [assets, transactions]);

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

  const cashFlowData = useMemo(() => calculateCashFlowData(transactions), [transactions]);

  const t = useCallback((pt: string, en: string) => {
    return settings?.language === 'en-US' ? en : pt;
  }, [settings?.language]);

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
    createAsset,
    updateAsset,
    deleteAsset,
    addTransaction,
    updateTransaction,
    confirmPendingTransaction,
    handleFileUpload,
  };
}
