/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, Eye, EyeOff, MoreVertical, ShieldCheck, 
  ArrowUpRight, ArrowLeft, X, CreditCard, Landmark, Car,
  PieChart, Briefcase, TrendingUp, MoreHorizontal,
  ArrowRightLeft, LayoutGrid, LogIn, LogOut, Plus, Trash2, Edit2, Save, User as UserIcon,
  FileUp, Loader2, Settings as SettingsIcon, Check, ChevronRight, Palette, Globe, Layout,
  BarChart as BarChartIcon, Sparkles, Copy, CircleCheck, BellOff, UserPlus, ClipboardCheck,
  QrCode, FileText, Table, Edit3, Camera, Upload, AlertCircle, Search, Zap, Users,
  History, KeyRound, HardDrive
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart as RePieChart, Pie, Cell, BarChart, Bar, ReferenceLine
} from 'recharts';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp,
  handleFirestoreError, OperationType, getDocs, getDoc, getDocFromServer, writeBatch, limit,
  FIRESTORE_ERROR_EVENT
} from './firebase';
import { Timestamp } from 'firebase/firestore';
import {
  extractTransaction,
  extractDocument,
  extractAssets,
  getAiErrorMessage,
  GEMINI_API_KEY_STORAGE,
  MissingApiKeyError,
  InvalidApiKeyError,
} from './lib/ai';
import { TransactionSchema } from './lib/validations';
import { z } from 'zod';
import { 
  calculateTotals, 
  calculateRealProfitability,
  calculateVariation, 
  getMiniChartData, 
  calculateEvolutionData, 
  calculateCashFlowData,
  calculateMonthBalance,
  calculateNetWorth
} from './lib/finance';
import { onAuthStateChanged, User } from 'firebase/auth';
import ColorPicker from './components/ColorPicker';
import LoadingSpinner from './components/LoadingSpinner';
import Modal from './components/ui/Modal';
import { checkDuplicates } from './lib/dataUtils';
import StorageTrashView from './views/StorageTrashView';
import { YieldProjectionCard } from "./views/YieldProjectionCard";
import { calculateNetWorthProjection } from "./lib/adapters/netWorthProjection";

const HeritageSettings = lazy(() =>
  import('./components/HeritageSettings').then((module) => ({ default: module.HeritageSettings }))
);
const ZenithIAView = lazy(() => import('./views/ZenithIAView'));

// --- TYPES ---
type AssetType = 'liquidity' | 'investment' | 'physical';

interface Asset {
  id: string;
  name: string;
  value: number;
  type: AssetType;
  detail: string;
  uid: string;
  emissor?: string;
  valorInvestido?: number;
  taxaInflacao?: number;
  vencimento?: any;
  subcategoria?: string;
  estrategia?: string;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  cpf?: string;
  investor_profile?: 'Conservador' | 'Sofisticado' | 'Arrojado';
}

interface Transaction {
  id: string;
  label: string;
  value: number;
  type: 'in' | 'out' | 'yield';
  date: any; // Firestore timestamp
  uid: string;
  category?: string;
  partialBalance?: number;
  categoria_primaria?: string;
  etiqueta_personalizada?: string;
  metodo_origem?: string;
  status?: 'Confirmado' | 'Futuro';
  contexto_ia?: {
    insight: string;
    tendencia: 'Alta' | 'Baixa' | 'Estável';
  };
}

interface DDA {
  id: string;
  beneficiary: string;
  value: number;
  dueDate: any;
  status: 'pending' | 'accepted' | 'rejected';
  uid: string;
  cpf?: string;
}

interface ColorValue {
  hex: string;
  opacity?: number;
  label?: string;
}

interface AdvancedInterface {
  interface_estilo?: string;
  cor_texto?: string;
  cor_numeros?: string;
  cor_componentes?: string;
  tipo_grafico?: string;
  fundo_grafico_estilo?: string;
  fundo_opacidade?: number;
  cor_texto_grafico?: string;
  [key: string]: any;
}

interface CategorySlot {
  id: string;
  nome: string;
  cor_destaque: ColorValue;
  visivel_no_dash: boolean;
  config_avancada: AdvancedInterface;
  ia_insights_buffer: Record<string, any>;
}

interface MasterStates {
  modo_privacidade: boolean;
  insights_ia_ativo: boolean;
  idioma: string;
  tema_global: 'Escuro' | 'Claro' | 'Contraste';
  dashboard_management_expanded: boolean;
}

interface ChartSlot {
  id: string;
  label: string;
  visible: boolean;
  type: string;
  visualType?: 'Candles' | 'Linha' | 'Área' | 'Barra' | 'Coluna';
  color?: string;
  opacity?: number;
  isGradient?: boolean;
  granularity?: 'Ano' | 'Mês' | 'Dia';
  timeframe?: '7D' | '15D' | '30D' | '6M' | '1A';
  predictiveInsights?: boolean;
  tooltipsEnabled?: boolean;
  touchToZoom?: boolean;
}

interface ZenithConfig {
  master_states: MasterStates;
  categories: Record<string, CategorySlot>;
  charts?: Record<string, ChartSlot>;
  metrics?: Record<string, ChartSlot>;
  dashboard_order?: string[];
}

interface Settings {
  theme: 'dark' | 'light' | 'high-contrast';
  language: 'pt-BR' | 'en-US';
  privacyMode: boolean;
  activeWidgets: string[];
  yieldColor: string;
  granularity: 'day' | 'month' | 'year';
  customTerms: Record<string, string>;
  zenith_config?: ZenithConfig;
  ui_config?: any; // Keep for backward compatibility during transition
}

// --- UTILS ---
const SPREADSHEET_FIELDS: Record<string, string> = {
  data: 'date', date: 'date', data_evento: 'date', data_da_transacao: 'date',
  data_transacao: 'date', data_compra: 'date', data_de_compra: 'date',
  data_da_compra: 'date', data_pagamento: 'date', data_lancamento: 'date',
  data_movimento: 'date', data_operacao: 'date', competencia: 'date',
  vencimento: 'date', due_date: 'date',
  descricao: 'label', descricao_transacao: 'label', descricao_do_lancamento: 'label',
  titulo: 'label', title: 'label', label: 'label', estabelecimento: 'label',
  historico: 'label', lancamento: 'label', memo: 'label', name: 'label',
  nome: 'label', details: 'label',
  valor: 'value', value: 'value', valor_nominal: 'value', amount: 'value',
  montante: 'value', quantia: 'value', total: 'value', valor_transacao: 'value',
  valor_da_transacao: 'value', valor_total: 'value',
  tipo: 'type', type: 'type', entrada_saida: 'type', natureza: 'type',
  operacao: 'type', transaction_type: 'type', debito_credito: 'type',
  categoria: 'category', categoria_primaria: 'category', categoria_de_gasto: 'category',
  category: 'category', grupo: 'category', classificacao: 'category',
  etiqueta: 'tag', etiqueta_personalizada: 'tag', tag: 'tag', tags: 'tag',
  metodo: 'method', metodo_origem: 'method', method: 'method',
  forma_pagamento: 'method', forma_de_pagamento: 'method', origem: 'method',
  payment_method: 'method',
  status: 'status', situacao: 'status'
};

function normalizeSpreadsheetKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseSpreadsheetAmount(value: unknown): number {
  if (typeof value === 'number') return value;

  const raw = String(value ?? '').trim();
  if (!raw) return NaN;

  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned) return NaN;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\./g, '');
  } else if (/^\d{1,3}\.\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace('.', '');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  return negative ? -Math.abs(parsed) : parsed;
}

function parseSpreadsheetDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86400000 + 12 * 3600000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  const dayFirst = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dayFirst) {
    let year = Number(dayFirst[3]);
    if (year < 100) year += 2000;
    const month = Number(dayFirst[2]);
    const day = Number(dayFirst[1]);
    const date = new Date(year, month - 1, day, 12);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) return date;
    return undefined;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    const date = new Date(year, month - 1, day, 12);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) return date;
    return undefined;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseSpreadsheetType(value: unknown): string {
  const key = normalizeSpreadsheetKey(String(value ?? ''));
  if (!key) return 'out';

  if (['in', 'entrada', 'entradas', 'receita', 'receitas', 'credito', 'creditos', 'credit', 'ganho'].includes(key)) return 'in';
  if (['out', 'saida', 'saidas', 'despesa', 'despesas', 'debito', 'debitos', 'debit', 'gasto', 'gastos'].includes(key)) return 'out';
  if (['yield', 'rendimento', 'rendimentos', 'investimento', 'investimentos'].includes(key)) return 'yield';

  return String(value ?? '').trim();
}

function parseSpreadsheetStatus(value: unknown): string | undefined {
  const key = normalizeSpreadsheetKey(String(value ?? ''));
  if (!key) return undefined;
  if (['futuro', 'future', 'pendente', 'pending', 'agendado', 'scheduled'].includes(key)) return 'Futuro';
  if (['confirmado', 'confirmed', 'pago', 'paid', 'concluido', 'completed', 'efetivado'].includes(key)) return 'Confirmado';
  return String(value ?? '').trim();
}

function mapSpreadsheetRow(row: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};

  Object.entries(row).forEach(([key, value]) => {
    const field = SPREADSHEET_FIELDS[normalizeSpreadsheetKey(key)];
    if (!field || value === null || value === undefined || value === '') return;
    if (mapped[field] === undefined || mapped[field] === '') mapped[field] = value;
  });

  const text = (value: unknown) => {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  };

  const amount = parseSpreadsheetAmount(mapped.value);

  return {
    label: String(mapped.label ?? '').trim(),
    value: Math.abs(amount),
    type: parseSpreadsheetType(mapped.type),
    date: parseSpreadsheetDate(mapped.date),
    categoria_primaria: text(mapped.category),
    etiqueta_personalizada: text(mapped.tag),
    metodo_origem: text(mapped.method),
    status: parseSpreadsheetStatus(mapped.status)
  };
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Algo deu errado</h1>
            <p className="text-[var(--text-muted)] text-sm">Ocorreu um erro inesperado. Por favor, tente recarregar a página.</p>
            <pre className="bg-[var(--bg-card)] p-4 rounded-xl text-xs text-[var(--trend-down)] overflow-auto max-h-40 text-left border border-[var(--border-card)]">
              {this.state.errorInfo}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[var(--accent)] text-[var(--bg-app)] rounded-xl font-bold text-sm"
            >
              Recarregar App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const formatBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

const getTransactionCategory = (transaction: any) =>
  transaction?.categoria_primaria || transaction?.category || 'Outros';

// --- COMPONENTS ---
const Timeline = ({ transactions, privacyMode }: { transactions: Transaction[], privacyMode: boolean }) => {
  const grouped = useMemo(() => {
    const groups: Record<string, { date: Date, items: Transaction[], total: number }> = {};
    transactions.forEach(t => {
      const date = t.date?.toDate ? t.date.toDate() : new Date();
      const key = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      if (!groups[key]) {
        groups[key] = { date, items: [], total: 0 };
      }
      groups[key].items.push(t);
      groups[key].total += t.type === 'out' ? -t.value : t.value;
    });
    const result = Object.entries(groups).sort((a, b) => b[1].date.getTime() - a[1].date.getTime());
    checkDuplicates(result, '0'); // Field '0' is the date string
    return result;
  }, [transactions]);

  return (
    <div className="space-y-6">
      {grouped.map(([dateStr, group], groupIdx) => (
        <div key={`${dateStr}-${groupIdx}`} className="space-y-3">
          <div className="sticky top-0 z-10 bg-[var(--bg-app)]/80 backdrop-blur-md py-2 flex justify-between items-center border-b border-[var(--border-card)]">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{dateStr}</span>
            <span className={`text-sm font-mono font-bold ${group.total >= 0 ? 'text-[var(--trend-up)]' : 'text-[var(--trend-down)]'}`}>
              {privacyMode ? '••••' : `R$ ${(group.total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </span>
          </div>
          <div className="space-y-2">
            {group.items.map((t, idx) => (
              <div key={`tx-group-${t.id}-${idx}`} className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] hover:border-[var(--accent)] transition-all group">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'in' ? 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]' : t.type === 'yield' ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'}`}>
                    {t.type === 'in' ? <ArrowUpRight size={18} /> : t.type === 'yield' ? <TrendingUp size={18} /> : <ArrowRightLeft size={18} className="rotate-90" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{t.label}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono">{t.metodo_origem || 'Manual'}</span>
                      {t.etiqueta_personalizada && (
                        <span className="px-1.5 py-0.5 bg-[var(--bg-app)] text-[var(--text-muted)] text-[9px] rounded-md border border-[var(--border-card)]">
                          {t.etiqueta_personalizada}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono font-bold ${t.type === 'out' ? 'text-[var(--trend-down)]' : 'text-[var(--trend-up)]'}`}>
                    {t.type === 'out' ? '-' : '+'} {privacyMode ? '••••' : `R$ ${(t.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  </div>
                  {t.contexto_ia && (
                    <div className="text-[10px] text-[var(--accent)] italic max-w-[150px] truncate">
                      {t.contexto_ia.insight}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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
  const [chartFilter, setChartFilter] = useState({ period: 'Meses', month: 'Atual', day: 'Todos' });
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
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [isBiometryEnabled, setIsBiometryEnabled] = useState(false);
  const [chartFilterValue, setChartFilterValue] = useState<{ type: 'category' | 'asset' | null, value: string | null }>({ type: null, value: null });
  const [evolutionView, setEvolutionView] = useState<'historico' | 'projecao'>('historico');

  const filteredRecentTransactions = useMemo(() => {
    let filtered = [...transactions];
    if (chartFilterValue.type === 'category' && chartFilterValue.value) {
      filtered = filtered.filter(t => getTransactionCategory(t) === chartFilterValue.value);
    }
    return filtered.slice(0, 5);
  }, [transactions, chartFilterValue]);
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
  const isSeedingRef = useRef(false);

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
    assets: assets as any,
    transactions,
  }), [assets, transactions]);

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    }, (error) => {
      console.error("Auth Listener Error:", error);
      setIsAuthReady(true); // Don't hang the app
    });
    
    // Safety timeout: if auth hasn't replied in 8 seconds, proceed anyway
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
          // Create initial profile
          const initialProfile: any = {
            uid: user.uid,
            displayName: user.displayName || authForm.name || 'Usuário',
            photoURL: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`,
            email: user.email || authForm.email || '',
            investor_profile: 'Conservador',
            createdAt: serverTimestamp(),
            authProvider: user.providerData[0]?.providerId === 'google.com' ? 'google' : 'email'
          };
          setDoc(doc(db, 'users', user.uid), initialProfile).then(() => {
            // Show biometry suggestion after first registration/login
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

    // Immediate load from Local Storage (Memory Lock)
    try {
      const cached = localStorage.getItem(`zenith_config_${user.uid}`);
      if (cached) {
        const data = JSON.parse(cached);
        // We only apply if we don't have settings yet or if we want to be optimistic
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
        
        // Sync to Local Storage
        if (data.zenith_config) {
          try {
            localStorage.setItem(`zenith_config_${user.uid}`, JSON.stringify(data.zenith_config));
          } catch (e) {
            console.warn("Failed to cache settings:", e);
          }
        }

        // Apply theme to body
        document.documentElement.classList.remove('dark', 'light', 'high-contrast');
        document.documentElement.classList.add(data.theme);

        // Apply Zenith Engine Config
        if (data.zenith_config?.master_states) {
          const { tema_global, modo_privacidade } = data.zenith_config.master_states;
          if (tema_global) {
            const themeMap: Record<string, string> = { 'Escuro': 'dark', 'Claro': 'light', 'Contraste': 'high-contrast' };
            document.documentElement.classList.remove('dark', 'light', 'high-contrast');
            document.documentElement.classList.add(themeMap[tema_global] || 'dark');
          }
          setPrivacyMode(modo_privacidade);
        } else if (data.ui_config?.general) {
          const { theme, accent_color, base_font_size } = data.ui_config.general;
          if (theme) {
            document.documentElement.classList.remove('dark', 'light', 'high-contrast');
            document.documentElement.classList.add(theme);
          }
          if (accent_color) document.documentElement.style.setProperty('--accent', accent_color);
          if (base_font_size) document.documentElement.style.setProperty('--base-font-size', `${base_font_size}px`);
        } else if (data.yieldColor) {
          // Fallback to legacy yieldColor
          document.documentElement.style.setProperty('--accent', data.yieldColor);
        }
      } else {
        // Create default settings based on Zenith Engine
        const createDefaultCategory = (id: string, nome: string, hex: string): CategorySlot => ({
          id,
          nome,
          cor_destaque: { hex, opacity: 100 },
          visivel_no_dash: true,
          config_avancada: {},
          ia_insights_buffer: {}
        });

        const defaultSettings: Settings = {
          theme: 'dark',
          language: 'pt-BR',
          privacyMode: false,
          activeWidgets: ['Saldo', 'Rendimentos', 'Entradas', 'Saídas'],
          yieldColor: '#00FFA3',
          granularity: 'month',
          customTerms: {
            'Rendimentos': 'Rendimentos',
            'Entradas': 'Entradas',
            'Saídas': 'Saídas',
            'Saldo': 'Saldo'
          },
          zenith_config: {
            master_states: {
              modo_privacidade: false,
              insights_ia_ativo: false,
              idioma: "Português (Brasil)",
              tema_global: "Escuro",
              dashboard_management_expanded: true
            },
            categories: {
              "evolution": createDefaultCategory("evolution", "Evolução", "#FFFFFF"),
              "yields": createDefaultCategory("yields", "Rendimentos", "#00FF00"),
              "incomes": createDefaultCategory("incomes", "Entradas", "#007AFF"),
              "expenses": createDefaultCategory("expenses", "Saídas", "#FF3B30"),
              "allocation": createDefaultCategory("allocation", "Alocação", "#FFA500"),
              "cashflow": createDefaultCategory("cashflow", "Fluxo de Caixa", "#FF9500"),
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
        setDoc(doc(db, 'settings', user.uid), defaultSettings).catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `settings/${user.uid}`));
    return unsub;
  }, [user]);

  const handleFileUpload = async (file: File) => {
    if (!file || !user) return;

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(extension)) {
      setError(t('Formato de planilha não suportado. Use XLSX, XLS, CSV ou TSV.', 'Unsupported spreadsheet format. Use XLSX, XLS, CSV or TSV.'));
      return;
    }

    setIsProcessingIA(true);
    setError(null);

    try {
      const { read, utils } = await import('xlsx');
      const workbook = read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
      const rawRows: { row: number; data: Record<string, unknown> }[] = [];

      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;
        const rows = utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: true });
        rows.forEach((row, index) => rawRows.push({ row: index + 2, data: row }));
      });

      if (rawRows.length === 0) {
        setError(t('A planilha está vazia ou não possui linhas de dados.', 'The spreadsheet is empty or has no data rows.'));
        return;
      }

      const rowSchema = z.object({
        label: z.string().trim().min(1, t('Descrição obrigatória', 'Description required')).max(100, t('Descrição muito longa', 'Description too long')),
        value: z.number({ message: t('Valor inválido', 'Invalid value') }).positive(t('O valor deve ser positivo', 'Value must be positive')).max(1_000_000_000, t('Valor muito alto', 'Value too high')),
        type: z.enum(['in', 'out', 'yield'], { message: t('Tipo inválido', 'Invalid type') }),
        date: z.custom<Date>((value) => value instanceof Date && !Number.isNaN(value.getTime()), { message: t('Data inválida (use DD/MM/AAAA)', 'Invalid date (use DD/MM/YYYY)') }),
        categoria_primaria: z.string().trim().max(50, t('Categoria muito longa', 'Category too long')).optional(),
        etiqueta_personalizada: z.string().trim().max(100, t('Etiqueta muito longa', 'Tag too long')).optional(),
        metodo_origem: z.string().trim().max(50, t('Método de origem muito longo', 'Origin method too long')).optional(),
        status: z.enum(['Confirmado', 'Futuro'], { message: t('Status inválido', 'Invalid status') }).optional()
      });

      const validTransactions: Record<string, unknown>[] = [];
      const invalidRows: { row: number; reason: string }[] = [];
      const seenRows = new Set<string>();

      for (const { row, data } of rawRows) {
        const mapped = mapSpreadsheetRow(data);
        if (!mapped.label && Number.isNaN(mapped.value) && !mapped.date) continue;

        const parsed = rowSchema.safeParse(mapped);
        if (!parsed.success) {
          invalidRows.push({
            row,
            reason: parsed.error.issues.map(issue => issue.message).join('; ')
          });
          continue;
        }

        const duplicateKey = `${parsed.data.date.toISOString()}|${parsed.data.label}|${parsed.data.value}|${parsed.data.type}`;
        if (seenRows.has(duplicateKey)) {
          invalidRows.push({ row, reason: t('Linha duplicada na planilha', 'Duplicate row in spreadsheet') });
          continue;
        }
        seenRows.add(duplicateKey);

        const finalValidation = TransactionSchema.safeParse({
          ...parsed.data,
          uid: user.uid,
          date: parsed.data.date,
          createdAt: new Date()
        });

        if (!finalValidation.success) {
          invalidRows.push({
            row,
            reason: finalValidation.error.issues.map(issue => issue.message).join('; ')
          });
          continue;
        }

        validTransactions.push({
          ...finalValidation.data,
          date: Timestamp.fromDate(parsed.data.date),
          createdAt: serverTimestamp()
        });
      }

      if (validTransactions.length === 0) {
        const details = invalidRows
          .slice(0, 5)
          .map(item => `${t('linha', 'row')} ${item.row}: ${item.reason}`)
          .join(' | ');
        setError(t(
          `Nenhuma transação válida foi encontrada na planilha.${details ? ` Linhas com problema: ${details}` : ''}`,
          `No valid transaction was found in the spreadsheet.${details ? ` Problem rows: ${details}` : ''}`
        ));
        return;
      }

      if (validTransactions.length > 450) {
        setError(t(
          'A planilha possui mais de 450 transações válidas. Divida o arquivo em partes menores para importar.',
          'The spreadsheet has more than 450 valid transactions. Split the file into smaller parts to import.'
        ));
        return;
      }

      const batch = writeBatch(db);
      validTransactions.forEach(transaction => {
        batch.set(doc(collection(db, 'transactions')), transaction);
      });
      await batch.commit();
      await recalculateBalances(user.uid);

      if (invalidRows.length > 0) {
        const details = invalidRows
          .slice(0, 5)
          .map(item => `${t('linha', 'row')} ${item.row}: ${item.reason}`)
          .join(' | ');
        alert(t(
          `${validTransactions.length} transações importadas. ${invalidRows.length} linha(s) ignorada(s): ${details}`,
          `${validTransactions.length} transactions imported. ${invalidRows.length} row(s) ignored: ${details}`
        ));
      } else {
        alert(t(
          `${validTransactions.length} transações importadas com sucesso.`,
          `${validTransactions.length} transactions imported successfully.`
        ));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions/batch');
      setError(t('Não foi possível importar a planilha. Verifique o arquivo e tente novamente.', 'Could not import the spreadsheet. Check the file and try again.'));
    } finally {
      setIsProcessingIA(false);
    }
  };

  const handleUniversalIngestion = async (type: 'scanner' | 'upload' | 'spreadsheet' | 'manual') => {
    setIsIngestionHubOpen(false);
    
    if (type === 'manual') {
      const prompt = window.prompt(t("O que você deseja lançar? (Ex: Paguei 50 reais de almoço no Pix)", "What do you want to enter? (Ex: Paid 50 reais for lunch via Pix)"));
      if (!prompt) return;

      const apiKey = getGeminiApiKey();
      if (!apiKey) return;
      
      setIsProcessingIA(true);
      setIsReviewModalOpen(true);
      
      try {
        const data = await extractTransaction(apiKey, { text: prompt, userRules });
        setPendingTransaction(data);
      } catch (e) {
        console.error(e);
        handleAiError(e);
        setIsReviewModalOpen(false);
      } finally {
        setIsProcessingIA(false);
      }
      return;
    }

    if (type === 'spreadsheet') {
      const spreadsheetInput = document.createElement('input');
      spreadsheetInput.type = 'file';
      spreadsheetInput.accept = '.csv,.xlsx,.xls,.tsv';
      spreadsheetInput.onchange = (event: any) => {
        const file = event.target.files?.[0];
        if (file) handleFileUpload(file);
      };
      spreadsheetInput.click();
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const apiKey = getGeminiApiKey();
      if (!apiKey) return;
      
      setIsProcessingIA(true);
      setIsReviewModalOpen(true);

      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const data = await extractDocument(apiKey, {
            data: base64Data,
            mimeType: file.type,
            userRules
          });
          setPendingTransaction(data);
        } catch (error) {
          console.error(error);
          handleAiError(error);
          setIsReviewModalOpen(false);
        } finally {
          setIsProcessingIA(false);
        }
      };

      reader.onerror = () => {
        handleAiError(reader.error);
        setIsReviewModalOpen(false);
        setIsProcessingIA(false);
      };
    };
    input.click();
  };

  const confirmPendingTransaction = async (updatedTx?: any) => {
    const txToSave = updatedTx || pendingTransaction;
    if (!txToSave || !user) return;
    
    try {
      setError(null);
      
      // Validate with Zod
      const txDataToValidate = {
        ...txToSave,
        uid: user.uid,
        date: new Date(),
        createdAt: new Date()
      };

      const validation = TransactionSchema.safeParse(txDataToValidate);
      if (!validation.success) {
        const errorMsg = validation.error.issues.map(e => e.message).join(', ');
        setError(`Erro de validação: ${errorMsg}`);
        return;
      }

      const batch = writeBatch(db);
      const newTxRef = doc(collection(db, 'transactions'));
      
      const finalTxData = {
        ...validation.data,
        date: serverTimestamp(),
        createdAt: serverTimestamp()
      };

      // Optimistic UI
      setIsReviewModalOpen(false);

      // Save Rule if category was changed from AI suggestion
      if (pendingTransaction && (txToSave.categoria_primaria !== pendingTransaction.categoria_primaria || txToSave.category !== pendingTransaction.category)) {
        const ruleRef = doc(collection(db, 'user_rules'));
        batch.set(ruleRef, {
          uid: user.uid,
          pattern: pendingTransaction.label,
          category: txToSave.categoria_primaria || txToSave.category,
          createdAt: serverTimestamp()
        });
      }

      batch.set(newTxRef, finalTxData);

      // Atomic Balance Recalculation - Limit to 450 to stay within 500 batch limit
      const q = query(
        collection(db, 'transactions'), 
        where('uid', '==', user.uid), 
        orderBy('date', 'asc'),
        limit(450)
      );
      const snap = await getDocs(q);
      
      let runningBalance = 0;
      const allTx = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() } as any));
      
      // Add the new one to the list for balance calculation
      allTx.push({ ...finalTxData, id: newTxRef.id, ref: newTxRef, date: { toDate: () => new Date() } });
      
      // Sort them by date
      allTx.sort((a: any, b: any) => {
        const dateA = a.date?.toDate ? a.date.toDate().getTime() : Date.now();
        const dateB = b.date?.toDate ? b.date.toDate().getTime() : Date.now();
        return dateA - dateB;
      });

      allTx.forEach((tx: any) => {
        const value = tx.type === 'out' ? -tx.value : tx.value;
        runningBalance = Math.round((runningBalance + value) * 100) / 100;
        batch.update(tx.ref, { partialBalance: runningBalance });
      });

      await batch.commit();
      
      // Auto-activation of panels
      if (pendingTransaction.type === 'out' && settings?.zenith_config) {
        const currentOrder = settings.zenith_config.dashboard_order || [];
        const charts = settings.zenith_config.charts || {};
        
        const updates: any = {};
        
        if (!currentOrder.includes('CHART_DIST_CATEG')) {
          updates['zenith_config.dashboard_order'] = [...currentOrder, 'CHART_DIST_CATEG'];
        }
        
        if (charts['CHART_DIST_CATEG']?.visible === false) {
          updates['zenith_config.charts.CHART_DIST_CATEG.visible'] = true;
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, 'settings', user.uid), updates).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${user.uid}`));
        }
      }
    } catch (e: any) {
      if (e.message?.includes('resource-exhausted')) {
        setError("Limite do plano gratuito atingido. Algumas operações podem falhar temporariamente.");
      } else {
        handleFirestoreError(e, OperationType.WRITE, 'transactions/batch');
        setError("Ocorreu um erro ao salvar a transação. Tente novamente.");
      }
    } finally {
      setIsReviewModalOpen(false);
      setPendingTransaction(null);
    }
  };

  const recalculateBalances = async (userId: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('uid', '==', userId), orderBy('date', 'asc'), limit(450));
      const snap = await getDocs(q);
      
      let runningBalance = 0;
      const batch = writeBatch(db);
      
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as Transaction;
        const value = data.type === 'out' ? -data.value : data.value;
        runningBalance += value;
        
        batch.update(docSnap.ref, { partialBalance: runningBalance });
      });
      
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions/batch');
    }
  };

  // DDA Listener
  useEffect(() => {
    if (!user) {
      setDdas([]);
      return;
    }
    const q = query(collection(db, 'ddas'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as DDA));
      setDdas(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'ddas'));
    return unsub;
  }, [user]);

  const t = useCallback((pt: string, en: string) => {
    return settings?.language === 'en-US' ? en : pt;
  }, [settings?.language]);

  useEffect(() => {
    const onFirestoreError = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string; operationType?: string; path?: string | null; timestamp?: string }>).detail;
      const code = detail?.code || 'unknown';
      const en = settings?.language === 'en-US';
      let message: string;

      setFirestoreIssues(previous => [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        code,
        operationType: detail?.operationType || 'unknown',
        path: detail?.path || null,
        timestamp: detail?.timestamp || new Date().toISOString()
      }, ...previous].slice(0, 5));

      if (code === 'permission-denied') {
        message = en
          ? 'You do not have permission to access this data.'
          : 'Você não tem permissão para acessar estes dados.';
      } else if (code === 'resource-exhausted') {
        message = en
          ? 'Firestore quota reached. Some operations may fail temporarily.'
          : 'Limite do Firestore atingido. Algumas operações podem falhar temporariamente.';
      } else if (code === 'unavailable' || code === 'deadline-exceeded') {
        message = en
          ? 'Connection to the database failed. Check your internet and try again.'
          : 'Falha de conexão com o banco de dados. Verifique sua internet e tente novamente.';
      } else {
        message = en
          ? 'Could not sync your data. Please try again.'
          : 'Não foi possível sincronizar seus dados. Tente novamente.';
      }

      const isDev = (import.meta as any).env?.DEV === true;
      if (isDev && detail?.path) {
        message += ` [${detail.operationType || 'unknown'}: ${detail.path}]`;
      }

      setError(message);
    };

    window.addEventListener(FIRESTORE_ERROR_EVENT, onFirestoreError);
    return () => window.removeEventListener(FIRESTORE_ERROR_EVENT, onFirestoreError);
  }, [settings?.language]);

  const getGeminiApiKey = useCallback(() => {
    let stored = geminiApiKey;

    if (!stored) {
      try {
        stored = localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
      } catch {
        stored = '';
      }
    }

    const key = stored.trim();
    if (!key) {
      setApiKeyError(null);
      openDrawer('ai_key');
      return null;
    }

    return key;
  }, [geminiApiKey, openDrawer]);

  const handleAiError = useCallback((e: unknown) => {
    const message = getAiErrorMessage(e, settings?.language);
    setError(message);

    if (e instanceof MissingApiKeyError || e instanceof InvalidApiKeyError) {
      setApiKeyError(message);
      openDrawer('ai_key');
    }
  }, [geminiApiKey, settings?.language, openDrawer]);

  const resolveStyle = useCallback((catId: string, propertyName: string, defaultValue?: any) => {
    const config = settings?.zenith_config;
    if (!config) return defaultValue !== undefined ? defaultValue : 'var(--accent)';

    const cat = config.categories?.[catId];
    if (!cat) return defaultValue !== undefined ? defaultValue : 'var(--accent)';

    // 1º Interface Avançada (Manual) - Prioridade Máxima
    const avancado = cat.config_avancada[propertyName];
    if (avancado !== undefined && avancado !== null) {
      return avancado;
    }

    // 2º Fallback para Cor de Destaque
    if (propertyName === "cor_grafico" || propertyName === "cor_destaque" || propertyName === "main_color") {
      return cat.cor_destaque.hex;
    }

    // 3º Fallback para o Tema Global
    const tema = config.master_states.tema_global || "Escuro";
    const paletas: Record<string, Record<string, string>> = {
      "Escuro": { "bg": "#121212", "txt": "#E1E1E1", "accent": "#00FFA3" },
      "Claro": { "bg": "#F5F5F7", "txt": "#212121", "accent": "#007AFF" },
      "Contraste": { "bg": "#000000", "txt": "#00FF00", "accent": "#00FF00" }
    };

    const val = paletas[tema][propertyName];
    if (val !== undefined) return val;
    if (defaultValue !== undefined) return defaultValue;
    return paletas[tema]["accent"];
  }, [settings?.zenith_config]);

  const filteredAssets = useMemo(() => {
    if (!selectedCategory) return assets;
    const categoryMap: Record<string, string> = {
      'Liquidez': 'liquidity',
      'Ações/Invest.': 'investment',
      'Bens Materiais': 'physical'
    };
    return assets.filter(a => a.type === categoryMap[selectedCategory]);
  }, [assets, selectedCategory]);

  const orderedDashboardItems = useMemo(() => {
    const order = settings?.zenith_config?.dashboard_order || [];
    const chartsConfig = settings?.zenith_config?.charts || {};
    const metricsConfig = settings?.zenith_config?.metrics || {};
    
    const defaultOrder = [
      'METRIC_ENTRADAS',
      'METRIC_SAIDAS',
      'METRIC_RENDIMENTOS',
      'CHART_ALOC_ATIV',
      'CHART_FLUXO_CAIXA',
      'CHART_DIST_CATEG',
      'CHART_SAZON_MENS',
      'CHART_PREV_CONTAS',
      'CHART_METAS_PROG'
    ];

    const finalOrder = [...new Set(order)].filter(id =>
      id !== 'CHART_EVOL_PATRIMONIO' &&
      id !== 'METRIC_ARECEBER' &&
      id !== 'METRIC_SALDO' &&
      id !== 'METRIC_INVESTIMENTOS'
    );
    defaultOrder.forEach(id => {
      if (!finalOrder.includes(id)) finalOrder.push(id);
    });

    return finalOrder.filter(id => {
      const item = id.startsWith('METRIC_') ? metricsConfig[id] : chartsConfig[id];
      return item?.visible !== false;
    });
  }, [settings?.zenith_config?.dashboard_order, settings?.zenith_config?.charts, settings?.zenith_config?.metrics]);

  const renderMetric = (id: string) => {
    const metricConfig = (settings?.zenith_config?.metrics?.[id] || { visible: true, label: id.replace('METRIC_', '') }) as ChartSlot;
    if (metricConfig.visible === false) return null;

    const mainColor = metricConfig.color || (
      id === 'METRIC_ENTRADAS' ? 'var(--trend-up)' :
      id === 'METRIC_SAIDAS' ? 'var(--trend-down)' :
      id === 'METRIC_INVESTIMENTOS' ? 'var(--trend-up)' :
      'var(--trend-yield)'
    );
    const opacity = (metricConfig.opacity || 100) / 100;

    switch (id) {
      case 'METRIC_SALDO':
        return (
          <MiniMetricCard 
            key={id}
            id="net-worth"
            label={metricConfig.label || t("Patrimônio Total", "Net Worth")} 
            value={(metrics.netWorth ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
            percent={metrics.netWorthVar} 
            trend={metrics.netWorthTrend} 
            data={chartData.filter((point) => typeof point.value === 'number').slice(-10).map((point) => ({ v: point.value as number }))} 
            color={mainColor}
            opacity={opacity}
            privacy={privacyMode}
            onSettings={() => openDrawer('settings')}
            resolveStyle={resolveStyle}
          />
        );
      case 'METRIC_ENTRADAS':
        return (
          <MiniMetricCard 
            key={id}
            id="incomes"
            label={metricConfig.label || t("Entradas", "Incomes")} 
            value={(metrics.in.total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
            percent={metrics.in.var} 
            trend={metrics.in.trend} 
            data={metrics.in.data} 
            color={mainColor}
            opacity={opacity}
            privacy={privacyMode}
            onSettings={() => openDrawer('settings')}
            resolveStyle={resolveStyle}
          />
        );
      case 'METRIC_SAIDAS':
        return (
          <MiniMetricCard 
            key={id}
            id="expenses"
            label={metricConfig.label || t("Saídas", "Expenses")} 
            value={(metrics.out.total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
            percent={metrics.out.var} 
            trend={metrics.out.trend} 
            data={metrics.out.data} 
            color={mainColor}
            opacity={opacity}
            privacy={privacyMode}
            onSettings={() => openDrawer('settings')}
            resolveStyle={resolveStyle}
            isExpense={true}
          />
        );
      case 'METRIC_RENDIMENTOS':
        return (
          <YieldProjectionCard
            assets={assets as any}
            forceOpenCreateModal={forceCreateInvestment}
            onCloseCreateModal={() => setForceCreateInvestment(false)}
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
          />
        );
      case 'METRIC_INVESTIMENTOS':
        return (
          <MiniMetricCard 
            key={id}
            id="investments"
            label={metricConfig.label || t("Investimentos", "Investments")} 
            value={(metrics.investments ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
            percent={metrics.investmentsVar} 
            trend={metrics.investmentsTrend} 
            data={metrics.investmentsData} 
            color={mainColor}
            opacity={opacity}
            privacy={privacyMode}
            onSettings={() => openDrawer('settings')}
            resolveStyle={resolveStyle}
          />
        );
      default:
        return null;
    }
  };

  const renderChart = (id: string) => {
    const chartConfig = (settings?.zenith_config?.charts?.[id] || { visible: true, label: id.replace('CHART_', '') }) as ChartSlot;
    if (chartConfig.visible === false) return null;

    const mainColor = chartConfig.color || 'var(--accent)';
    const opacity = (chartConfig.opacity || 100) / 100;
    const isGradient = chartConfig.isGradient ?? true;
    const tooltipsEnabled = chartConfig.tooltipsEnabled ?? true;
    const predictiveEnabled = chartConfig.predictiveInsights ?? false;
    const visualType = chartConfig.visualType || 'Área';

    switch (id) {
      case 'CHART_EVOL_PATRIMONIO':
        const evolutionData = evolutionView === 'projecao' ? projectionData : chartData;
        return (
          <div key={id} className="h-48 w-full -mr-5 sm:-mr-6 mt-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              {visualType === 'Linha' || visualType === 'Área' ? (
                <AreaChart 
                  data={evolutionData} 
                  margin={{ top: 10, right: 0, left: 10, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border-card)" strokeDasharray="3 3" opacity={0.3} />
                  <defs>
                    <linearGradient id={`color-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={mainColor} stopOpacity={isGradient ? 0.3 * opacity : 0} />
                      <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" hide />
                  <YAxis 
                    orientation="right" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--text-primary)', fontSize: 8, opacity: 0.6 }} 
                    hide={!resolveStyle('evolution', 'show_values', true)}
                    tickFormatter={(value) => formatBRL(Number(value))}
                  />
                  {tooltipsEnabled && (
                    <Tooltip 
                      cursor={{ stroke: mainColor, strokeWidth: 1, strokeDasharray: '5 5' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const pointValue = data.value ?? data.predicted ?? 0;
                          return (
                            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
                              <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1">{data.date}</p>
                              <p className="text-base font-mono font-bold text-[var(--text-primary)]">
                                {privacyMode ? '••••••' : pointValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                              {predictiveEnabled && data.predicted != null && (
                                <p className="mt-2 text-[8px] text-[var(--accent)] font-bold italic">
                                  ✨ {t('Projeção baseada na tendência recente', 'Projection based on recent trend')}
                                </p>
                              )}
                              {data.projected && (
                                <p className="mt-2 text-[8px] text-[var(--accent)] font-bold italic">
                                  ✨ {t('Projeção bruta pelas taxas dos investimentos', 'Gross projection based on investment rates')}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={mainColor} 
                    strokeWidth={visualType === 'Linha' ? 2 : 3}
                    fillOpacity={visualType === 'Linha' ? 0 : opacity} 
                    fill={`url(#color-${id})`} 
                    activeDot={{ r: 5, fill: mainColor, stroke: 'var(--bg-app)', strokeWidth: 2 }}
                    dot={false}
                  />
                  {predictiveEnabled && (
                    <Area 
                      type="monotone" 
                      dataKey="predicted" 
                      stroke={mainColor} 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      fill="transparent"
                      dot={false}
                    />
                  )}
                </AreaChart>
              ) : (
                <BarChart data={evolutionData}>
                  <XAxis dataKey="name" hide />
                  <Tooltip />
                  <Bar dataKey="value" fill={mainColor} fillOpacity={opacity} radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        );
      case 'CHART_METAS_PROG':
        return (
          <section key={id} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-medium text-[var(--text-muted)]">{t("Metas Financeiras", "Financial Goals")}</span>
              <button className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">{t("Nova Meta", "New Goal")}</button>
            </div>
            <div className="space-y-6">
              {goals.map((goal, idx) => (
                <div key={`goal-${goal.name}-${idx}`} className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest">
                    <span className="text-[var(--text-primary)]">{goal.name}</span>
                    <span style={{ color: goal.color }}>{goal.percent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${goal.percent}%` }}
                      className="h-full"
                      style={{ backgroundColor: goal.color, opacity: opacity }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      case 'CHART_ALOC_ATIV':
        return (
          <section key={id} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-medium text-[var(--text-muted)]">{t("Alocação de Ativos", "Asset Allocation")}</span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => { setCurrentTab('IA'); /* Contextual IA logic here */ }}
                  className="flex items-center gap-1.5 text-[var(--accent)] hover:text-[var(--text-primary)] transition-colors group"
                >
                  <Sparkles size={14} className="group-hover:animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Zenith IA</span>
                </button>
                <button onClick={() => openDrawer('settings')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  <SettingsIcon size={16} />
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-32 h-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={allocationData.length > 0 ? allocationData : [{ name: 'Vazio', value: 1, color: 'var(--border-card)' }]}
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      onClick={(data) => {
                        if (data && data.name) {
                          setChartFilterValue(prev => 
                            prev.value === data.name ? { type: null, value: null } : { type: 'asset', value: data.name }
                          );
                        }
                      }}
                    >
                      {allocationData.map((entry, idx) => (
                        <Cell 
                          key={`cell-${entry.name}-${idx}`} 
                          fill={entry.color} 
                          fillOpacity={chartFilterValue.value === entry.name ? 1 : opacity}
                          className="cursor-pointer outline-none"
                        />
                      ))}
                    </Pie>
                    {tooltipsEnabled && <Tooltip />}
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full space-y-3">
                {allocationData.map((item, idx) => (
                  <div key={`legend-${item.name}-${idx}`} className="flex justify-between items-center w-full p-2 rounded-xl hover:bg-[var(--text-primary)]/5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[10px] text-[var(--text-secondary)]">{item.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-primary)]">
                      {privacyMode ? '•••' : (item.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Nested Meus Investimentos & Assets */}
            <div className="mt-8 space-y-6">
              <HomeInvestmentCard 
                saldoTotal={metrics.investments}
                perfilAtual={investorProfile}
                privacyMode={privacyMode}
                allocatedPercent={portfolioAllocationPercent}
                onClick={() => setCurrentTab('Carteira')}
              />
              <div className="grid grid-cols-2 gap-3">
                {filteredAssets.slice(0, 4).map((asset, assetIdx) => (
                  <SummaryCard 
                    key={`${asset.id}-${assetIdx}`}
                    label={asset.name} 
                    value={(asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).replace('R$', 'R$ ')} 
                    icon={asset.type === 'liquidity' ? <CreditCard size={14}/> : asset.type === 'investment' ? <Landmark size={14}/> : <Car size={14}/>} 
                    onClick={() => setSelectedAsset(asset)} 
                    privacy={privacyMode}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      case 'CHART_FLUXO_CAIXA':
        return (
          <section key={id} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-medium text-[var(--text-muted)]">{t("Fluxo de Caixa / Predição", "Cash Flow / Prediction")}</span>
              <button onClick={() => openDrawer('settings')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                <SettingsIcon size={16} />
              </button>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData}>
                  <CartesianGrid vertical={false} stroke="var(--border-card)" strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontSize: 8, opacity: 0.6 }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--text-primary)', fontSize: 8, opacity: 0.6 }} 
                    hide={!resolveStyle('cashflow', 'show_values', true)}
                    tickFormatter={(value) => formatBRL(Number(value))}
                  />
                  {tooltipsEnabled && (
                    <Tooltip formatter={(value) => formatBRL(Number(value))} />
                  )}
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {cashFlowData.map((entry, idx) => (
                      <Cell 
                        key={`cell-${entry.name}-${idx}`} 
                        fill={entry.isPredicted ? mainColor : (entry.value > 0 ? 'var(--accent)' : 'var(--trend-down)')} 
                        fillOpacity={entry.isPredicted ? 0.3 : opacity}
                        stroke={entry.isPredicted ? mainColor : 'none'}
                        strokeDasharray={entry.isPredicted ? "4 4" : "0"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        );
      case 'CHART_DIST_CATEG':
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // State Binding: Filter transactions for the current month and type 'out'
        const monthExpenses = transactions.filter(t => {
          const d = t.date?.toDate ? t.date.toDate() : (t.date instanceof Date ? t.date : new Date());
          return t.type === 'out' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        const categoryData = monthExpenses.reduce((acc: any[], t: any) => {
          const catName = getTransactionCategory(t);
          const existing = acc.find((item: any) => item.name === catName);
          if (existing) {
            existing.value += t.value;
          } else {
            acc.push({ 
              name: catName, 
              value: t.value, 
              color: catName === 'Moradia' ? 'var(--trend-down)' : 'var(--accent)' 
            });
          }
          return acc;
        }, []);

        // Conditional Visibility: If active in settings, it MUST appear.
        // If no data exists yet, show the interactive placeholder.
        if (categoryData.length === 0) {
          return (
            <section key={id} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 border-dashed opacity-60">
              <div className="flex justify-between items-center mb-6">
                <span className="text-xs font-medium text-[var(--text-muted)]">{t('Distribuição de Gastos', 'Expense Distribution')}</span>
                <div className="px-2 py-1 bg-[var(--accent)]/10 rounded-lg">
                  <span className="text-[8px] font-bold text-[var(--accent)] uppercase tracking-widest">IA Placeholder</span>
                </div>
              </div>
              <div className="h-32 flex flex-col items-center justify-center gap-3">
                <Sparkles className="text-[var(--accent)] animate-pulse" size={24} />
                <p className="text-[10px] text-[var(--text-muted)] text-center max-w-[200px]">
                  {t("Este gráfico será injetado dinamicamente após o processamento de dados pela IA.", "This chart will be dynamically injected after AI data processing.")}
                </p>
              </div>
            </section>
          );
        }

        return (
          <motion.section 
            key={`${id}-${categoryData.length > 0}`} 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-medium text-[var(--text-muted)]">{t('Distribuição de Gastos', 'Expense Distribution')}</span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => { setCurrentTab('IA'); /* Contextual IA logic here */ }}
                  className="flex items-center gap-1.5 text-[var(--accent)] hover:text-[var(--text-primary)] transition-colors group"
                >
                  <Sparkles size={14} className="group-hover:animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Zenith IA</span>
                </button>
                <button onClick={() => openDrawer('settings')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  <SettingsIcon size={16} />
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-32 h-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={categoryData}
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      onClick={(data) => {
                        if (data && data.name) {
                          setChartFilterValue(prev => 
                            prev.value === data.name ? { type: null, value: null } : { type: 'category', value: data.name }
                          );
                        }
                      }}
                    >
                      {categoryData.map((entry: any, entryIdx: number) => (
                        <Cell 
                          key={`cell-dist-${entry.name}-${entryIdx}`} 
                          fill={entry.color} 
                          fillOpacity={chartFilterValue.value === entry.name ? 1 : opacity}
                          className="cursor-pointer outline-none"
                        />
                      ))}
                    </Pie>
                    {tooltipsEnabled && <Tooltip />}
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full space-y-3">
                {categoryData.map((item: any, idx: number) => (
                  <div key={`cat-info-${item.name}-${idx}`} className="flex justify-between items-center w-full p-2 rounded-xl hover:bg-[var(--text-primary)]/5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[10px] text-[var(--text-secondary)]">{item.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-primary)]">
                      {privacyMode ? '•••' : (item.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Transações Recentes */}
            <div className="mt-8 space-y-6">
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-1">{t("Transações Recentes", "Recent Transactions")}</p>
                {filteredRecentTransactions.slice(0, 3).map((tx, idx) => (
                  <div key={`${tx.id}-${idx}`} className="flex justify-between items-center p-3 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)]">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'in' ? 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]' : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'}`}>
                        {tx.type === 'in' ? <ArrowUpRight size={14} /> : <ArrowRightLeft size={14} className="rotate-90" />}
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-[var(--text-primary)]">{tx.label}</p>
                        <p className="text-[8px] text-[var(--text-muted)] uppercase font-bold">{getTransactionCategory(tx)}</p>
                      </div>
                    </div>
                    <p className={`text-xs font-mono font-bold ${tx.type === 'in' ? 'text-[var(--trend-up)]' : 'text-[var(--trend-down)]'}`}>
                      {privacyMode ? '•••' : (tx.type === 'out' ? '-' : '+') + (tx.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        );
      case 'CHART_SAZON_MENS':
      case 'CHART_PREV_CONTAS':
        const labels: Record<string, string> = {
          'CHART_SAZON_MENS': t('Sazonalidade de Categoria', 'Category Seasonality'),
          'CHART_PREV_CONTAS': t('Predição de Boletos', 'Bill Prediction')
        };
        return (
          <section key={id} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 border-dashed opacity-60">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-medium text-[var(--text-muted)]">{labels[id]}</span>
              <div className="px-2 py-1 bg-[var(--accent)]/10 rounded-lg">
                <span className="text-[8px] font-bold text-[var(--accent)] uppercase tracking-widest">IA Placeholder</span>
              </div>
            </div>
            <div className="h-32 flex flex-col items-center justify-center gap-3">
              <Sparkles className="text-[var(--accent)] animate-pulse" size={24} />
              <p className="text-[10px] text-[var(--text-muted)] text-center max-w-[200px]">
                {t("Este gráfico será injetado dinamicamente após o processamento de dados pela IA.", "This chart will be dynamically injected after AI data processing.")}
              </p>
            </div>
          </section>
        );
      default:
        return null;
    }
  };

  const allocationData = useMemo(() => {
    const types: Record<string, number> = { liquidity: 0, investment: 0, physical: 0 };
    assets.forEach(a => { 
      if (a.type && types[a.type] !== undefined) {
        types[a.type] += a.value || 0; 
      }
    });
    return [
      { name: 'Bens Materiais', value: types.physical, color: 'var(--accent)' },
      { name: 'Ações/Invest.', value: types.investment, color: 'var(--trend-up)' },
      { name: 'Liquidez', value: types.liquidity, color: 'var(--trend-yield)' },
    ].filter(d => d.value > 0);
  }, [assets]);

  const goals = useMemo(() => {
    const liquidity = assets.filter(a => a.type === 'liquidity').reduce((acc, a) => acc + a.value, 0);
    const total = assets.reduce((acc, a) => acc + a.value, 0);
    
    const emergencyGoal = 30000;
    const freedomGoal = 1000000;
    
    return [
      {
        name: 'Reserva de Emergência',
        current: liquidity,
        target: emergencyGoal,
        percent: Math.min(Math.round((liquidity / emergencyGoal) * 100), 100),
        color: 'var(--trend-up)'
      },
      {
        name: 'Liberdade Financeira',
        current: total,
        target: freedomGoal,
        percent: Math.min(Math.round((total / freedomGoal) * 100), 100),
        color: 'var(--accent)'
      }
    ];
  }, [assets]);

  const syncDDA = useCallback(async () => {
    if (!user) return;
    // Simulated DDA. CPF is only included when the user has one saved in their profile.
    const mockDDA = {
      beneficiary: 'ENEL Distribuição SP',
      value: 185.40,
      dueDate: serverTimestamp(),
      status: 'pending',
      uid: user.uid,
      ...(profile?.cpf ? { cpf: profile.cpf } : {})
    };
    try {
      const ddaRef = doc(collection(db, 'ddas'));
      await setDoc(ddaRef, mockDDA);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'ddas');
    }
  }, [user, profile?.cpf]);

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

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authForm.name) {
      setError('Nome é obrigatório');
      return;
    }
    try {
      const res = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
      await updateProfile(res.user, { displayName: authForm.name });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const attemptBiometry = async () => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return;
    try {
      const isEnabled = localStorage.getItem(`biometry_active_${user?.uid || 'guest'}`);
      if (isEnabled === 'true') {
        console.log("Biometria validada com sucesso!");
        return true;
      }
    } catch (e) {
      console.warn("Storage access failed:", e);
    }
    return false;
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
      // Private mode/storage blocked: keep the key in memory for this session.
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

  if (!isAuthReady) return <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        {/* Abstract Background Orbs */}
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[var(--accent)]/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-[var(--accent)]/5 blur-[120px] rounded-full" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-8 z-10"
        >
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-[var(--text-primary)] rounded-[32px] flex items-center justify-center mx-auto shadow-2xl">
              <TrendingUp size={40} className="text-[var(--bg-app)]" />
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-bold text-[var(--text-primary)] tracking-tight">Zenith</h1>
              <p className="text-[var(--accent)] text-xs uppercase tracking-[0.2em] font-black">{t("The Future of Wealth", "O Futuro do Patrimônio")}</p>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-8 shadow-xl space-y-6">
            <div className="flex bg-[var(--bg-app)] p-1 rounded-2xl border border-[var(--border-card)]">
              {(['login', 'register'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setAuthView(view)}
                  className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${
                    authView === view 
                      ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-sm' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {view === 'login' ? t("Entrar", "Login") : t("Criar Conta", "Register")}
                </button>
              ))}
            </div>

            <form onSubmit={authView === 'login' ? handleEmailLogin : handleRegister} className="space-y-4">
              {authView === 'register' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest ml-1">{t("Nome", "Name")}</label>
                  <input 
                    type="text"
                    required
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                    placeholder={t("Seu nome completo", "Your full name")}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest ml-1">{t("E-mail", "Email")}</label>
                <input 
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest ml-1">{t("Senha", "Password")}</label>
                <input 
                  type="password"
                  required
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-[var(--text-primary)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)] transition-all transform active:scale-[0.98]"
              >
                {authView === 'login' ? t("Acessar Painel", "Access Dashboard") : t("Finalizar Cadastro", "Complete Sign Up")}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border-card)] opacity-50" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
                <span className="bg-[var(--bg-card)] px-4 text-[var(--text-muted)]">{t("Ou continue com", "Or continue with")}</span>
              </div>
            </div>

            <button 
              onClick={handleGoogleLogin}
              className="w-full py-4 bg-white text-black rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border border-[var(--border-card)] hover:bg-gray-50 transition-all active:scale-[0.98]"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
              Google
            </button>
          </div>

        </motion.div>
      </div>
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
  const seedMockData = async () => {
    if (!user) return;
    if (isSeedingRef.current) return;

    const warnExistingData = () => {
      console.warn('Seed ignorado: o usuário já possui ativos cadastrados.');
      alert(t(
        'Já existem dados neste perfil. O seed não será executado novamente.',
        'This profile already has data. The seed will not run again.'
      ));
    };

    if (assets.length > 0) {
      warnExistingData();
      return;
    }

    isSeedingRef.current = true;

    try {
      const assetSnap = await getDocs(query(collection(db, 'assets'), where('uid', '==', user.uid), limit(1)));

      if (!assetSnap.empty) {
        warnExistingData();
        return;
      }

      const batch = writeBatch(db);

      // 1. Seed Assets
      const mockAssets = [
        { name: 'Tesouro Selic 2029', value: 5000, type: 'investment', subcategoria: 'Renda Fixa', emissor: 'Tesouro Nacional', taxaInflacao: 4.5, valorInvestido: 4800 },
        { name: 'PETR4', value: 2500, type: 'investment', subcategoria: 'Ações', emissor: 'Petrobras', taxaInflacao: 4.5, valorInvestido: 2000 },
        { name: 'HGLG11', value: 3000, type: 'investment', subcategoria: 'FIIs', emissor: 'Credit Suisse', taxaInflacao: 4.5, valorInvestido: 2800 },
        { name: 'Bitcoin', value: 1500, type: 'investment', subcategoria: 'Cripto', emissor: 'Binance', taxaInflacao: 4.5, valorInvestido: 1000 },
      ];

      mockAssets.forEach(a => {
        const newDoc = doc(collection(db, 'assets'));
        batch.set(newDoc, { ...a, uid: user.uid, createdAt: serverTimestamp() });
      });

      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'sync_family_batch');
    } finally {
      isSeedingRef.current = false;
    }
  };

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
            <StorageTrashView user={user} language={settings?.language} />
          )}

          {currentTab === 'Início' && (
            <>
              {/* DDA SUGGESTIONS */}
              <AnimatePresence>
                {ddas.filter(d => d.status === 'pending').map((dda, idx) => (
                  <DDASuggestion 
                    key={`dda-${dda.id}-${idx}`} 
                    dda={dda} 
                    onAccept={handleAcceptDDA} 
                    onReject={handleRejectDDA} 
                    privacy={privacyMode} 
                    language={settings.language}
                  />
                ))}
              </AnimatePresence>

              {/* CARD PATRIMÔNIO TOTAL */}
              <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-5 sm:p-6 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">{settings?.customTerms['Saldo'] || t("Evolução do Patrimônio", "Net Worth Evolution")}</span>
                  <div className="flex shrink-0 rounded-xl border border-[var(--border-card)] bg-[var(--bg-app)] p-0.5">
                    <button
                      onClick={() => setEvolutionView('historico')}
                      className={`rounded-lg px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${evolutionView === 'historico' ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)]'}`}
                    >
                      {t('Histórico', 'History')}
                    </button>
                    <button
                      onClick={() => setEvolutionView('projecao')}
                      className={`rounded-lg px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${evolutionView === 'projecao' ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)]'}`}
                    >
                      {t('Projeção', 'Forecast')}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-3xl font-mono tracking-tighter font-medium text-[var(--text-primary)]">
                    {privacyMode ? '••••••••' : (metrics.netWorth ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </h2>
                  <button 
                    onClick={() => {
                      const newVal = !privacyMode;
                      setPrivacyMode(newVal);
                      if (user) {
                        updateDoc(doc(db, 'settings', user.uid), { privacyMode: newVal })
                          .catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
                      }
                    }} 
                    className="w-7 h-7 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                  >
                    {privacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {renderChart('CHART_EVOL_PATRIMONIO')}
              </section>

              {/* DASHBOARD INTEGRADO (DYNAMIC ORDER) */}
              <div className="space-y-6">
                {orderedDashboardItems.map((id, index) => (
                  <React.Fragment key={`dash-${id}-${index}`}>
                    {id.startsWith('METRIC_') ? renderMetric(id) : renderChart(id)}
                  </React.Fragment>
                ))}
              </div>

            </>
          )}

          {currentTab === 'Carteira' && (
            <DetalhesGastosPage 
              transactions={transactions}
              language={settings?.language}
              onEdit={(tx: any) => {
                setSelectedTransaction(tx);
                setIsEditingTransaction(true);
              }}
              onDelete={async (tx: any) => {
                if (confirm(t('Deseja mover esta transação para a lixeira?', 'Do you want to move this transaction to trash?'))) {
                  try {
                    await moveToTrash(tx, 'transactions');
                    await recalculateBalances(user.uid);
                  } catch (err) {
                    console.error("Delete failed:", err);
                    alert(t("Erro ao excluir transação. Tente novamente.", "Error deleting transaction. Try again."));
                  }
                }
              }}
            />
          )}

          {currentTab === 'Investimentos' && (
            <InvestmentsView 
              assets={assets} 
              investorProfile={investorProfile} 
              onAssetClick={(asset: any) => setSelectedAssetForDeepDive(asset)} 
              onSeed={seedMockData}
              language={settings?.language} 
            />
          )}

          {currentTab === 'IA' && (
            <Suspense fallback={<LoadingSpinner />}>
              <ZenithIAView
                language={settings?.language}
                transactions={transactions}
                assets={assets}
              />
            </Suspense>
          )}

        </main>

        {/* --- MODALS --- */}
        <AnimatePresence>
          {/* Profile Drawer */}
          <ProfileDrawer
            isOpen={isProfileDrawerOpen}
            onClose={() => {
              setIsProfileDrawerOpen(false);
              setDrawerPageRequest('menu');
            }}
            initialPage={drawerPageRequest}
            profile={profile}
            user={user}
            notifications={notifications}
            language={settings?.language}
            apiKey={geminiApiKey}
            apiKeyError={apiKeyError}
            chartFilter={chartFilter}
            onChartFilterChange={setChartFilter}
            onClearApiKeyError={() => setApiKeyError(null)}
            onSaveApiKey={handleSaveApiKey}
            onSaveProfile={handleSaveProfile}
            userId={user.uid}
            currentConfig={settings?.zenith_config}
            settingsLanguage={settings?.zenith_config?.master_states?.idioma === 'English (US)' ? 'en-US' : 'pt-BR'}
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

          {/* Profile Edit Modal */}

          {/* PÁGINA DETALHES CATEGORIA */}
          {isCategoryDetailsOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[110] bg-[var(--bg-app)] overflow-y-auto"
            >
              {/* STICKY HEADER */}
              <div className="sticky top-0 z-20 bg-[var(--bg-app)]/80 backdrop-blur-xl border-b border-[var(--border-card)] px-6 py-4">
                <div className="flex items-center justify-between max-w-5xl mx-auto">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setIsCategoryDetailsOpen(false)} className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--accent)]/10 transition-colors">
                      <X size={20} />
                    </button>
                    <div>
                      <h2 className="text-lg font-bold text-[var(--text-primary)]">{activeCategoryDetail || 'Detalhes'}</h2>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">Visão Analítica Zenith</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-1">
                      {(['7', '15', '30'] as const).map(f => (
                        <button 
                          key={f}
                          onClick={() => setTimeFilter(f)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeFilter === f ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                        >
                          {f}D
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => setIsAddMenuOpen(true)}
                      className="w-10 h-10 bg-[var(--accent)] text-[var(--bg-app)] rounded-xl flex items-center justify-center shadow-lg shadow-[var(--accent)]/20 hover:scale-105 transition-transform"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-w-5xl mx-auto p-6 space-y-8">
                {/* DASHBOARD VISUAL */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Sazonalidade (6 Meses)</span>
                      <BarChartIcon size={16} className="text-[var(--accent)]" />
                    </div>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={cashFlowData.slice(-6)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-card)" opacity={0.3} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontSize: 10 }} />
                          <YAxis hide />
                          <Tooltip 
                            formatter={(value) => formatBRL(Number(value))}
                            contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px' }}
                            cursor={{ fill: 'var(--accent)', opacity: 0.05 }}
                          />
                          <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {[
                      { label: 'Total Gasto', value: metrics.out.total, color: 'var(--trend-down)' },
                      { label: 'Média Mensal', value: metrics.out.total / 6, color: 'var(--accent)' },
                      { label: 'Variação %', value: '+12.5%', color: 'var(--trend-up)', isPercent: true }
                    ].map((m, i) => (
                      <div key={`summary-metric-${i}`} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-3xl p-5 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">{m.label}</p>
                          <p className="text-xl font-mono font-bold text-[var(--text-primary)]">
                            {privacyMode ? '••••' : m.isPercent ? m.value : `R$ ${Number(m.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${m.color}10`, color: m.color }}>
                          {i === 0 ? <ArrowRightLeft size={18} className="rotate-90" /> : i === 1 ? <Landmark size={18} /> : <TrendingUp size={18} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TIMELINE */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <LayoutGrid size={14} className="text-[var(--accent)]" />
                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Timeline de Transações</span>
                  </div>
                  <Timeline 
                    transactions={transactions.filter(t => !activeCategoryDetail || t.categoria_primaria === activeCategoryDetail || t.label.includes(activeCategoryDetail))} 
                    privacyMode={privacyMode} 
                  />
                </div>
              </div>
            </motion.div>
          )}

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
                
                // Save Rule if category was changed
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

          {/* Profile Edit Modal */}
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

        </AnimatePresence>

        
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

type DrawerPage = 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash';

function ProfileDrawer({
  isOpen,
  onClose,
  initialPage = 'menu',
  profile,
  user,
  notifications = [],
  language,
  apiKey,
  chartFilter,
  onChartFilterChange,
  apiKeyError,
  onClearApiKeyError,
  onSaveApiKey,
  onSaveProfile,
  userId,
  currentConfig,
  settingsLanguage,
  onLogout
}: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [activeDrawerPage, setActiveDrawerPage] = useState<DrawerPage>('menu');

  useEffect(() => {
    setActiveDrawerPage(isOpen ? initialPage : 'menu');
  }, [isOpen, initialPage]);

  if (!isOpen) return null;

  const displayName = profile?.displayName || user?.displayName || t('Usuário', 'User');
  const email = profile?.email || user?.email || '';
  const photoURL = profile?.photoURL || user?.photoURL || (user?.uid ? `https://picsum.photos/seed/${user.uid}/100/100` : '');

  const pageTitles: Record<DrawerPage, string> = {
    menu: t('Menu', 'Menu'),
    profile: t('Meu Perfil', 'My Profile'),
    notifications: t('Notificações', 'Notifications'),
    settings: t('Configurações', 'Settings'),
    ai_key: t('Chave da IA', 'AI Key'),
    trash: t('Armazenamento e Lixeira', 'Storage & Trash')
  };

  const menuItems: { id: DrawerPage; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    { id: 'profile', label: t('Meu Perfil', 'My Profile'), icon: <UserIcon size={20} /> },
    { id: 'notifications', label: t('Notificações', 'Notifications'), icon: <Bell size={20} />, badge: notifications.length > 0 },
    { id: 'settings', label: t('Configurações', 'Settings'), icon: <SettingsIcon size={20} /> },
    { id: 'ai_key', label: t('Chave da IA', 'AI Key'), icon: <KeyRound size={20} /> },
    { id: 'trash', label: t('Armazenamento e Lixeira', 'Storage & Trash'), icon: <HardDrive size={20} /> },
  ];

  const goBack = () => setActiveDrawerPage('menu');

  return (
    <div className="fixed inset-0 z-[120]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute left-0 top-0 bottom-0 w-[340px] max-w-[92vw] bg-[var(--bg-card)] border-r border-[var(--border-card)] p-5 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            {activeDrawerPage !== 'menu' && (
              <button
                onClick={goBack}
                className="p-2 -ml-2 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label={t('Voltar', 'Back')}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 className="text-lg font-bold text-[var(--text-primary)] truncate">{pageTitles[activeDrawerPage]}</h2>
          </div>
          {activeDrawerPage === 'menu' && (
            <button onClick={onClose} className="p-2 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" aria-label={t('Fechar', 'Close')}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {activeDrawerPage === 'menu' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl">
                <div className="w-12 h-12 shrink-0 rounded-2xl border border-[var(--border-card)] overflow-hidden">
                  {photoURL && <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{displayName}</h3>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{email}</p>
                </div>
              </div>

              <nav className="space-y-1">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveDrawerPage(item.id)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-[var(--text-secondary)] hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)] transition-all"
                  >
                    <span className="relative">
                      {item.icon}
                      {item.badge && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-[var(--accent)] rounded-full" />}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-left">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          )}

          {activeDrawerPage === 'profile' && (
            <ProfileSection
              profile={profile}
              language={language}
              onSave={onSaveProfile}
              onDone={goBack}
            />
          )}

          {activeDrawerPage === 'notifications' && (
            <NotificationsSection notifications={notifications} language={language} />
          )}

          {activeDrawerPage === 'settings' && (
            <Suspense fallback={<LoadingSpinner />}>
              <HeritageSettings
                onClose={goBack}
                userId={userId}
                currentConfig={currentConfig}
                language={settingsLanguage}
                chartFilter={chartFilter}
                onChartFilterChange={onChartFilterChange}
              />
            </Suspense>
          )}

          {activeDrawerPage === 'ai_key' && (
            <AiKeySection
              apiKey={apiKey}
              error={apiKeyError}
              language={language}
              onClearError={onClearApiKeyError}
              onSave={onSaveApiKey}
            />
          )}

          {activeDrawerPage === 'trash' && (
            <StorageTrashView user={user} language={language} embedded />
          )}
        </div>

        <div className="pt-4 mt-4 border-t border-[var(--border-card)]">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full flex items-center gap-4 p-4 rounded-2xl text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-all font-bold uppercase tracking-widest text-xs"
          >
            <LogOut size={20} />
            {t('Sair da Conta', 'Log Out')}
          </button>
        </div>
      </motion.aside>
    </div>
  );
}

function imageFileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('invalid-type'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-error'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('decode-error'));
      image.onload = () => {
        const size = 320;
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas-error'));
          return;
        }
        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function ProfileSection({ profile, onSave, onDone, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({ ...profile });
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setPhotoError(t('A imagem deve ter no máximo 12 MB.', 'The image must be at most 12 MB.'));
      return;
    }
    setPhotoError(null);
    setPhotoLoading(true);
    try {
      const dataUrl = await imageFileToAvatar(file);
      setFormData((current: any) => ({ ...current, photoURL: dataUrl }));
    } catch {
      setPhotoError(t('Não foi possível carregar esta imagem.', 'Could not load this image.'));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.displayName?.trim()) {
      alert(t('O nome não pode estar vazio.', 'The name cannot be empty.'));
      return;
    }
    setSaving(true);
    try {
      await onSave(formData);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="flex flex-col items-center gap-3 text-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative w-20 h-20 rounded-3xl border-2 border-[var(--accent)] overflow-hidden group"
        >
          {formData.photoURL ? (
            <img src={formData.photoURL} alt={t('Perfil', 'Profile')} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
              <UserIcon size={30} />
            </span>
          )}
          <span className={`absolute inset-0 bg-black/50 flex items-center justify-center text-white transition-opacity ${photoLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {photoLoading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        {photoError && <p className="text-[10px] text-[var(--destructive)]">{photoError}</p>}
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{profile?.displayName}</h3>
          <p className="text-[10px] text-[var(--text-muted)]">{profile?.email}</p>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Nome de Exibição', 'Display Name')}</label>
        <input value={formData.displayName || ''} onChange={e => setFormData({ ...formData, displayName: e.target.value })} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none" />
      </div>
      <div>
        <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Perfil de Investidor', 'Investor Profile')}</label>
        <select
          value={formData.investor_profile || 'Conservador'}
          onChange={e => setFormData({ ...formData, investor_profile: e.target.value })}
          className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none"
        >
          <option value="Conservador">Conservador</option>
          <option value="Sofisticado">Sofisticado</option>
          <option value="Arrojado">Arrojado</option>
        </select>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save size={16} /> {t('Salvar Alterações', 'Save Changes')}
      </button>
    </div>
  );
}

function NotificationsSection({ notifications = [], language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  if (notifications.length === 0) {
    return (
      <div className="py-16 text-center">
        <BellOff size={40} className="mx-auto text-[var(--text-muted)] mb-4 opacity-20" />
        <p className="text-[var(--text-muted)] text-xs uppercase font-bold tracking-widest">{t('Tudo limpo por aqui', 'All clear here')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      {notifications.map((n: any, i: number) => (
        <div key={`notif-${i}-${n.time}`} className="p-4 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl space-y-1">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">{n.type}</span>
            <span className="text-[8px] text-[var(--text-muted)] font-bold">{n.time}</span>
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{n.title}</p>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{n.message}</p>
        </div>
      ))}
    </div>
  );
}

function AiKeySection({ apiKey, error, onSave, onClearError, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [draft, setDraft] = useState(apiKey || '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!draft.trim()) {
      setLocalError(t('Informe uma chave válida.', 'Enter a valid key.'));
      return;
    }
    onSave(draft);
    setLocalError(null);
    setSaved(true);
  };

  return (
    <div className="space-y-5 pb-2">
      <div className="w-14 h-14 bg-[var(--accent)]/10 rounded-2xl flex items-center justify-center text-[var(--accent)]">
        <KeyRound size={28} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Chave da API Gemini', 'Gemini API Key')}</h3>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          {t(
            'Informe sua própria chave do Google AI Studio. Ela fica salva apenas neste navegador.',
            'Enter your own Google AI Studio key. It is stored only in this browser.'
          )}
        </p>
      </div>

      <input
        type="password"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setLocalError(null);
          setSaved(false);
          onClearError?.();
        }}
        placeholder="AIza..."
        className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none font-mono"
      />

      {(localError || error) && (
        <p className="text-xs text-[var(--destructive)] font-medium">{localError || error}</p>
      )}

      {saved && (
        <p className="text-xs text-[var(--accent)] font-medium">{t('Chave salva neste navegador.', 'Key saved in this browser.')}</p>
      )}

      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        {t('Obtenha uma chave em', 'Get a key at')}{' '}
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] underline break-all"
        >
          aistudio.google.com/app/apikey
        </a>
      </p>

      <button
        onClick={handleSave}
        className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
      >
        {t('Salvar chave', 'Save key')}
      </button>
    </div>
  );
}

// --- MODAL COMPONENTS ---

function AssetModal({ asset, onClose, privacyMode, onDelete, onSave, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ ...asset });

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert(t('Por favor, insira um nome para o ativo.', 'Please enter a name for the asset.'));
      return;
    }
    if (formData.value < 0) {
      alert(t('O valor não pode ser negativo.', 'The value cannot be negative.'));
      return;
    }
    const { id, ...updateData } = formData;
    onSave(asset.id, updateData);
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={isEditing ? t("Editar Ativo", "Edit Asset") : asset.name}
      subtitle={isEditing ? undefined : asset.type}
      ariaLabel={asset.name}
      headerAction={
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-app)] hover:text-[var(--accent)]"
          aria-label={isEditing ? t("Cancelar edição", "Cancel editing") : t("Editar ativo", "Edit asset")}
        >
          {isEditing ? <ArrowLeft size={20} /> : <Edit2 size={20} />}
        </button>
      }
    >
      <div className="space-y-6">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Nome", "Name")}</label>
              <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Valor (R$)", "Value (R$)")}</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
                <input
                  type="text"
                  value={(formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormData({...formData, value: parseInt(val || '0') / 100});
                  }}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none">
                <option value="liquidity">{t("Liquidez", "Liquidity")}</option>
                <option value="investment">{t("Investimento", "Investment")}</option>
                <option value="physical">{t("Bem Físico", "Physical Asset")}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Detalhes", "Details")}</label>
              <textarea value={formData.detail} onChange={e => setFormData({...formData, detail: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none h-24" />
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button onClick={() => onDelete(asset.id)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--trend-down)]/10 py-4 text-xs font-bold uppercase tracking-widest text-[var(--trend-down)] transition-colors hover:bg-[var(--trend-down)]/20">
                <Trash2 size={16} /> {t("Excluir", "Delete")}
              </button>
              <button onClick={handleSave} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-xs font-bold uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)]/80">
                <Save size={16} /> {t("Salvar", "Save")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-3xl font-mono tracking-tighter text-[var(--text-primary)] sm:text-4xl">
                {privacyMode ? '••••••' : (asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              {asset.change && <p className="text-xs font-bold text-[var(--accent)]">{asset.change} {t("no período", "in period")}</p>}
            </div>
            <div className="h-px bg-[var(--border-card)]" />
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{asset.detail}</p>
            <button onClick={() => setIsEditing(true)} className="w-full rounded-2xl bg-[var(--text-primary)] py-4 text-[10px] font-black uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)] sm:py-5">
              {t("Editar Ativo", "Edit Asset")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function ProcessingOverlay({ language, stage, progress }: { language: string, stage: string, progress: number }) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-[var(--bg-card)]/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center"
    >
      <div className="relative w-24 h-24 mb-8">
        {/* Logo Pulsante Neon */}
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            filter: ["drop-shadow(0 0 5px var(--accent))", "drop-shadow(0 0 20px var(--accent))", "drop-shadow(0 0 5px var(--accent))"]
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 flex items-center justify-center text-[var(--accent)]"
        >
          <Sparkles size={48} />
        </motion.div>
        
        {/* Spinner Externo */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute -inset-2 border-2 border-dashed border-[var(--accent)]/30 rounded-full"
        />
      </div>

      <div className="space-y-4 w-full max-w-[240px]">
        <motion.h4 
          key={stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.3em]"
        >
          {stage}
        </motion.h4>
        
        {/* Barra de Progresso Customizada */}
        <div className="h-1 w-full bg-[var(--bg-app)] rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
          />
        </div>

        <p className="text-[10px] text-[var(--text-muted)] font-medium">
          {t("Extraindo dados com Agente 03...", "Extracting data with Agent 03...")}
        </p>
      </div>
    </motion.div>
  );
}

function AddAssetModal({ onClose, onAdd, language, investorProfile, user, getApiKey, onApiKeyError }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({ name: '', value: 0, type: 'liquidity', detail: '' });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStage, setExtractionStage] = useState('');
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleAdd = () => {
    if (!formData.name.trim()) {
      alert(t('Por favor, insira um nome para o ativo.', 'Please enter a name for the asset.'));
      return;
    }
    if (formData.value < 0) {
      alert(t('O valor não pode ser negativo.', 'The value cannot be negative.'));
      return;
    }
    onAdd(formData);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    setExtractionError(null);
    setIsExtracting(true);
    setExtractionStage(t("Lendo arquivo...", "Reading file..."));
    setExtractionProgress(0.1);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const isSpreadsheet = ['xlsx', 'xls', 'csv', 'tsv'].includes(extension || '');
      const isImageOrPdf = ['png', 'jpg', 'jpeg', 'pdf'].includes(extension || '');
      
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        setExtractionStage(t("Extraindo metadados...", "Extracting metadata..."));
        setExtractionProgress(0.4);

        let documentInput: { data?: string; text?: string; mimeType?: string };

        if (isSpreadsheet) {
          const { read, utils } = await import('xlsx');
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = read(data, { type: 'array' });
          let content = "";
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            content += `Sheet: ${sheetName}\n${utils.sheet_to_csv(worksheet)}\n`;
          });
          documentInput = { text: `Document content (Spreadsheet converted to CSV):\n${content}` };
        } else if (isImageOrPdf) {
          const base64Data = e.target?.result?.toString().split(',')[1];
          if (!base64Data) {
            setIsExtracting(false);
            return;
          }
          documentInput = { data: base64Data, mimeType: file.type || 'application/octet-stream' };
        } else {
          documentInput = { text: `Document content (Text):\n${e.target?.result?.toString()}` };
        }

        setExtractionStage(t("Consultando IA Zenith...", "Consulting Zenith AI..."));
        setExtractionProgress(0.8);

        const result = await extractAssets(apiKey, {
          ...documentInput,
          investorProfile
        });

        
        setExtractionStage(t("Sincronizando Carteira...", "Syncing Wallet..."));
        setExtractionProgress(0.9);

        if (result.ativos && result.ativos.length > 0) {
          const batch = writeBatch(db);
          result.ativos.forEach((ativo: any) => {
            const docRef = doc(collection(db, 'assets'));
            batch.set(docRef, {
              ...ativo,
              uid: user.uid,
              createdAt: serverTimestamp(),
              detail: result.insight || `Extraído automaticamente de: ${file.name}`
            });
          });
          
          await batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'assets'));
          
          // Preencher o formulário com o primeiro ativo para feedback visual se necessário, 
          // ou apenas fechar o modal se for uma importação em massa.
          // Aqui vamos apenas fechar o modal e deixar o listener do Firestore atualizar a lista.
          setExtractionProgress(1.0);
          setTimeout(() => {
            setIsExtracting(false);
            onClose(); // Fecha o modal após importação em massa
          }, 800);
        } else {
          setIsExtracting(false);
          alert(t("Nenhum ativo detectado no documento.", "No assets detected in the document."));
        }
      };

      if (isSpreadsheet) {
        reader.readAsArrayBuffer(file);
      } else if (isImageOrPdf) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    } catch (error) {
      console.error("Erro na extração:", error);
      setIsExtracting(false);
      setExtractionError(getAiErrorMessage(error, language));
      onApiKeyError(error);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={t("Novo Ativo", "New Asset")}
      closeLabel={t("Fechar", "Close")}
    >
      <div className="space-y-5">
        <AnimatePresence>
          {isExtracting && (
            <ProcessingOverlay
              language={language}
              stage={extractionStage}
              progress={extractionProgress}
            />
          )}
        </AnimatePresence>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-4 text-center transition-all sm:p-6 ${dragActive ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-card)] hover:border-[var(--text-muted)]'}`}
        >
          {isExtracting ? (
            <>
              <Loader2 size={32} className="text-[var(--accent)] animate-spin" />
              <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest">{t("Extraindo dados com IA...", "Extracting data with AI...")}</p>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-app)] text-[var(--text-muted)]">
                <FileUp size={20} />
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{t("Extração Automática", "Automatic Extraction")}</p>
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{t("Arraste seu extrato ou comprovante aqui para preencher os dados automaticamente.", "Drag your statement or receipt here to fill in data automatically.")}</p>
              </div>
              <input
                type="file"
                className="absolute inset-0 cursor-pointer opacity-0"
                accept="image/*,application/pdf,.csv,.xlsx,.tsv"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
              />
            </>
          )}
        </div>

        {extractionError && (
          <p className="text-[10px] font-medium leading-relaxed text-[var(--trend-down)]">{extractionError}</p>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Nome", "Name")}</label>
            <input placeholder={t("Ex: Carteira de Ações", "Ex: Stock Wallet")} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Valor (R$)", "Value (R$)")}</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
              <input
                type="text"
                value={(formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setFormData({...formData, value: parseInt(val || '0') / 100});
                }}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none">
              <option value="liquidity">{t("Liquidez", "Liquidity")}</option>
              <option value="investment">{t("Investimento", "Investment")}</option>
              <option value="physical">{t("Bem Físico", "Physical Asset")}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Detalhes", "Details")}</label>
            <textarea placeholder={t("Descrição curta...", "Short description...")} value={formData.detail} onChange={e => setFormData({...formData, detail: e.target.value})} className="mt-1 h-24 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none" />
          </div>
          <button onClick={handleAdd} className="mt-2 w-full rounded-2xl bg-[var(--accent)] py-4 text-[10px] font-black uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)]/80">
            {t("Adicionar Ativo", "Add Asset")}
          </button>
        </div>
      </div>
    </Modal>
  );
}


// --- SUB-COMPONENTS ---

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-all relative ${active ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
    >
      {active && (
        <motion.div 
          layoutId="activeNav"
          className="absolute -top-12 w-8 h-1 bg-[var(--accent)] rounded-full shadow-[0_0_10px_var(--accent)]" 
        />
      )}
      {icon}
      <span className="text-[8px] font-bold uppercase tracking-tight">{label}</span>
    </button>
  );
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-[var(--bg-card-hover)] rounded-xl ${className}`} />
  );
}

function IngestionHub({ isOpen, onClose, onProcess, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  const options = [
    { id: 'scanner', icon: <QrCode size={20} />, label: t('Scanner QR/Boleto', 'QR/Boleto Scanner'), color: '#00FFA3' },
    { id: 'upload', icon: <FileText size={20} />, label: t('Upload de Documentos', 'Document Upload'), color: '#007AFF' },
    { id: 'spreadsheet', icon: <Table size={20} />, label: t('Importar Planilha', 'Import Spreadsheet'), color: '#FF9500' },
    { id: 'manual', icon: <Edit3 size={20} />, label: t('Lançamento Manual', 'Manual Entry'), color: '#FF2D55' },
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      variant="sheet"
      showHandle
      title={t('Hub de Ingestão', 'Ingestion Hub')}
      closeLabel={t('Fechar', 'Close')}
    >
      <div className="grid grid-cols-2 gap-3 pb-1">
        {options.map((opt, idx) => (
          <button
            key={`ingest-item-${opt.id}-${idx}`}
            onClick={() => onProcess(opt.id)}
            className="group flex flex-col items-center justify-center rounded-2xl border border-[var(--border-card)] bg-[var(--bg-app)] p-3 transition-all hover:bg-[var(--bg-card-hover)] sm:p-5"
          >
            <div
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110 sm:h-12 sm:w-12"
              style={{ backgroundColor: `${opt.color}20`, color: opt.color }}
            >
              {opt.icon}
            </div>
            <span className="text-center text-[11px] font-bold leading-tight tracking-tight text-[var(--text-secondary)] sm:text-xs">
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ReviewModal({ transaction, onConfirm, onCancel, language, isProcessing }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({ ...transaction });

  useEffect(() => {
    if (transaction) setFormData({ ...transaction });
  }, [transaction]);

  if (!transaction && !isProcessing) return null;

  const handleConfirm = () => {
    onConfirm(formData);
  };

  return (
    <Modal
      open={Boolean(transaction || isProcessing)}
      onClose={onCancel}
      variant="center"
      icon={isProcessing ? <Sparkles size={26} /> : <Zap size={26} />}
      eyebrow={isProcessing ? t('Analisando Documento', 'Analyzing Document') : t('IA Detectou', 'AI Detected')}
      title={isProcessing ? t('Processando IA...', 'Processing AI...') : t('Revisar Lançamento', 'Review Entry')}
      closeOnBackdrop={!isProcessing}
      closeOnEscape={!isProcessing}
      showClose={!isProcessing}
      closeLabel={t('Fechar', 'Close')}
    >
      {isProcessing ? (
        <div className="space-y-6 py-2">
          <div className="relative mx-auto h-20 w-20 rounded-3xl bg-[var(--accent)]/10 flex items-center justify-center">
            <Sparkles size={40} className="text-[var(--accent)] animate-pulse" />
            <div className="absolute inset-0 border-4 border-[var(--accent)] border-t-transparent rounded-3xl animate-spin" />
          </div>
          <div className="space-y-3">
            <Shimmer className="h-12 w-full" />
            <Shimmer className="h-12 w-3/4 mx-auto" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4 rounded-3xl border border-[var(--border-card)] bg-[var(--bg-app)] p-4 sm:p-6">
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Título', 'Title')}</span>
              <span className="text-sm font-medium text-[var(--text-primary)] text-right">{transaction.label}</span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Data', 'Date')}</span>
              <span className="text-sm font-medium text-[var(--text-primary)] text-right">
                {transaction.date?.toDate
                  ? transaction.date.toDate().toLocaleDateString('pt-BR')
                  : transaction.date
                    ? new Date(transaction.date).toLocaleDateString('pt-BR')
                    : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Valor', 'Value')}</span>
              <span className="text-base font-mono font-bold text-[var(--accent)] sm:text-lg">R$ {transaction.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Categoria', 'Category')}</span>
              <select
                className="max-w-[60%] bg-transparent text-base font-medium text-[var(--text-primary)] outline-none border-b border-[var(--border-card)] focus:border-[var(--accent)] transition-colors cursor-pointer sm:text-sm"
                value={formData.categoria_primaria || formData.category}
                onChange={(e) => {
                  const newCat = e.target.value;
                  setFormData({ ...formData, categoria_primaria: newCat, category: newCat });
                }}
              >
                <option value="Moradia">Moradia</option>
                <option value="Alimentação">Alimentação</option>
                <option value="Energia">Energia</option>
                <option value="Água">Água</option>
                <option value="Transporte">Transporte</option>
                <option value="Lazer">Lazer</option>
                <option value="Investimentos">Investimentos</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={onCancel}
              className="rounded-2xl bg-[var(--bg-app)] py-4 text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]/60 transition-colors hover:bg-[var(--bg-card-hover)]"
            >
              {t('Descartar', 'Discard')}
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-2xl bg-[var(--accent)] py-4 text-xs font-black uppercase tracking-widest text-[var(--bg-app)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all hover:scale-[1.02]"
            >
              {t('Confirmar', 'Confirm')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SummaryCard({ label, value, icon, onClick, privacy }: any) {
  return (
    <button 
      onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-4 rounded-[24px] flex flex-col items-start gap-2 active:scale-95 transition-transform hover:border-[var(--text-muted)] relative overflow-hidden group"
    >
      <div className="flex justify-between w-full items-start">
        <div className="text-[var(--text-secondary)]">{icon}</div>
        <MoreVertical size={12} className="text-[var(--text-muted)]" />
      </div>
      <div className="text-left z-10">
        <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-tight mb-0.5">{label}</p>
        <p className="text-[14px] font-mono font-bold text-[var(--text-primary)] tracking-tighter">
          {privacy ? '•••' : value}
        </p>
      </div>
    </button>
  );
}

function MiniMetricCard({ id, label, value, percent, trend, data, color, opacity, privacy, onSettings, resolveStyle, isExpense, children }: any) {
  const mainColor = color || resolveStyle(id, 'main_color', color);
  const showValues = resolveStyle(id, 'show_values', true);
  const gridStyle = resolveStyle(id, 'grid_style', 'none');
  const marginTop = Number(resolveStyle(id, 'margin_top', 0)) || 0;

  // For expenses, trend 'up' (increase) is bad (red)
  const isBadTrend = isExpense ? trend === 'up' : trend === 'down';
  const hasChartData = Array.isArray(data) && data.length > 0;

  return (
    <div 
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 sm:p-5 rounded-[24px] sm:rounded-[32px] flex flex-col gap-2 sm:gap-3 relative overflow-hidden group hover:border-[var(--accent)] transition-all"
      style={{ borderColor: color ? `${color}40` : 'var(--border-card)', opacity: opacity ?? 1 }}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-0">
        <div>
          <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
            <p className="text-[8px] sm:text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{label}</p>
            <button 
              onClick={onSettings}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              <SettingsIcon size={10} />
            </button>
          </div>
          <h4 className="text-[11px] sm:text-xl font-mono font-bold text-[var(--text-primary)] tracking-tighter">
            {privacy ? '••••••' : value}
          </h4>
        </div>
        <div className={`text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg ${!isBadTrend ? 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]' : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'}`}>
          {percent}
        </div>
      </div>
      
      <div className="h-8 sm:h-12 w-full mt-1 sm:mt-2">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: marginTop, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid 
                vertical={gridStyle === 'vertical' || gridStyle === 'both'} 
                horizontal={gridStyle === 'horizontal' || gridStyle === 'both'} 
                stroke="var(--border-card)" 
                strokeDasharray="3 3"
                opacity={0.2}
              />
              <defs>
                <linearGradient id={`color-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={mainColor} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={mainColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="v" 
                stroke={mainColor} 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill={`url(#color-${label})`} 
                animationDuration={2000}
                hide={!showValues}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <div className="w-2/3 border-t border-dashed border-[var(--border-card)]" />
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

function DDASuggestion({ dda, onAccept, onReject, privacy, language }: { dda: DDA, onAccept: (dda: DDA) => void, onReject: (dda: DDA) => void, privacy: boolean, language: string }) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-4 flex items-center justify-between gap-4 overflow-hidden"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
          <ShieldCheck size={20} />
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest">{t("Sugestão DDA", "DDA Suggestion")}</p>
          <h4 className="text-sm font-medium text-[var(--text-primary)]">{dda.beneficiary}</h4>
          <p className="text-[10px] text-[var(--text-muted)]">
            {privacy ? '••••••' : (dda.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} • 
            {t("Vencimento", "Due Date")}: {dda.dueDate?.toDate ? dda.dueDate.toDate().toLocaleDateString('pt-BR') : 'Hoje'} • 
            CPF: {dda.cpf || t('Não informado', 'Not provided')}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={() => onReject(dda)}
          className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={18} />
        </button>
        <button 
          onClick={() => onAccept(dda)}
          className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-app)] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
        >
          {t("Aceitar", "Accept")}
        </button>
      </div>
    </motion.div>
  );
}

function HomeInvestmentCard({ saldoTotal, perfilAtual, privacyMode, allocatedPercent, onClick }: any) {
  const allocation = Math.max(0, Math.min(100, Number(allocatedPercent) || 0));

  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] flex flex-col gap-4 relative overflow-hidden group cursor-pointer"
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">Meus Investimentos</p>
          <h4 className="text-2xl font-mono font-bold text-[var(--text-primary)] tracking-tighter mt-1">
            {privacyMode ? '••••••' : (saldoTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h4>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
          <TrendingUp size={20} />
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Foco: {perfilAtual}</span>
          <span className="text-[10px] text-[var(--accent)] font-bold">{allocation}% do patrimônio</span>
        </div>
        <div className="h-2 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${allocation}%` }}
            className="h-full bg-[var(--accent)]"
          />
        </div>
      </div>
    </motion.div>
  );
}

function DetalhesGastosPage({ 
  transactions, 
  language, 
  onEdit, 
  onDelete 
}: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [period, setPeriod] = useState<'current' | 'previous' | 'all'>('current');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const getTransactionDate = (tx: any): Date | null => {
    if (!tx?.date) return null;
    const date = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const monthBalance = transactions.reduce((acc: number, tx: any) => {
    const date = getTransactionDate(tx);
    if (!date || date.getMonth() !== currentMonth || date.getFullYear() !== currentYear) return acc;
    const value = Number(tx.value) || 0;
    return acc + (tx.type === 'out' ? -value : value);
  }, 0);

  const filteredTransactions = transactions.filter((tx: any) => {
    if (period === 'all') return true;
    const date = getTransactionDate(tx);
    if (!date) return false;
    if (period === 'current') {
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }
    return date.getMonth() === previousMonthDate.getMonth() && date.getFullYear() === previousMonthDate.getFullYear();
  });

  const getIcon = (cat: string) => {
    switch (cat) {
      case 'Moradia': return <LayoutGrid size={20} />;
      case 'Energia': return <Zap size={20} />;
      case 'Água': return <TrendingUp size={20} />;
      case 'Mercado': return <CreditCard size={20} />;
      default: return <History size={20} />;
    }
  };

  const getColor = (cat: string) => {
    switch (cat) {
      case 'Moradia': return 'var(--trend-down)';
      case 'Energia': return 'var(--accent)';
      case 'Água': return '#3498db';
      default: return 'var(--text-muted)';
    }
  };

  const periodOptions = [
    { id: 'current' as const, label: t('Mês Atual', 'Current Month') },
    { id: 'previous' as const, label: t('Mês Anterior', 'Previous Month') },
    { id: 'all' as const, label: t('Todos', 'All') },
  ];

  return (
    <div className="space-y-8 pb-32">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('Carteira', 'Wallet')}</h2>
          <p className="text-[var(--text-muted)] text-xs">{t('Gestão financeira completa', 'Complete financial management')}</p>
        </div>
      </header>

      {/* Card Saldo do Mês */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-[var(--accent)]/10 transition-colors" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em]">{t("Resumo Financeiro", "Financial Summary")}</span>
            <div className="flex items-center gap-3 mt-1">
              <h3 className="text-2xl font-medium text-[var(--text-primary)]">{t("Saldo do Mês", "Month Balance")}</h3>
            </div>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${monthBalance >= 0 ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]'}`}>
            <TrendingUp size={24} />
          </div>
        </div>
        <p className={`text-4xl font-mono tracking-tighter ${monthBalance >= 0 ? 'text-[var(--accent)]' : 'text-[var(--trend-down)]'}`}>
          {monthBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
          {t("Entradas menos saídas do mês atual", "Income minus expenses for the current month")}
        </p>
      </section>

      {/* Histórico de Transações */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest">{t("Histórico de Transações", "Transaction History")}</h2>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">{filteredTransactions.length} {t("itens", "items")}</span>
          </div>
          <div className="flex gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl w-full sm:w-auto">
            {periodOptions.map(option => (
              <button
                key={option.id}
                onClick={() => setPeriod(option.id)}
                className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${period === option.id ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredTransactions.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-[var(--border-card)] rounded-[32px]">
              <History size={32} className="mx-auto text-[var(--text-muted)] mb-3 opacity-30" />
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                {t("Nenhuma transação neste período", "No transactions in this period")}
              </p>
            </div>
          ) : filteredTransactions.map((tx: any, idx: number) => {
            const isIncome = tx.type !== 'out';
            const value = Math.abs(Number(tx.value) || 0);
            const date = getTransactionDate(tx);

            return (
              <motion.div 
                key={`transaction-history-${tx.id}-${idx}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-between items-center p-4 bg-[var(--bg-card)] rounded-[24px] border border-[var(--border-card)] group hover:border-[var(--accent)] transition-all"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isIncome ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-[var(--trend-down)]/10'}`}
                    style={isIncome ? undefined : { color: getColor(tx.categoria_primaria) }}
                  >
                    {getIcon(tx.categoria_primaria)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{tx.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider">
                      {date ? date.toLocaleDateString('pt-BR') : t("Recente", "Recent")}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className={`text-base font-mono font-bold ${isIncome ? 'text-[var(--accent)]' : 'text-[var(--trend-down)]'}`}>
                      {isIncome ? '+' : '-'} {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <div className="flex gap-1 mt-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => onEdit(tx)}
                        className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors bg-white/5 rounded-lg sm:bg-transparent"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button 
                        onClick={() => onDelete(tx)}
                        className="p-2 text-[var(--text-muted)] hover:text-[var(--trend-down)] transition-colors bg-white/5 rounded-lg sm:bg-transparent"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InvestmentsView({ assets, investorProfile, onAssetClick, onSeed, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [activeTab, setActiveTab] = useState<'Ativos' | 'Subcategorias' | 'Estratégias'>('Ativos');

  const filteredAssets = assets.filter((a: any) => a.type === 'investment');

  return (
    <div className="space-y-6 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-medium text-[var(--text-primary)]">{t("Investimentos", "Investments")}</h2>
          <p className="text-[var(--text-muted)] text-xs">{t(`Perfil: ${investorProfile}`, `Profile: ${investorProfile}`)}</p>
        </div>
        <div className="flex bg-[var(--bg-card)] p-1 rounded-xl border border-[var(--border-card)]">
          {['Ativos', 'Subcategorias', 'Estratégias'].map((tab: any) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)]'}`}
            >
              {t(tab, tab)}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'Ativos' && (
        <div className="grid grid-cols-1 gap-3">
          {filteredAssets.map((asset: any, idx: number) => (
            <button 
              key={`asset-item-${asset.id}-${idx}`}
              onClick={() => onAssetClick(asset)}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] p-4 rounded-[24px] flex items-center justify-between hover:border-[var(--accent)] transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-app)] flex items-center justify-center text-[var(--accent)] group-hover:scale-110 transition-transform">
                  <Landmark size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">{asset.name}</h4>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">{asset.emissor || 'Zenith Core'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-bold text-[var(--text-primary)]">{(asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                <p className="text-[10px] text-[var(--accent)] font-bold">+1.2%</p>
              </div>
            </button>
          ))}
          {filteredAssets.length === 0 && (
            <div className="py-20 text-center border border-dashed border-[var(--border-card)] rounded-[40px] flex flex-col items-center gap-4">
              <p className="text-[var(--text-muted)] text-sm">{t("Nenhum investimento encontrado.", "No investments found.")}</p>
              <button 
                onClick={onSeed}
                className="px-6 py-3 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
              >
                {t("Gerar Carteira de Exemplo", "Generate Sample Portfolio")}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Subcategorias' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-3 flex justify-between items-center shadow-lg">
            <span className="text-[10px] font-bold text-black uppercase tracking-widest">{t("Subcategoria", "Subcategory")}</span>
            <div className="flex gap-8">
              <span className="text-[10px] font-bold text-black uppercase tracking-widest">%</span>
              <span className="text-[10px] font-bold text-black uppercase tracking-widest">{t("Valor", "Value")}</span>
            </div>
          </div>
          <div className="space-y-2">
            {['Renda Fixa', 'Ações', 'FIIs', 'Cripto'].map((cat, idx) => {
              const catAssets = filteredAssets.filter((a: any) => a.subcategoria === cat);
              const total = catAssets.reduce((acc: number, a: any) => acc + (a.value ?? 0), 0);
              if (total === 0 && cat !== 'Renda Fixa') return null;
              return (
                <div key={`subcat-${cat}-${idx}`} className="bg-[var(--bg-card)] border-l-4 border-[var(--accent)] p-4 rounded-r-xl flex justify-between items-center border-y border-r border-[var(--border-card)]">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{cat}</span>
                  <div className="flex gap-8 items-center">
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">25%</span>
                    <span className="text-sm font-mono font-bold text-[var(--text-primary)]">{(total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'Estratégias' && (
        <div className="grid grid-cols-2 gap-4">
          {['Reserva', 'Aposentadoria', 'Viagem', 'Liberdade'].map((est, idx) => (
            <div key={`strat-${est}-${idx}`} className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] flex flex-col gap-4">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                <Sparkles size={20} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-[var(--text-primary)]">{est}</h4>
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Estratégia</p>
              </div>
              <p className="text-lg font-mono font-bold text-[var(--text-primary)]">R$ 0,00</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetDeepDiveModal({ asset, onClose, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const realProfitability = calculateRealProfitability(12.5, asset.taxaInflacao || 4.5);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-[#121212] border-t border-[var(--border-card)] rounded-t-[40px] p-8 pb-12 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="w-12 h-1.5 bg-[var(--border-card)] rounded-full mx-auto mb-8" />
        
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{asset.name}</h2>
            <p className="text-white/40 text-sm">{asset.emissor || 'Zenith Core'}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-8">
          {/* RENTABILIDADE REAL CARD */}
          <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 p-6 rounded-[32px] flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest mb-1">{t("Rentabilidade Real", "Real Profitability")}</p>
              <h4 className="text-2xl font-mono font-bold text-white">{(realProfitability * 100).toFixed(2)}% <span className="text-sm">a.a</span></h4>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)]">
              <ShieldCheck size={24} />
            </div>
          </div>

          {/* CHART PLACEHOLDER */}
          <div className="h-48 w-full bg-white/5 rounded-[32px] border border-white/10 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[{v:10}, {v:15}, {v:12}, {v:20}, {v:18}, {v:25}]}>
                  <Area type="monotone" dataKey="v" stroke="var(--accent)" fill="var(--accent)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col items-center gap-2 z-10">
              <BarChartIcon size={32} className="text-[var(--accent)]" />
              <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{t("Gráfico de Evolução", "Evolution Chart")}</p>
            </div>
          </div>

          {/* IA INSIGHTS */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--accent)]" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Insights Zenith IA</span>
            </div>
            <div className="bg-white/5 p-6 rounded-[32px] border border-white/10">
              <p className="text-sm text-white/70 leading-relaxed">
                {t(
                  `Com base no seu perfil ${asset.subcategoria === 'Renda Fixa' ? 'Conservador' : 'Estratégico'}, este ativo mantém seu poder de compra acima da inflação estimada em ${asset.taxaInflacao || 4.5}%. Recomendamos manter a posição para o longo prazo.`,
                  `Based on your ${asset.subcategoria === 'Renda Fixa' ? 'Conservative' : 'Strategic'} profile, this asset maintains your purchasing power above the estimated inflation of ${asset.taxaInflacao || 4.5}%. We recommend holding the position for the long term.`
                )}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function AddTransactionModal({ onClose, onAdd, initialData, language }: { onClose: () => void, onAdd: (data: any) => void, initialData?: any, language: string }) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({
    label: initialData?.label || '',
    value: initialData?.value || 0,
    type: initialData?.type || 'out' as 'in' | 'out' | 'yield',
    categoria_primaria: initialData?.categoria_primaria || initialData?.category || 'Outros',
    date: initialData?.date ? (initialData.date.toDate ? initialData.date.toDate().toISOString().split('T')[0] : initialData.date) : new Date().toISOString().split('T')[0]
  });
  const [displayValue, setDisplayValue] = useState(initialData?.value ? (initialData.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '');

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numericValue = parseInt(rawValue || '0') / 100;
    setFormData({ ...formData, value: numericValue });
    setDisplayValue((numericValue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.label || formData.value <= 0) {
      alert(t('Preencha todos os campos corretamente.', 'Fill in all fields correctly.'));
      return;
    }
    onAdd(formData);
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={initialData ? t('Editar Transação', 'Edit Transaction') : t('Nova Transação', 'New Transaction')}
      closeLabel={t('Fechar', 'Close')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Descrição", "Description")}</label>
          <input
            type="text"
            required
            placeholder={t("Ex: Recebimento Pix", "Ex: Pix Receipt")}
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors sm:p-4"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Valor", "Value")}</label>
          <input
            type="text"
            required
            placeholder="R$ 0,00"
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors font-mono sm:p-4"
            value={displayValue}
            onChange={handleValueChange}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Data", "Date")}</label>
          <input
            type="date"
            required
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors sm:p-4"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[
              { id: 'in', label: t('Entrada', 'Income'), color: 'var(--trend-up)' },
              { id: 'out', label: t('Saída', 'Expense'), color: 'var(--trend-down)' },
              { id: 'yield', label: t('Rendimento', 'Yield'), color: 'var(--trend-yield)' }
            ].map((t_type, idx) => (
              <button
                key={`tx-type-opt-${t_type.id}-${idx}`}
                type="button"
                onClick={() => setFormData({ ...formData, type: t_type.id as any })}
                className={`rounded-xl border py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all sm:py-3 ${formData.type === t_type.id ? 'bg-[var(--text-primary)]/5 border-[var(--text-primary)]/20 text-[var(--text-primary)]' : 'bg-transparent border-[var(--border-card)] text-[var(--text-muted)]'}`}
                style={{ borderColor: formData.type === t_type.id ? t_type.color : undefined }}
              >
                {t_type.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Categoria", "Category")}</label>
          <select
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors sm:p-4"
            value={formData.categoria_primaria}
            onChange={(e) => setFormData({ ...formData, categoria_primaria: e.target.value })}
          >
            <option value="Moradia">{t("Moradia", "Housing")}</option>
            <option value="Alimentação">{t("Alimentação", "Food")}</option>
            <option value="Energia">{t("Energia", "Energy")}</option>
            <option value="Água">{t("Água", "Water")}</option>
            <option value="Transporte">{t("Transporte", "Transport")}</option>
            <option value="Lazer">{t("Lazer", "Leisure")}</option>
            <option value="Investimentos">{t("Investimentos", "Investments")}</option>
            <option value="Outros">{t("Outros", "Others")}</option>
          </select>
        </div>

        <button
          type="submit"
          className="mt-4 w-full rounded-2xl bg-[var(--accent)] py-4 text-sm font-bold uppercase tracking-widest text-[var(--bg-app)] transition-all hover:bg-[var(--accent)]/80"
        >
          {initialData ? t('Salvar Alterações', 'Save Changes') : t('Confirmar Transação', 'Confirm Transaction')}
        </button>
      </form>
    </Modal>
  );
}
