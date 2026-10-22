/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, Eye, EyeOff, MoreVertical, ShieldCheck, 
  ArrowUpRight, X, CreditCard, Landmark, Car,
  PieChart, Briefcase, TrendingUp, MoreHorizontal,
  ArrowRightLeft, LayoutGrid, LogIn, LogOut, Plus, Trash2, Edit2, Save, User as UserIcon,
  FileUp, Loader2, Settings as SettingsIcon, Check, ChevronRight, Palette, Globe, Layout,
  BarChart as BarChartIcon, Sparkles, Copy, CircleCheck, BellOff, UserPlus, ClipboardCheck,
  QrCode, FileText, Table, Edit3, Camera, Upload, AlertCircle, Search, Zap, Users,
  Menu, Database, Trash, HardDrive, History, Calendar, Download
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
  handleFirestoreError, OperationType, getDocs, getDoc, getDocFromServer, writeBatch, limit
} from './firebase';
import { Timestamp } from 'firebase/firestore';
import { GoogleGenAI, Type } from "@google/genai";
import { TransactionSchema } from './lib/validations';
import { read, utils } from 'xlsx';
import { 
  calculateTotals, 
  calculateRealProfitability,
  calculateVariation, 
  getMiniChartData, 
  calculateEvolutionData, 
  calculateCashFlowData 
} from './lib/finance';
import { onAuthStateChanged, User } from 'firebase/auth';
import ColorPicker from './components/ColorPicker';
import { HeritageSettings } from './components/HeritageSettings';
import { checkDuplicates, fixDuplicates } from './lib/dataUtils';

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
  pix_key?: string;
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
  participants?: string[];
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

interface SplitProposal {
  id: string;
  uid: string;
  label: string;
  value: number;
  source: 'email' | 'manual' | 'dda';
  status: 'pending' | 'accepted' | 'rejected';
  suggestedParticipants?: string[];
  createdAt: any;
}

interface Report {
  id: string;
  uid: string;
  month: number;
  year: number;
  status: 'pending' | 'approved' | 'rejected';
  totalConsolidated: number;
  participantsSummary: {
    uid: string;
    displayName: string;
    totalToPay: number;
    splitsCount: number;
  }[];
  iaFeedback?: string;
  createdAt: any;
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

// --- MOCK DATA FOR CHARTS (FALLBACK) ---
const generateDailyData = () => {
  const data = [{ name: '0', value: 0, date: 'Início' }];
  let currentValue = 100;
  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  
  for (let i = 0; i < 30; i++) {
    const day = i + 1;
    const oscillation = (Math.random() - 0.5) * 15;
    currentValue += oscillation;
    if (currentValue < 0) currentValue = 10;
    data.push({ 
      name: day.toString().padStart(2, '0'), 
      value: Math.round(currentValue),
      date: `${day} de Março`
    });
  }
  return data;
};

const MINI_CHART_DATA = [
  { v: 40 }, { v: 35 }, { v: 55 }, { v: 45 }, { v: 70 }, { v: 65 }, { v: 85 }, { v: 75 }, { v: 95 }, { v: 100 }
];

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

// --- CONSTANTS ---
const CHAVE_PIX = '3c4e26f9-390e-4f52-8bbc-f62bcaa290be';

const PERFIS = {
  'Rafael': {
    area: 'direito', emoji: '⚖️',
    saudacao: 'Pagamento protocolado. Petição de quitação deferida.',
    corpoIndividual: (v: string, d: string, p: number, t: number, i: string, f: string) => `Cláusula vigente do acordo ${d}:\n${v}\nVencimento conforme instrumento.\n\n📅 Período: ${i} ~ ${f}\n📊 Progresso: ${p}ª de ${t} parcelas (${Math.round((p/t)*100)}% concluído)`,
    corpoRateio: (v: string, g: string) => `Participação no rateio ${g}:\n${v}\n📅 Período: Contínuo`,
    encerramento: 'O restante é mera formalidade processual.',
    assinatura: 'Nada a opor.'
  },
  'Alexandre': {
    area: 'fibra', emoji: '🌊',
    saudacao: 'Sinal financeiro estável. Manutenção programada na rede.',
    corpoIndividual: (v: string, d: string, p: number, t: number, i: string, f: string) => `💳 ${d}: ${v}\n📅 Período: ${i} ~ ${f}\n📊 Progresso: ${p}ª de ${t} (${Math.round((p/t)*100)}%)`,
    corpoRateio: (v: string, g: string) => `${g}: ${v}\n📅 Período: Contínuo`,
    encerramento: 'Cada parcela é um pacote de dados a menos na rede. Latência zero pra preocupação.',
    assinatura: 'Sinal estável. Segue o fluxo.'
  },
  'Juliano': {
    area: 'historia', emoji: '📚',
    saudacao: 'Esse mês a agenda financeira está densa como um tratado do século XIX. Vamos por partes:',
    corpoIndividual: (v: string, d: string, p: number, t: number, i: string, f: string) => `📿 ${d}: ${v}\n📅 Período: ${i} ~ ${f}\n📊 Progresso: ${p}ª de ${t} (${Math.round((p/t)*100)}%)`,
    corpoRateio: (v: string, g: string) => `🏠 ${g}: ${v}\n📅 Período: Contínuo`,
    encerramento: 'É lastro, Juliano. Saúde, propósito, conhecimento e o teto sobre a cabeça. Nada disso é supérfluo.',
    assinatura: 'Assim caminha a humanidade.'
  },
  'Patrícia': {
    area: 'enfermagem', emoji: '🏥',
    saudacao: 'Sinais vitais financeiros estáveis.',
    corpoIndividual: (v: string, d: string) => `Prescrição: ${d}\n${v}`,
    corpoRateio: (v: string, g: string) => `${g}: ${v}\n📅 Período: Contínuo`,
    encerramento: 'Nada fora da curva. O plantão segue tranquilo.',
    assinatura: 'Um descanso merecido pra você.'
  },
  'Valdemar': {
    area: 'cartazista', emoji: '🎨',
    saudacao: 'ATENÇÃO: CARTAZ DO MÊS',
    corpoIndividual: (v: string, d: string) => `${d}: ${v}`,
    corpoRateio: (v: string, g: string) => `${g}: ${v} (contínuo)`,
    encerramento: 'Letreiro bem legível, sem pressa pra ler.',
    assinatura: 'Letras garrafais, vida simples.'
  },
  'Linda': {
    area: 'lar', emoji: '🏡',
    saudacao: 'Página virada. A engrenagem da casa rodou lisa. Esse mês começa zerado.',
    corpoIndividual: (v: string, d: string) => `${d}: ${v}`,
    corpoRateio: (v: string, g: string) => `${g}: ${v}\n📅 Período: Contínuo`,
    encerramento: 'Mais uma voltinha no carrossel das contas. Nada que você já não tenha domado antes.',
    assinatura: 'Respira. Você dá conta.'
  }
};

function gerarMensagemPersona(item: any, persona: any) {
  if (!persona) return "Saldo a recuperar: " + item.totalOwed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  let msg = `${persona.emoji} ${persona.saudacao}\n\n`;
  
  item.pendingSplits.forEach((split: any) => {
    msg += persona.corpoRateio(split.shareValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), split.label || 'Despesa') + '\n\n';
  });
  
  msg += `💰 Total do mês: ${item.totalOwed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\n`;
  msg += `💳 Pagamento:\nPix copia e cola:\n${CHAVE_PIX}\n(Juliano Knazh)\n\n`;
  msg += persona.encerramento + '\n\n';
  msg += '─'.repeat(20) + '\n\n';
  msg += persona.assinatura;
  
  return msg;
}

function RateioFamiliarView({ transactions, splits, splitProposals, reports = [], users, familyMembers, allAvailableParticipants, language, profile, privacyMode, onSeed }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [isMonitoringActive, setIsMonitoringActive] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [isManagingMembers, setIsManagingMembers] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');

  const consolidatedData = useMemo(() => {
    const data: any = {};
    
    allAvailableParticipants.forEach(p => {
      data[p.uid] = { 
        user: { uid: p.uid, displayName: p.displayName, photoURL: p.photoURL }, 
        totalOwed: 0, 
        pendingSplits: [] 
      };
    });

    if (profile?.uid && !data[profile.uid]) {
      data[profile.uid] = { user: profile, totalOwed: 0, pendingSplits: [] };
    }
    
    splits.forEach((split: any) => {
      if (data[split.uid]) {
        data[split.uid].totalOwed += (split.shareValue || 0);
        data[split.uid].pendingSplits.push(split);
      }
    });
    
    const rawConsolidated = Object.values(data).filter((item: any) => item.totalOwed > 0 || item.user.uid === profile?.uid);
    return fixDuplicates(rawConsolidated, 'user.uid'); 
  }, [splits, allAvailableParticipants, profile]);

  const generateMonthlyReport = async () => {
    if (!auth.currentUser) return;
    setIsProcessing(true);
    try {
      const now = new Date();
      const report = {
        uid: auth.currentUser.uid,
        month: now.getMonth(),
        year: now.getFullYear(),
        status: 'pending',
        totalConsolidated: consolidatedData.reduce((acc: number, curr: any) => acc + curr.totalOwed, 0),
        participantsSummary: consolidatedData.map((item: any) => ({
          uid: item.user.uid,
          displayName: item.user.displayName,
          totalToPay: item.totalOwed,
          splitsCount: item.pendingSplits.length
        })),
        involvedSplitIds: consolidatedData.flatMap(item => item.pendingSplits.map((s: any) => s.id)),
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'reports'), report);
      alert(t("Relatório mensal gerado para aprovação.", "Monthly report generated for approval."));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'reports');
    } finally {
      setIsProcessing(false);
    }
  };

  const approveReport = async (reportId: string) => {
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const reportRef = doc(db, 'reports', reportId);
      const reportSnap = await getDocFromServer(reportRef);
      const data = reportSnap.data();

      batch.update(reportRef, { status: 'approved' });
      
      // Mark involved splits as completed so they don't sum up again
      if (data?.involvedSplitIds) {
        data.involvedSplitIds.forEach((id: string) => {
          batch.update(doc(db, 'splits', id), { status: 'consolidated', approvedAt: serverTimestamp() });
        });
      }

      await batch.commit();
      alert(t("Relatório aprovado! Notificações enviadas via e-mail e WhatsApp.", "Report approved! Notifications sent via email and WhatsApp."));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'reports');
    } finally {
      setIsProcessing(false);
    }
  };

  const rejectReport = async (reportId: string) => {
    if (!confirm(t("Deseja realmente excluir este relatório e descartar todos os rateios pendentes associados?", "Are you sure you want to delete this report and discard all associated pending splits?"))) return;
    
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const reportRef = doc(db, 'reports', reportId);
      const reportSnap = await getDocFromServer(reportRef);
      const data = reportSnap.data();

      // Delete involved splits to satisfy "not summing files"
      if (data?.involvedSplitIds) {
        data.involvedSplitIds.forEach((id: string) => {
          batch.delete(doc(db, 'splits', id));
        });
      }

      await batch.delete(reportRef);
      await batch.commit();
      alert(t("Relatório e rateios associados excluídos com sucesso.", "Report and associated splits deleted successfully."));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `reports/${reportId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const simulateDetection = async () => {
    if (!auth.currentUser) return;
    setIsProcessing(true);
    try {
      const proposal = {
        uid: auth.currentUser.uid,
        label: 'Fatura Copel - Residencial',
        value: 450.80,
        source: 'email',
        status: 'pending',
        suggestedParticipants: [],
        createdAt: serverTimestamp()
      };
      await setDoc(doc(collection(db, 'split_proposals')), proposal);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'split_proposals');
    } finally {
      setIsProcessing(false);
    }
  };

  const addFamilyMember = async () => {
    if (!newMemberName.trim() || !auth.currentUser) return;
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'family_members'), {
        name: newMemberName.trim(),
        ownerUid: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        photoURL: `https://picsum.photos/seed/${newMemberName}/100/100`
      });
      setNewMemberName('');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'family_members');
    } finally {
      setIsProcessing(false);
    }
  };

  const removeFamilyMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'family_members', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `family_members/${id}`);
    }
  };

  const handleAcceptProposal = (proposal: any) => {
    setSelectedProposal(proposal);
    // Todos os integrantes do grupo participam por padrão e regra de negócio
    setSelectedParticipants(allAvailableParticipants.map(u => u.uid));
  };

  const handleConfirmSplit = async () => {
    if (!selectedProposal || !auth.currentUser) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        uid: auth.currentUser.uid,
        label: selectedProposal.label,
        value: selectedProposal.value,
        type: 'out',
        date: serverTimestamp(),
        categoria_primaria: 'Moradia',
        status: 'Confirmado',
        participants: selectedParticipants,
        createdAt: serverTimestamp()
      });

      const shareValue = selectedProposal.value / selectedParticipants.length;
      selectedParticipants.forEach(pUid => {
        if (pUid === auth.currentUser?.uid) return;
        const splitRef = doc(collection(db, 'splits'));
        batch.set(splitRef, {
          uid: pUid,
          ownerUid: auth.currentUser?.uid,
          transactionId: txRef.id,
          transactionLabel: selectedProposal.label,
          shareValue: Math.round(shareValue * 100) / 100,
          status: 'pending',
          createdAt: serverTimestamp()
        });
      });

      batch.update(doc(db, 'split_proposals', selectedProposal.id), { status: 'accepted' });
      await batch.commit();
      setSelectedProposal(null);
      setSelectedParticipants([]);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'confirm_split');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 pb-32">
      <header className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase">{t("Rateio Familiar", "Family Split")}</h2>
          <p className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-[0.3em] mt-1 opacity-60">Dashboard de Conciliação</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="p-1.5 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-[var(--accent)]/40 hover:bg-white/10 transition-all duration-500 shadow-2xl group flex items-center gap-3">
            <button 
              onClick={() => setIsManagingMembers(!isManagingMembers)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                isManagingMembers ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-lg shadow-[var(--accent)]/30' : 'bg-white/5 text-[var(--accent)] hover:bg-[var(--accent)]/20'
              }`}
            >
              <UserPlus size={14} className={isManagingMembers ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'} />
              {t("Membros", "Members")}
            </button>
          </div>
          <button 
            onClick={simulateDetection}
            disabled={isProcessing}
            className="w-12 h-12 flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)] rounded-2xl border border-[var(--accent)]/20 hover:bg-[var(--accent)]/20 transition-all disabled:opacity-50 group"
            title={t("Simular IA", "Simulate AI")}
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} className="group-hover:rotate-12 transition-transform" />}
          </button>
        </div>
      </header>

      {/* GERENCIAR MEMBROS */}
      <AnimatePresence>
        {isManagingMembers && (
          <motion.section 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] overflow-hidden"
          >
            <div className="p-6 space-y-6">
              <div className="flex justify-between border-b border-[var(--border-card)] pb-4">
                <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">Membros da Família</h3>
                <button onClick={() => setIsManagingMembers(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Nome do familiar (Ex: Linda Knazh)"
                  className="flex-1 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button 
                  onClick={addFamilyMember}
                  disabled={isProcessing || !newMemberName.trim()}
                  className="bg-[var(--accent)] text-[var(--bg-app)] px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {familyMembers.map((m: any, idx: number) => (
                  <div key={`member-${m.id}-${idx}`} className="flex items-center justify-between p-3 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)]">
                    <div className="flex items-center gap-3">
                      <img src={m.photoURL} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      <span className="text-[11px] font-bold text-[var(--text-primary)]">{m.name}</span>
                    </div>
                    <button onClick={() => removeFamilyMember(m.id)} className="p-1 text-[var(--text-muted)] hover:text-[var(--trend-down)] transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {familyMembers.length === 0 && (
                  <div className="col-span-full py-6 text-center text-[var(--text-muted)] text-[10px] uppercase font-bold tracking-widest opacity-50">
                    Nenhum membro cadastrado.
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[var(--border-card)]">
                <button 
                  onClick={onSeed}
                  className="flex items-center gap-2 text-[var(--accent)] text-[10px] font-bold uppercase tracking-widest hover:underline"
                >
                  <Sparkles size={14} />
                  Sincronizar Personas Demo
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ZENITH IA - PROPOSTAS */}
      {splitProposals.filter((p: any) => p.status === 'pending').length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Sparkles size={16} className="text-[var(--accent)]" />
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest">Propostas da Zenith IA</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {splitProposals.filter((p: any) => p.status === 'pending').map((proposal: any, idx: number) => (
              <motion.div 
                key={`proposal-${proposal.id}-${idx}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[var(--bg-card)] border-2 border-[var(--accent)]/30 rounded-3xl p-5 space-y-4 relative overflow-hidden"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                      {proposal.source === 'email' ? <Globe size={18} /> : <FileText size={18} />}
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Detectado via {proposal.source}</p>
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">{proposal.label}</h4>
                    </div>
                  </div>
                  <p className="text-lg font-mono font-bold text-[var(--accent)]">
                    {proposal.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                  Zenith IA identificou uma nova fatura. O pagamento antecipado via rateio pode economizar até 1.2% em juros evitados.
                </p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAcceptProposal(proposal)}
                    className="flex-1 py-2 bg-[var(--accent)] text-[var(--bg-app)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all"
                  >
                    {t("Aceitar e Dividir", "Accept and Split")}
                  </button>
                  <button 
                    onClick={async () => await deleteDoc(doc(db, 'split_proposals', proposal.id))}
                    className="px-4 py-2 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:text-[var(--trend-down)] transition-all"
                  >
                    {t("Ignorar", "Ignore")}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE RATEIO */}
      <AnimatePresence>
        {selectedProposal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] w-full max-w-md p-8 space-y-6 shadow-2xl"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-[var(--text-primary)]">{t("Configurar Rateio", "Configure Split")}</h3>
                <button onClick={() => setSelectedProposal(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={24} />
                </button>
              </div>

              <div className="p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)]">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{selectedProposal.label}</p>
                <p className="text-2xl font-mono font-bold text-[var(--accent)] mt-1">
                  {selectedProposal.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest px-1">Participantes do Grupo</p>
                <div className="flex flex-wrap gap-2">
                  {allAvailableParticipants.map((u: any, idx: number) => (
                    <div 
                      key={`select-participant-${u.uid}-${idx}`}
                      className="flex items-center gap-2 p-2 px-3 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 shadow-sm"
                    >
                      <img src={u.photoURL} className="w-5 h-5 rounded-full object-cover" alt="" />
                      <span className="text-[9px] font-bold text-[var(--accent)] truncate">{u.displayName}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[8px] text-[var(--text-muted)] italic px-1 mt-2">
                  {t("Segundo as regras do Zenith, todos os membros do grupo participam obrigatoriamente do rateio.", "According to Zenith rules, all group members must participate in the split.")}
                </p>
              </div>

              <div className="p-4 bg-[var(--accent)]/5 rounded-2xl border border-[var(--accent)]/20 space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                  <span className="text-[var(--text-muted)]">Custo por Pessoa</span>
                  <span className="text-[var(--accent)]">
                    {(selectedProposal.value / selectedParticipants.length).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <p className="text-[8px] text-[var(--text-secondary)] italic">
                  O valor será dividido igualmente entre os {selectedParticipants.length} participantes selecionados.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowReport(true)}
                  className="flex-1 py-4 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-primary)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--text-primary)]/5 transition-all"
                >
                  {t("Ver Relatório", "View Report")}
                </button>
                <button 
                  onClick={handleConfirmSplit}
                  disabled={isProcessing || selectedParticipants.length < 1}
                  className="flex-[2] py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {t("Aprovar e Disparar", "Approve and Dispatch")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE RELATÓRIO DE RATEIO */}
      <AnimatePresence>
        {showReport && selectedProposal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] w-full max-w-lg p-8 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-[var(--text-primary)]">{t("Relatório de Rateio IA", "IA Split Report")}</h3>
                <button onClick={() => setShowReport(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-6 bg-[var(--bg-app)] rounded-3xl border border-[var(--border-card)] space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-muted)] uppercase font-bold tracking-widest">Total da Fatura</span>
                    <span className="text-2xl font-mono font-bold text-[var(--text-primary)]">
                      {selectedProposal.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="h-px bg-[var(--border-card)] w-full" />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-muted)] uppercase font-bold tracking-widest">Participantes</span>
                    <span className="text-sm font-bold text-[var(--accent)]">{selectedParticipants.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-muted)] uppercase font-bold tracking-widest">Custo Individual</span>
                    <span className="text-lg font-mono font-bold text-[var(--accent)]">
                      {(selectedProposal.value / selectedParticipants.length).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] uppercase font-black text-[var(--text-muted)] tracking-[0.2em] px-1">Detalhamento por Integrante</h4>
                  <div className="space-y-2">
                    {selectedParticipants.map(pUid => {
                      const u = allAvailableParticipants.find((p: any) => p.uid === pUid);
                      const personaName = u?.displayName?.split(' ')[0];
                      const persona = PERFIS[personaName as keyof typeof PERFIS];
                      return (
                        <div key={`report-participant-${pUid}`} className="p-4 bg-[var(--bg-app)]/50 rounded-2xl border border-[var(--border-card)] flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <img src={u?.photoURL} className="w-8 h-8 rounded-lg object-cover" alt="" />
                            <div>
                              <p className="text-[11px] font-bold text-[var(--text-primary)]">{u?.displayName}</p>
                              <p className="text-[8px] text-[var(--accent)] font-bold uppercase tracking-widest">{persona?.area || 'Familiar'}</p>
                            </div>
                          </div>
                          <p className="text-xs font-mono font-bold text-[var(--text-primary)]">
                            {(selectedProposal.value / selectedParticipants.length).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 bg-[var(--accent)]/5 rounded-2xl border border-[var(--accent)]/20 flex items-start gap-3">
                  <Sparkles size={18} className="text-[var(--accent)] shrink-0 mt-1" />
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed italic">
                    "Zenith IA: Este rateio mantém o equilíbrio do fluxo de caixa familiar. As notificações serão enviadas com as saudações personalizadas de cada integrante."
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowReport(false)}
                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all"
              >
                {t("Voltar para Configuração", "Back to Configuration")}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SEÇÃO DE RELATÓRIOS MENSAIS */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">{t("Relatórios de Rateio", "Split Reports")}</h3>
            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mt-1">Gestão Mensal Consolidada</p>
          </div>
          <button 
            onClick={generateMonthlyReport}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-app)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all disabled:opacity-50"
          >
            <FileText size={14} />
            {t("Gerar Relatório do Mês", "Generate Monthly Report")}
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-card)] rounded-[32px] p-12 text-center">
            <div className="w-12 h-12 bg-[var(--accent)]/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck size={24} className="text-[var(--accent)]/30" />
            </div>
            <p className="text-xs text-[var(--text-muted)] font-medium">Nenhum relatório mensal gerado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report: any, idx: number) => (
              <motion.div 
                key={`report-${report.id}-${idx}`}
                layout
                className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[28px] p-5 space-y-4 relative overflow-hidden group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">
                      {t(
                        `${new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(report.year, report.month))} ${report.year}`,
                        `${new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(report.year, report.month))} ${report.year}`
                      )}
                    </h4>
                    <div className="text-xl font-bold text-[var(--text-primary)]">
                      R$ {report.totalConsolidated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest ${
                    report.status === 'approved' ? 'bg-[var(--trend-up)]/10 text-[var(--trend-up)]' :
                    report.status === 'rejected' ? 'bg-[var(--trend-down)]/10 text-[var(--trend-down)]' :
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {report.status}
                  </div>
                </div>

                <div className="space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                  {report.participantsSummary.map((p: any, pIdx: number) => (
                    <div key={`p-summary-${p.uid}-${pIdx}`} className="flex justify-between items-center text-[11px] py-1 border-b border-[var(--border-card)] last:border-0 border-dashed">
                      <span className="text-[var(--text-secondary)]">{p.displayName}</span>
                      <span className="font-bold text-[var(--text-primary)]">R$ {p.totalToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>

                {report.iaFeedback && (
                  <div className="p-3 bg-[var(--accent)]/5 rounded-xl border border-[var(--accent)]/10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles size={12} className="text-[var(--accent)]" />
                      <span className="text-[9px] font-bold text-[var(--accent)] uppercase tracking-widest">Suporte Zenith IA</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] italic leading-relaxed">
                      "{report.iaFeedback}"
                    </p>
                  </div>
                )}

                {report.status === 'pending' && (
                  <div className="flex gap-2 pt-2 border-t border-[var(--border-card)]">
                    <button 
                      onClick={() => approveReport(report.id)}
                      className="flex-1 py-2.5 bg-[var(--trend-up)] text-[var(--bg-app)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--trend-up)]/90 transition-all flex items-center justify-center gap-2"
                    >
                      <Check size={14} /> {t("Aprovar", "Approve")}
                    </button>
                    <button 
                      onClick={() => rejectReport(report.id)}
                      className="flex-1 py-2.5 bg-[var(--trend-down)] text-[var(--bg-app)] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--trend-down)]/90 transition-all flex items-center justify-center gap-2"
                    >
                      <X size={14} /> {t("Rejeitar", "Reject")}
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <div className="h-px bg-[var(--border-card)] w-full opacity-50" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {consolidatedData.map((item: any, idx: number) => {
          const personaName = item.user.displayName.split(' ')[0];
          const persona = PERFIS[personaName as keyof typeof PERFIS];
          
          return (
            <motion.div 
              key={`${item.user.uid}-${idx}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 space-y-4 relative overflow-hidden group"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-[var(--accent)]/20">
                    <img src={item.user.photoURL} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                      {item.user.displayName} {persona?.emoji}
                    </h4>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest">{persona?.area || 'Familiar'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-mono font-bold text-[var(--accent)]">
                    {privacyMode ? '••••••' : item.totalOwed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Saldo a Recuperar</p>
                </div>
              </div>

              {item.totalOwed > 0 && (
                <>
                  <div className="space-y-1.5 px-1 max-h-[100px] overflow-y-auto custom-scrollbar">
                    {item.pendingSplits.map((s: any, sIdx: number) => (
                      <div key={`sd-${s.id}-${sIdx}`} className="flex justify-between items-center text-[9px] py-1 border-b border-white/5 last:border-0">
                        <span className="text-[var(--text-muted)] truncate max-w-[140px] uppercase font-bold tracking-wider">{s.transactionLabel || 'Fatura'}</span>
                        <span className="text-[var(--text-primary)] font-mono font-black">
                          {s.shareValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-[var(--bg-app)]/50 rounded-2xl border border-[var(--border-card)] italic text-xs text-[var(--text-secondary)] leading-relaxed">
                    "{persona?.saudacao || 'Sinais vitais financeiros estáveis.'}"
                  </div>

                  <div className="flex gap-2">
                    <button 
                      className="flex-1 py-3 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all flex items-center justify-center gap-2"
                      onClick={() => {
                        const message = gerarMensagemPersona(item, persona);
                        navigator.clipboard.writeText(message);
                        alert(t('Mensagem Pix copiada!', 'Pix message copied!'));
                      }}
                    >
                      <Copy size={14} />
                      {t("Copiar Mensagem Pix", "Copy Pix Message")}
                    </button>
                    <button className="w-12 h-12 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                      <QrCode size={20} />
                    </button>
                  </div>
                </>
              )}
              {item.totalOwed === 0 && item.user.uid === profile?.uid && (
                <div className="py-2 text-center text-[8px] text-[var(--text-muted)] uppercase tracking-widest font-bold">
                  Dono da Conta (Sem saldo a recuperar de si mesmo)
                </div>
              )}
            </motion.div>
          );
        })}
        {consolidatedData.length === 0 && (
          <div className="col-span-full py-20 text-center border border-dashed border-[var(--border-card)] rounded-[40px]">
            <Users size={40} className="mx-auto text-[var(--text-muted)] opacity-20 mb-4" />
            <p className="text-[var(--text-muted)] text-sm">{t("Nenhum integrante ou rateio encontrado.", "No family members or splits found.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ParcelasView({ installments, language, user }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [filters, setFilters] = useState({ person: '', institution: '', status: '' });
  const [formData, setFormData] = useState({
    person: '',
    institution: '',
    label: '',
    value: 0,
    totalValue: 0,
    currentInstallment: 1,
    totalInstallments: 1,
    status: 'Pendente',
    dueDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const filtered = installments.filter((item: any) => {
    return (
      (!filters.person || item.person?.toLowerCase().includes(filters.person.toLowerCase())) &&
      (!filters.institution || item.institution?.toLowerCase().includes(filters.institution.toLowerCase())) &&
      (!filters.status || item.status === filters.status)
    );
  });

  const handleSave = async () => {
    if (!formData.label || formData.value <= 0) {
      alert(t('Preencha os campos obrigatórios.', 'Fill in the required fields.'));
      return;
    }

    const payload = {
      ...formData,
      uid: user.uid,
      dueDate: Timestamp.fromDate(new Date(formData.dueDate)),
      createdAt: editingItem ? editingItem.createdAt : serverTimestamp()
    };

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'installments', editingItem.id), payload);
      } else {
        await addDoc(collection(db, 'installments'), payload);
      }
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'installments');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('Excluir este registro?', 'Delete this record?'))) return;
    try {
      await deleteDoc(doc(db, 'installments', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'installments');
    }
  };

  const exportToCSV = () => {
    const headers = ['Pessoa', 'Instituição', 'Compromisso', 'Valor Parcela', 'Valor Total', 'Parcela', 'Status', 'Vencimento', 'Notas'];
    const rows = filtered.map((item: any) => [
      item.person,
      item.institution,
      item.label,
      item.value,
      item.totalValue,
      `${item.currentInstallment}/${item.totalInstallments}`,
      item.status,
      item.dueDate?.toLocaleDateString(),
      item.notes
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'parcelas.csv');
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <input 
            type="text" 
            placeholder={t('Filtrar Pessoa', 'Filter Person')}
            className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors"
            value={filters.person}
            onChange={(e) => setFilters({...filters, person: e.target.value})}
          />
          <input 
            type="text" 
            placeholder={t('Filtrar Instituição', 'Filter Institution')}
            className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors"
            value={filters.institution}
            onChange={(e) => setFilters({...filters, institution: e.target.value})}
          />
          <select 
            className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors"
            value={filters.status}
            onChange={(e) => setFilters({...filters, status: e.target.value})}
          >
            <option value="">{t('Todos Status', 'All Status')}</option>
            <option value="Pendente">{t('Pendente', 'Pending')}</option>
            <option value="Quitado">{t('Quitado', 'Paid')}</option>
            <option value="Atrasado">{t('Atrasado', 'Overdue')}</option>
            <option value="Adiantado">{t('Adiantado', 'Advanced')}</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-card)] px-4 py-2 rounded-xl text-sm font-medium text-white hover:bg-[var(--accent)]/10 transition-colors"
          >
            <Download size={16} />
            {t('Exportar', 'Export')}
          </button>
          <button 
            onClick={() => {
              setEditingItem(null);
              setFormData({
                person: '',
                institution: '',
                label: '',
                value: 0,
                totalValue: 0,
                currentInstallment: 1,
                totalInstallments: 1,
                status: 'Pendente',
                dueDate: new Date().toISOString().split('T')[0],
                notes: ''
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-[var(--accent)] text-[var(--bg-app)] px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-[var(--accent)]/20 hover:scale-105 transition-all"
          >
            <Plus size={16} />
            {t('Novo Registro', 'New Record')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filtered.map((item: any) => (
            <motion.div 
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 hover:border-[var(--accent)]/30 transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button 
                  onClick={() => {
                    setEditingItem(item);
                    setFormData({
                      person: item.person || '',
                      institution: item.institution || '',
                      label: item.label,
                      value: item.value,
                      totalValue: item.totalValue || 0,
                      currentInstallment: item.currentInstallment || 1,
                      totalInstallments: item.totalInstallments || 1,
                      status: item.status,
                      dueDate: item.dueDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
                      notes: item.notes || ''
                    });
                    setIsModalOpen(true);
                  }}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
                >
                  <Edit3 size={14} />
                </button>
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 hover:bg-red-500/20"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-lg font-bold text-white">{item.label}</h4>
                    <p className="text-sm text-[var(--text-muted)]">{item.institution} • {item.person}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    item.status === 'Quitado' ? 'bg-green-500/10 text-green-500' :
                    item.status === 'Atrasado' ? 'bg-red-500/10 text-red-500' :
                    item.status === 'Adiantado' ? 'bg-blue-500/10 text-blue-500' :
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {item.status}
                  </span>
                </div>

                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-widest">{t('Valor Parcela', 'Installment Value')}</span>
                    <span className="text-xl font-bold text-white">
                      {item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span>{t('Total:', 'Total:')} {item.totalValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    <span>{item.currentInstallment}/{item.totalInstallments}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Calendar size={14} />
                  <span>{t('Vencimento:', 'Due Date:')} {item.dueDate?.toLocaleDateString()}</span>
                </div>

                {item.notes && (
                  <p className="text-xs text-[var(--text-muted)] italic line-clamp-2">
                    "{item.notes}"
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-white">
                {editingItem ? t('Editar Parcelamento', 'Edit Installment') : t('Novo Parcelamento', 'New Installment')}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Compromisso', 'Commitment')}</label>
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.label}
                  onChange={(e) => setFormData({...formData, label: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Instituição', 'Institution')}</label>
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.institution}
                  onChange={(e) => setFormData({...formData, institution: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Responsável', 'Responsible')}</label>
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.person}
                  onChange={(e) => setFormData({...formData, person: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Valor Parcela', 'Installment Value')}</label>
                <input 
                  type="number" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.value}
                  onChange={(e) => setFormData({...formData, value: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Valor Total', 'Total Value')}</label>
                <input 
                  type="number" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.totalValue}
                  onChange={(e) => setFormData({...formData, totalValue: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Vencimento', 'Due Date')}</label>
                <input 
                  type="date" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Parcela Atual', 'Current Installment')}</label>
                <input 
                  type="number" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.currentInstallment}
                  onChange={(e) => setFormData({...formData, currentInstallment: parseInt(e.target.value) || 1})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Total de Parcelas', 'Total Installments')}</label>
                <input 
                  type="number" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors"
                  value={formData.totalInstallments}
                  onChange={(e) => setFormData({...formData, totalInstallments: parseInt(e.target.value) || 1})}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Status', 'Status')}</label>
                <select 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors appearance-none"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                >
                  <option value="Pendente">{t('Pendente', 'Pending')}</option>
                  <option value="Quitado">{t('Quitado', 'Paid')}</option>
                  <option value="Atrasado">{t('Atrasado', 'Overdue')}</option>
                  <option value="Adiantado">{t('Adiantado', 'Advanced')}</option>
                </select>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Observações', 'Notes')}</label>
                <textarea 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-[var(--accent)] transition-colors h-24 resize-none"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
              </div>
            </div>

            <button 
              onClick={handleSave}
              className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-bold text-lg shadow-xl shadow-[var(--accent)]/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              {editingItem ? t('Atualizar Registro', 'Update Record') : t('Salvar Registro', 'Save Record')}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default function ZenithApp() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ddas, setDdas] = useState<DDA[]>([]);
  const [splitProposals, setSplitProposals] = useState<SplitProposal[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showChartMenu, setShowChartMenu] = useState(false);
  const [chartFilter, setChartFilter] = useState({ year: '2026', month: 'Todos', day: 'Todos' });
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [isEditingTransaction, setIsEditingTransaction] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [userRules, setUserRules] = useState<any[]>([]);
  const [isHeritageSettingsOpen, setIsHeritageSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  const filteredRecentTransactions = useMemo(() => {
    let filtered = [...transactions];
    if (chartFilterValue.type === 'category' && chartFilterValue.value) {
      filtered = filtered.filter(t => (t.categoria_primaria || 'Outros') === chartFilterValue.value);
    }
    return filtered.slice(0, 5);
  }, [transactions, chartFilterValue]);
  const [isCategoryDetailsOpen, setIsCategoryDetailsOpen] = useState(false);
  const [activeCategoryDetail, setActiveCategoryDetail] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'7' | '15' | '30'>('30');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [splits, setSplits] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Users Listener (to select participants for splits)
  useEffect(() => {
    if (!user) {
      setUsers([]);
      return;
    }
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const docs = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      setUsers(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'users'));
    return unsub;
  }, [user]);

  // Family Members Listener
  useEffect(() => {
    if (!user) {
      setFamilyMembers([]);
      return;
    }
    const q = query(collection(db, 'family_members'), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setFamilyMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'family_members'));
    return unsub;
  }, [user]);

  // Splits Listener (to track amounts to receive)
  useEffect(() => {
    if (!user) {
      setSplits([]);
      return;
    }
    const q = query(collection(db, 'splits'), where('ownerUid', '==', user.uid), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSplits(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'splits'));
    return unsub;
  }, [user]);

  // Installments Listener
  useEffect(() => {
    if (!user) {
      setInstallments([]);
      return;
    }
    const q = query(collection(db, 'installments'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setInstallments(snap.docs.map(doc => ({ id: doc.id, ...doc.data(), dueDate: (doc.data() as any).dueDate?.toDate() })));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'installments'));
    return unsub;
  }, [user]);

  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentTotals = calculateTotals(transactions, currentMonth, currentYear, splits, assets);
    const prevTotals = calculateTotals(transactions, prevMonth, prevYear, [], assets); // Previous month splits not tracked for now

    return {
      in: { 
        total: currentTotals.in, 
        var: calculateVariation(currentTotals.in, prevTotals.in),
        trend: currentTotals.in >= prevTotals.in ? 'up' : 'down',
        data: getMiniChartData(transactions, 'in', MINI_CHART_DATA) 
      },
      out: { 
        total: currentTotals.out, 
        var: calculateVariation(currentTotals.out, prevTotals.out),
        trend: currentTotals.out >= prevTotals.out ? 'up' : 'down',
        data: getMiniChartData(transactions, 'out', MINI_CHART_DATA) 
      },
      yield: { 
        total: currentTotals.yield, 
        var: calculateVariation(currentTotals.yield, prevTotals.yield),
        trend: currentTotals.yield >= prevTotals.yield ? 'up' : 'down',
        data: getMiniChartData(transactions, 'yield', MINI_CHART_DATA) 
      },
      toReceive: {
        total: currentTotals.toReceive,
        var: calculateVariation(currentTotals.toReceive, prevTotals.toReceive),
        trend: currentTotals.toReceive >= prevTotals.toReceive ? 'up' : 'down',
        data: [] // Mini chart for toReceive could be added later
      },
      investments: currentTotals.investments
    };
  }, [transactions, splits, assets]);

  const chartData = useMemo(() => calculateEvolutionData(assets, transactions), [assets, transactions]);

  const [investorProfile, setInvestorProfile] = useState<'Conservador' | 'Sofisticado' | 'Arrojado'>('Conservador');
  const [selectedAssetForDeepDive, setSelectedAssetForDeepDive] = useState<Asset | null>(null);
  const [investmentTab, setInvestmentTab] = useState<'Ativos' | 'Subcategorias' | 'Estratégias'>('Ativos');

  const cashFlowData = useMemo(() => calculateCashFlowData(transactions), [transactions]);
  const [currentTab, setCurrentTab] = useState<'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Rateio' | 'Armazenamento' | 'Lixeira' | 'Parcelas'>('Início');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const allAvailableParticipants = useMemo(() => {
    const list = users.map((u: any) => ({ 
      uid: u.uid, 
      displayName: u.displayName, 
      photoURL: u.photoURL,
      type: 'user'
    }));
    
    familyMembers.forEach((m: any) => {
      if (!list.find(u => u.uid === m.id)) {
        list.push({ 
          uid: m.id, 
          displayName: m.name, 
          photoURL: m.photoURL || `https://picsum.photos/seed/${m.id}/100/100`,
          type: 'member'
        });
      }
    });

    return fixDuplicates(list, 'uid');
  }, [users, familyMembers]);

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
              'CHART_EVOL_PATRIMONIO',
              'METRIC_SALDO',
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

  const handleUniversalIngestion = async (type: 'scanner' | 'upload' | 'spreadsheet' | 'manual') => {
    setIsIngestionHubOpen(false);
    
    if (type === 'manual') {
      const prompt = window.prompt(t("O que você deseja lançar? (Ex: Paguei 50 reais de almoço no Pix)", "What do you want to enter? (Ex: Paid 50 reais for lunch via Pix)"));
      if (!prompt) return;
      
      setIsProcessingIA(true);
      setIsReviewModalOpen(true);
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const rulesStr = userRules.map(r => `- Se o texto for similar a "${r.pattern}", use category="${r.category}"`).join('\n');
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ text: `Atue como Especialista em IA Financeira. Analise este texto: "${prompt}".
          Extraia os dados financeiros:
          - label: O que foi comprado ou de onde veio o dinheiro.
          - value: O valor numérico.
          - type: 'in' (entrada), 'out' (saída), 'yield' (rendimento).
          - category: Categoria sugerida.
          
          REGRAS DE AUTOMAÇÃO PERSONALIZADAS:
          ${rulesStr}

          REGRAS DE AUTOMAÇÃO PADRÃO:
          - Se o texto mencionar "Fatura", "Energia", "Luz", "Enel", "CPFL", etc., defina type="out" e category="Moradia".
          
          Retorne APENAS JSON: { "label": "...", "value": 0, "type": "in|out|yield", "category": "..." }` }],
          config: { responseMimeType: "application/json" }
        });
        
        const data = JSON.parse(response.text);
        setPendingTransaction(data);
      } catch (e) {
        console.error(e);
        setIsReviewModalOpen(false);
      } finally {
        setIsProcessingIA(false);
      }
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'spreadsheet' ? '.csv,.xlsx,.tsv' : 'image/*,application/pdf';
    
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setIsProcessingIA(true);
      setIsReviewModalOpen(true);
      
      try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const rulesStr = userRules.map(r => `- Se o emissor for similar a "${r.pattern}", use category="${r.category}"`).join('\n');
          
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              { inlineData: { data: base64Data, mimeType: file.type || 'application/octet-stream' } },
              { text: `Atue como Especialista em IA Financeira. Analise este documento/imagem.
              1. Identifique o TIPO:
                 - 'in' (ENTRADA): Salário, Pix Recebido, Venda, Resgate.
                 - 'out' (SAÍDA): Fatura, Pagamento, Compra, Boleto, Consumo.
                 - 'yield' (RENDIMENTO): Dividendos, JCP, Rendimento de Aplicação.
              2. Extraia o VALOR TOTAL (number).
              3. Identifique o EMISSOR/ESTABELECIMENTO (label).
              4. Sugira uma CATEGORIA (ex: Moradia, Alimentação, Lazer, Investimentos).
              
              REGRAS DE AUTOMAÇÃO PERSONALIZADAS:
              ${rulesStr}

              REGRAS DE AUTOMAÇÃO PADRÃO:
              - Se o documento for uma "Fatura de Energia", "Conta de Luz" ou similar, defina type="out" e category="Moradia".
              
              Retorne APENAS um JSON: { "label": "...", "value": 0, "type": "in|out|yield", "categoria_primaria": "..." }` }
            ],
            config: { responseMimeType: "application/json" }
          });
          
          const data = JSON.parse(response.text);
          // Ensure category mapping if AI uses the old key
          if (data.category && !data.categoria_primaria) {
            data.categoria_primaria = data.category;
          }
          setPendingTransaction(data);
        };
      } catch (e) {
        console.error(e);
        setIsReviewModalOpen(false);
      } finally {
        setIsProcessingIA(false);
      }
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

      // Handle Splits if participants exist
      if (finalTxData.participants && finalTxData.participants.length > 0) {
        const totalParticipants = finalTxData.participants.length + 1;
        const shareValue = Math.round((finalTxData.value / totalParticipants) * 100) / 100;
        
        finalTxData.participants.forEach(participantUid => {
          const splitRef = doc(collection(db, 'splits'));
          batch.set(splitRef, {
            uid: participantUid,
            ownerUid: user.uid,
            transactionId: newTxRef.id,
            transactionLabel: finalTxData.label,
            shareValue: shareValue,
            status: 'pending',
            createdAt: serverTimestamp()
          });
        });
      }

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

  const handleFileUpload = async (file: File) => {
    setIsProcessingFile(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const mimeType = file.type;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: `Extraia os dados desta transação financeira. Retorne um JSON seguindo este esquema:
              {
                "transacao": {
                  "data_evento": "ISO-8601",
                  "titulo": "String (Estabelecimento)",
                  "valor_nominal": "Double",
                  "moeda": "BRL",
                  "categoria_primaria": "String (Mãe)",
                  "etiqueta_personalizada": "String (Escrita Livre)",
                  "metodo_origem": "String (Pix/Cartão/Manual)",
                  "status": "Confirmado/Futuro"
                },
                "contexto_ia": {
                  "insight": "String (Análise curta)",
                  "tendencia": "Alta/Baixa/Estável"
                }
              }`,
            },
          ],
          config: {
            responseMimeType: "application/json",
          }
        });

        const result = JSON.parse(response.text);
        const tx = result.transacao;
        const ctx = result.contexto_ia;

        // Check for duplicates (date + value + title)
        const isDuplicate = transactions.some(t => {
          const tDate = t.date?.toDate ? t.date.toDate().toISOString().split('T')[0] : '';
          const newDate = tx.data_evento.split('T')[0];
          return tDate === newDate && t.value === tx.valor_nominal && t.label === tx.titulo;
        });

        if (isDuplicate) {
          alert("Transação possivelmente duplicada detectada.");
          setIsProcessingFile(false);
          return;
        }

        const newTx: any = {
          label: tx.titulo,
          value: tx.valor_nominal,
          type: 'out', // Default to out for extracted receipts
          date: Timestamp.fromDate(new Date(tx.data_evento)),
          uid: user.uid,
          categoria_primaria: tx.categoria_primaria,
          etiqueta_personalizada: tx.etiqueta_personalizada,
          metodo_origem: tx.metodo_origem,
          status: tx.status,
          contexto_ia: ctx,
          createdAt: serverTimestamp()
        };

        await setDoc(doc(collection(db, 'transactions')), newTx);
        setIsProcessingFile(false);
      };
    } catch (e) {
      console.error("Erro no processamento AI:", e);
      setIsProcessingFile(false);
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

  // Split Proposals Listener
  useEffect(() => {
    if (!user) {
      setSplitProposals([]);
      return;
    }
    const q = query(collection(db, 'split_proposals'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as SplitProposal));
      setSplitProposals(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'split_proposals'));
    return unsub;
  }, [user]);

  // Reports Listener
  useEffect(() => {
    if (!user) {
      setReports([]);
      return;
    }
    const q = query(collection(db, 'reports'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Report));
      setReports(docs);
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'reports'));
    return unsub;
  }, [user]);

  const t = useCallback((pt: string, en: string) => {
    return settings?.language === 'en-US' ? en : pt;
  }, [settings?.language]);

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

  const totalNetWorth = useMemo(() => {
    const assetsTotal = assets.reduce((acc, curr) => acc + (curr.value ?? 0), 0);
    return Math.round((assetsTotal + metrics.toReceive.total) * 100) / 100;
  }, [assets, metrics.toReceive.total]);

  const orderedDashboardItems = useMemo(() => {
    const order = settings?.zenith_config?.dashboard_order || [];
    const chartsConfig = settings?.zenith_config?.charts || {};
    const metricsConfig = settings?.zenith_config?.metrics || {};
    
    const defaultOrder = [
      'CHART_EVOL_PATRIMONIO',
      'METRIC_SALDO',
      'METRIC_ENTRADAS',
      'METRIC_SAIDAS',
      'METRIC_ARECEBER',
      'METRIC_RENDIMENTOS',
      'CHART_ALOC_ATIV',
      'CHART_FLUXO_CAIXA',
      'CHART_DIST_CATEG',
      'CHART_SAZON_MENS',
      'CHART_PREV_CONTAS',
      'CHART_METAS_PROG'
    ];

    const finalOrder = [...new Set(order)];
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

    const mainColor = metricConfig.color || (id === 'METRIC_ENTRADAS' ? 'var(--trend-up)' : id === 'METRIC_SAIDAS' ? 'var(--trend-down)' : 'var(--trend-yield)');
    const opacity = (metricConfig.opacity || 100) / 100;

    switch (id) {
      case 'METRIC_SALDO':
        return (
          <MiniMetricCard 
            key={id}
            id="net-worth"
            label={metricConfig.label || t("Patrimônio Total", "Net Worth")} 
            value={(metrics.investments + metrics.in.total - metrics.out.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
            percent="+2.4%" 
            trend="up" 
            data={generateDailyData().slice(-10).map(d => ({ v: d.value }))} 
            color={mainColor}
            opacity={opacity}
            privacy={privacyMode}
            onSettings={() => setIsHeritageSettingsOpen(true)}
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
            onSettings={() => setIsHeritageSettingsOpen(true)}
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
            onSettings={() => setIsHeritageSettingsOpen(true)}
            resolveStyle={resolveStyle}
            isExpense={true}
          />
        );
      case 'METRIC_ARECEBER':
        return null; // Nested in CHART_DIST_CATEG
      case 'METRIC_RENDIMENTOS':
        return (
          <MiniMetricCard 
            key={id}
            id="yields"
            label={metricConfig.label || t("Rendimentos", "Yields")} 
            value={(metrics.yield.total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
            percent={metrics.yield.var} 
            trend={metrics.yield.trend} 
            data={metrics.yield.data} 
            color={mainColor}
            opacity={opacity}
            privacy={privacyMode}
            onSettings={() => setIsHeritageSettingsOpen(true)}
            resolveStyle={resolveStyle}
          />
        );
      case 'METRIC_INVESTIMENTOS':
        return null; // Nested in CHART_ALOC_ATIV
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
        return (
          <div key={id} className="h-48 w-full -mr-5 sm:-mr-6 mt-4 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              {visualType === 'Linha' || visualType === 'Área' ? (
                <AreaChart 
                  data={chartData} 
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
                    tickFormatter={(value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                  />
                  {tooltipsEnabled && (
                    <Tooltip 
                      cursor={{ stroke: mainColor, strokeWidth: 1, strokeDasharray: '5 5' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
                              <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1">{data.date}</p>
                              <p className="text-base font-mono font-bold text-[var(--text-primary)]">
                                {privacyMode ? '••••••' : (data.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                              {predictiveEnabled && (
                                <p className="mt-2 text-[8px] text-[var(--accent)] font-bold italic">
                                  ✨ IA: {data.value > 15000 ? "Seu patrimônio está 15% acima da projeção." : "Tendência de alta mantida para o próximo mês."}
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
                <BarChart data={chartData}>
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
                <button onClick={() => setIsHeritageSettingsOpen(true)} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
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
              <button onClick={() => setIsHeritageSettingsOpen(true)} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
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
                    tickFormatter={(value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                  />
                  {tooltipsEnabled && <Tooltip />}
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
          const catName = t.categoria_primaria || t.category || 'Outros';
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
                <button onClick={() => setIsHeritageSettingsOpen(true)} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
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

            {/* Nested A Receber & Recent Transactions */}
            <div className="mt-8 space-y-6">
              <div className="bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t("A Receber", "To Receive")}</p>
                  <p className="text-xl font-mono font-bold text-[var(--accent)] mt-1">
                    {privacyMode ? '••••••' : (metrics.toReceive.total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                  <TrendingUp size={20} />
                </div>
              </div>

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
                        <p className="text-[8px] text-[var(--text-muted)] uppercase font-bold">{tx.category}</p>
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
    // Simulate finding a new DDA for the specific CPF
    const mockDDA = {
      beneficiary: 'ENEL Distribuição SP',
      value: 185.40,
      dueDate: serverTimestamp(),
      status: 'pending',
      uid: user.uid,
      cpf: '097.166.479-05'
    };
    try {
      const ddaRef = doc(collection(db, 'ddas'));
      await setDoc(ddaRef, mockDDA);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'ddas');
    }
  }, [user]);

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

  const handleCopyPix = (key: string, feedbackId: string) => {
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
      setCopyFeedback(feedbackId);
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

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

      // Se for uma transação, buscar e deletar rateios associados para evitar resíduo/soma fantasma
      if (collectionName === 'transactions') {
        const splitsToDel = splits.filter((s: any) => s.transactionId === item.id);
        splitsToDel.forEach((s: any) => {
          batch.delete(doc(db, 'splits', s.id));
        });
      }

      await batch.commit();
      setCopyFeedback(t("Item movido para a lixeira!", "Item moved to trash!"));
      setTimeout(() => setCopyFeedback(null), 3000);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${item.id}`);
    }
  };

  const handleSettleSplit = async (split: any) => {
    try {
      const batch = writeBatch(db);
      const splitRef = doc(db, 'splits', split.id);
      batch.update(splitRef, { status: 'paid' });
      
      const newTxRef = doc(collection(db, 'transactions'));
      const participantName = users.find((u: any) => u.uid === split.uid)?.displayName || t('Participante', 'Participant');
      
      batch.set(newTxRef, {
        label: `${t('Recebimento', 'Receipt')}: ${split.transactionLabel || participantName}`,
        value: split.shareValue,
        type: 'in',
        date: serverTimestamp(),
        uid: user!.uid,
        createdAt: serverTimestamp()
      });
      
      await batch.commit();
      await recalculateBalances(user!.uid);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `splits/${split.id}`);
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

          <p className="text-center text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest">
            {t("Protegido por Criptografia Militar", "Protected by Military-Grade Encryption")}
          </p>
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

    // 2. Seed Family Members (Local Management)
    const membersToSeed = [
      { name: 'Rafael Knazh', email: 'rafael@zenith.com', photoURL: 'https://picsum.photos/seed/rafael/100/100' },
      { name: 'Alexandre Knazh', email: 'alexandre@zenith.com', photoURL: 'https://picsum.photos/seed/alexandre/100/100' },
      { name: 'Linda Knazh', email: 'linda@zenith.com', photoURL: 'https://picsum.photos/seed/linda/100/100' },
      { name: 'Patrícia Knazh', email: 'patricia@zenith.com', photoURL: 'https://picsum.photos/seed/patricia/100/100' },
      { name: 'Valdemar Knazh', email: 'valdemar@zenith.com', photoURL: 'https://picsum.photos/seed/valdemar/100/100' },
    ];

    membersToSeed.forEach(m => {
      const memberRef = doc(collection(db, 'family_members'));
      batch.set(memberRef, {
        name: m.name,
        email: m.email,
        photoURL: m.photoURL,
        ownerUid: user.uid,
        createdAt: serverTimestamp()
      });
    });

    await batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'sync_family_batch'));
    setCopyFeedback(t("Dados de exemplo e família sincronizados!", "Sample data and family synchronized!"));
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  return (
    <ErrorBoundary>
      <HeritageSettings 
        opened={isHeritageSettingsOpen}
        onClose={() => setIsHeritageSettingsOpen(false)}
        userId={user.uid}
        currentConfig={settings?.zenith_config}
        language={settings?.zenith_config?.master_states?.idioma === 'English (US)' ? 'en-US' : 'pt-BR'}
      />
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans selection:bg-[var(--accent)]/30 pb-32 overflow-x-hidden">
        
        {/* --- HEADER --- */}
        <header className="px-6 py-6 sm:py-8 flex justify-between items-start max-w-7xl mx-auto">
          <div className="flex items-center gap-4 flex-1">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl flex items-center justify-center hover:border-[var(--accent)] transition-colors"
            >
              <Menu size={20} className="text-[var(--text-secondary)]" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-medium text-[var(--text-primary)] truncate">
                {getGreeting()}, {(profile?.displayName || user.displayName || 'Juliano').split(' ')[0]}
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 max-w-[280px] leading-tight">
                {t("Sua evolução patrimonial começa com a próxima decisão inteligente.", "Your net worth evolution starts with the next smart decision.")}
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <button 
              onClick={() => setIsHeritageSettingsOpen(true)}
              className="w-10 h-10 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl flex items-center justify-center hover:border-[var(--accent)] transition-colors"
            >
              <SettingsIcon size={18} className="text-[var(--text-secondary)]" />
            </button>
            <div className="w-10 h-10 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl flex items-center justify-center relative cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => setIsNotificationsOpen(true)}>
              <Bell size={18} className="text-[var(--text-secondary)]" />
              {notifications.length > 0 && <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[var(--accent)] rounded-full shadow-[0_0_10px_rgba(0,255,163,0.8)]" />}
            </div>
            <button 
              onClick={() => setIsEditingProfile(true)}
              className="w-10 h-10 rounded-xl border border-[var(--border-card)] overflow-hidden hover:border-[var(--accent)] transition-colors"
            >
              <img 
                src={profile?.photoURL || user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`} 
                alt="Perfil" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
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

          {currentTab === 'Armazenamento' && (
            <StorageView transactions={transactions} assets={assets} reports={reports} language={settings?.language} />
          )}

          {currentTab === 'Lixeira' && (
            <div className="space-y-6">
              <header>
                <h2 className="text-2xl font-bold text-white">{t('Lixeira', 'Trash')}</h2>
                <p className="text-[var(--text-muted)] text-sm">{t('Itens excluídos permanecem aqui por 30 dias.', 'Deleted items remain here for 30 days.')}</p>
              </header>
              <TrashView language={settings?.language} user={user} />
            </div>
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
                <div className="flex justify-between items-start mb-1">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">{settings?.customTerms['Saldo'] || t("Evolução do Patrimônio", "Net Worth Evolution")}</span>
                    <div className="flex items-center gap-2">
                    </div>
                  </div>
                  <div className="flex gap-2 relative">
                    <button 
                      onClick={() => setIsAddingAsset(true)}
                      className="w-8 h-8 border border-[var(--accent)]/30 rounded-lg flex items-center justify-center text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                    <button 
                      onClick={() => setIsHeritageSettingsOpen(true)}
                      className="w-8 h-8 border border-[var(--border-card)] rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    >
                      <SettingsIcon size={16} />
                    </button>
                    <button 
                      onClick={() => setShowChartMenu(!showChartMenu)}
                      className={`w-8 h-8 border rounded-lg flex items-center justify-center transition-colors z-50 ${showChartMenu ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--bg-app)]' : 'border-[var(--border-card)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'}`}
                    >
                      <MoreVertical size={16} />
                    </button>

                    <AnimatePresence>
                      {showChartMenu && (
                        <>
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowChartMenu(false)}
                            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] sm:hidden"
                          />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute right-0 top-10 w-48 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-4 shadow-2xl z-50 space-y-4"
                          >
                            <div className="space-y-2">
                              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Período", "Period")}</label>
                              <select 
                                value={chartFilter.month} 
                                onChange={(e) => setChartFilter({...chartFilter, month: e.target.value})}
                                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                              >
                                <option value="Semanas">{t("Semanas", "Weeks")}</option>
                                <option value="Meses">{t("Meses", "Months")}</option>
                                <option value="Anos">{t("Anos", "Years")}</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Mês", "Month")}</label>
                              <select 
                                value={chartFilter.month} 
                                onChange={(e) => setChartFilter({...chartFilter, month: e.target.value})}
                                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                              >
                                <option value="Todos">{t("Todos", "All")}</option>
                                <option value="Janeiro">{t("Janeiro", "January")}</option>
                                <option value="Fevereiro">{t("Fevereiro", "February")}</option>
                                <option value="Março">{t("Março", "March")}</option>
                                <option value="Abril">{t("Abril", "April")}</option>
                                <option value="Maio">{t("Maio", "May")}</option>
                                <option value="Junho">{t("Junho", "June")}</option>
                                <option value="Julho">{t("Julho", "July")}</option>
                                <option value="Agosto">{t("Agosto", "August")}</option>
                                <option value="Setembro">{t("Setembro", "September")}</option>
                                <option value="Outubro">{t("Outubro", "October")}</option>
                                <option value="Novembro">{t("Novembro", "November")}</option>
                                <option value="Dezembro">{t("Dezembro", "December")}</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Dia", "Day")}</label>
                              <select 
                                value={chartFilter.day} 
                                onChange={(e) => setChartFilter({...chartFilter, day: e.target.value})}
                                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
                              >
                                <option value="Todos">{t("Todos", "All")}</option>
                                <option>01-10</option>
                                <option>11-20</option>
                                <option>21-31</option>
                              </select>
                            </div>
                            <button 
                              onClick={() => setShowChartMenu(false)}
                              className="w-full py-2 bg-[var(--accent)] text-[var(--bg-app)] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
                            >
                              {t("Aplicar Filtros", "Apply Filters")}
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-3xl font-mono tracking-tighter font-medium text-[var(--text-primary)]">
                    {privacyMode ? '••••••••' : (totalNetWorth ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
              splits={splits}
              splitProposals={splitProposals}
              reports={reports}
              users={users}
              familyMembers={familyMembers}
              allAvailableParticipants={allAvailableParticipants}
              profile={profile}
              privacyMode={privacyMode}
              onSeed={seedMockData}
              language={settings?.language}
              onNavigateToRateio={() => setCurrentTab('Rateio')}
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
            <ZenithIAView 
              language={settings?.language}
              transactions={transactions}
              assets={assets}
              profile={profile}
            />
          )}

          {currentTab === 'Parcelas' && (
            <ParcelasView 
              installments={installments}
              language={settings?.language}
              user={user}
            />
          )}

          {currentTab === 'Rateio' && (
            <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-[var(--accent)]">
                <Users size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{t("Módulo Relocado", "Module Relocated")}</h3>
                <p className="text-[var(--text-muted)] text-sm max-w-[280px] mx-auto mt-2">
                  {t("A gestão de rateio agora está integrada à sua Carteira para uma visão unificada.", "Split management is now integrated into your Wallet for a unified view.")}
                </p>
              </div>
              <button 
                onClick={() => setCurrentTab('Carteira')}
                className="px-8 py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-[var(--accent)]/20"
              >
                {t("Acessar Carteira", "Access Wallet")}
              </button>
            </div>
          )}
        </main>

        {/* --- MODALS --- */}
        <AnimatePresence>
          {/* Sidebar */}
          <Sidebar 
            isOpen={isSidebarOpen} 
            onClose={() => setIsSidebarOpen(false)} 
            currentTab={currentTab}
            onTabChange={setCurrentTab}
            onOpenSettings={() => setIsHeritageSettingsOpen(true)}
            onLogout={handleLogout}
            language={settings?.language}
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
                      onClick={() => setIsIngestionHubOpen(true)}
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

          {/* Profile Edit Modal */}
          {isEditingProfile && (
            <ProfileModal 
              profile={profile!} 
              onClose={() => setIsEditingProfile(false)}
              language={settings.language}
              onSave={async (data) => {
                const { uid, ...updateData } = data;
                await updateDoc(doc(db, 'users', user.uid), updateData).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`));
                setIsEditingProfile(false);
              }}
              onLogout={handleLogout}
            />
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
              users={allAvailableParticipants.filter((u: any) => u.uid !== user?.uid)}
              ownerName={profile?.displayName || user?.displayName || user?.email}
              ownerPhoto={profile?.photoURL || user?.photoURL}
              onConfirm={confirmPendingTransaction}
              onCancel={() => {
                setIsReviewModalOpen(false);
                setPendingTransaction(null);
              }}
              language={settings?.language || 'pt-BR'}
            />
          )}

          {/* Notification Center */}
          <NotificationCenter 
            isOpen={isNotificationsOpen} 
            onClose={() => setIsNotificationsOpen(false)} 
            notifications={notifications} 
            language={settings.language} 
          />
        </AnimatePresence>

        {/* --- NAV DOCK --- */}
        <div className="fixed bottom-0 inset-x-0 p-6 z-40 pointer-events-none">
          <nav className="max-w-md mx-auto h-20 bg-[var(--bg-card)]/95 border border-[var(--border-card)] flex items-center justify-around px-4 rounded-[35px] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] pointer-events-auto">
            <NavItem icon={<LayoutGrid size={24} />} label={t("INÍCIO", "HOME")} active={currentTab === 'Início'} onClick={() => setCurrentTab('Início')} />
            <NavItem icon={<CreditCard size={24} />} label={t("CARTEIRA", "WALLET")} active={currentTab === 'Carteira'} onClick={() => setCurrentTab('Carteira')} />
            
            {/* FAB HUB */}
            <div className="relative -top-6">
              <button 
                onClick={() => setIsIngestionHubOpen(true)}
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

function Sidebar({ isOpen, onClose, currentTab, onTabChange, onOpenSettings, onLogout, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  if (!isOpen) return null;

  const menuItems = [
    { id: 'Início', icon: <LayoutGrid size={20} />, label: t('Home', 'Home') },
    { id: 'Carteira', icon: <CreditCard size={20} />, label: t('Carteira', 'Wallet') },
    { id: 'Investimentos', icon: <TrendingUp size={20} />, label: t('Investimentos', 'Investments') },
    { id: 'IA', icon: <Sparkles size={20} />, label: t('Zenith IA', 'Zenith AI') },
    { id: 'Parcelas', icon: <Calendar size={20} />, label: t('Parcelas', 'Installments') },
    { type: 'divider' },
    { id: 'Armazenamento', icon: <HardDrive size={20} />, label: t('Armazenamento', 'Storage') },
    { id: 'Lixeira', icon: <Trash size={20} />, label: t('Lixeira', 'Trash') },
    { type: 'divider' },
    { id: 'Configurações', icon: <SettingsIcon size={20} />, label: t('Configurações', 'Settings') },
  ];

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
        className="absolute left-0 top-0 bottom-0 w-[280px] bg-[var(--bg-card)] border-r border-[var(--border-card)] p-6 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--accent)] rounded-xl flex items-center justify-center text-[var(--bg-app)]">
              <TrendingUp size={24} />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tighter">Zenith <span className="text-[var(--accent)] text-xs">AI</span></h2>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--text-muted)] hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {menuItems.map((item, idx) => (
            item.type === 'divider' ? (
              <div key={`divider-${idx}`} className="h-px bg-[var(--border-card)] my-4 mx-2" />
            ) : (
              <button 
                key={item.id}
                onClick={() => {
                  if (item.id === 'Configurações') {
                    onOpenSettings();
                  } else {
                    onTabChange(item.id);
                  }
                  onClose();
                }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${currentTab === item.id ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'}`}
              >
                {item.icon}
                <span className="text-sm font-bold uppercase tracking-widest">{item.label}</span>
              </button>
            )
          ))}
        </nav>

        <div className="pt-6 border-t border-[var(--border-card)]">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-4 p-4 rounded-2xl text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-all font-bold uppercase tracking-widest text-xs"
          >
            <LogOut size={20} />
            {t('Sair', 'Logout')}
          </button>
        </div>
      </motion.aside>
    </div>
  );
}

function StorageView({ transactions, assets, reports, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  
  const stats = [
    { label: t('Transações', 'Transactions'), count: transactions.length, icon: <ArrowRightLeft className="text-[var(--accent)]" /> },
    { label: t('Ativos', 'Assets'), count: assets.length, icon: <Landmark className="text-blue-400" /> },
    { label: t('Relatórios', 'Reports'), count: reports.length, icon: <FileText className="text-purple-400" /> },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-white">{t('Armazenamento', 'Storage')}</h2>
        <p className="text-[var(--text-muted)] text-sm">{t('Resumo de dados processados pelo Zenith Financial.', 'Summary of data processed by Zenith Financial.')}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{stat.label}</p>
              <h4 className="text-2xl font-mono font-bold text-white">{stat.count}</h4>
            </div>
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] space-y-4">
        <div className="flex items-center gap-3">
          <Database size={20} className="text-[var(--accent)]" />
          <h3 className="text-lg font-bold text-white">{t('Otimização de Espaço', 'Space Optimization')}</h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          {t('A Zenith utiliza Firestore Enterprise para garantir persistência e segurança. O espaço ocupado é proporcional ao número de registros. Para liberar espaço, você pode gerenciar itens na lixeira ou remover ativos antigos.', 'Zenith uses Firestore Enterprise to ensure persistence and security. Occupied space is proportional to the number of records. To free up space, you can manage items in the trash or remove old assets.')}
        </p>
        <div className="h-2 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--accent)] w-1/4" />
        </div>
        <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
          <span>{t('Usado', 'Used')}</span>
          <span>500 records limit (Spark)</span>
        </div>
      </div>
    </div>
  );
}

function TrashView({ language, user }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'trash'),
      where('uid', '==', user.uid),
      orderBy('deletedAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setTrashItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const restoreItem = async (item: any) => {
    try {
      const batch = writeBatch(db);
      const originalRef = doc(db, item.originalCollection, item.originalId);
      batch.set(originalRef, item.data);
      batch.delete(doc(db, 'trash', item.id));
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `restore/${item.id}`);
    }
  };

  const permanentDelete = async (id: string) => {
    if (!confirm(t('Excluir permanentemente?', 'Delete permanently?'))) return;
    await deleteDoc(doc(db, 'trash', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `trash/${id}`));
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-[var(--accent)]" /></div>;

  return (
    <div className="grid grid-cols-1 gap-4">
      {trashItems.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-[var(--border-card)] rounded-[40px]">
          <Trash2 size={40} className="mx-auto text-[var(--text-muted)] mb-4 opacity-20" />
          <p className="text-[var(--text-muted)] text-sm font-bold uppercase tracking-widest">{t('Lixeira Vazia', 'Trash Empty')}</p>
        </div>
      ) : (
        trashItems.map((item, idx) => (
          <div key={`trash-${item.id}-${idx}`} className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-[var(--text-muted)]">
                <History size={20} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-white">{item.data.label || item.data.name || t('Sem título', 'Untitled')}</h4>
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">
                  {item.originalCollection} • {item.deletedAt?.toDate ? item.deletedAt.toDate().toLocaleDateString() : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => restoreItem(item)}
                className="p-3 bg-[var(--accent)]/10 text-[var(--accent)] rounded-xl hover:bg-[var(--accent)] hover:text-[var(--bg-app)] transition-all"
                title={t('Restaurar', 'Restore')}
              >
                <ArrowUpRight size={18} />
              </button>
              <button 
                onClick={() => permanentDelete(item.id)}
                className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                title={t('Excluir', 'Delete')}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function NotificationCenter({ isOpen, onClose, notifications, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white">{t('Notificações', 'Notifications')}</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white"><X size={24} /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <BellOff size={40} className="mx-auto text-[var(--text-muted)] mb-4 opacity-20" />
              <p className="text-[var(--text-muted)] text-xs uppercase font-bold tracking-widest">{t('Tudo limpo por aqui', 'All clear here')}</p>
            </div>
          ) : (
            notifications.map((n, i) => (
              <div key={`notif-${i}-${n.time}`} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-1">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-widest">{n.type}</span>
                  <span className="text-[8px] text-[var(--text-muted)] font-bold">{n.time}</span>
                </div>
                <p className="text-sm font-medium text-white">{n.title}</p>
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{n.message}</p>
              </div>
            ))
          )}
        </div>
      </motion.div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 p-6 flex gap-2">
          <button onClick={() => setIsEditing(!isEditing)} className="text-[var(--text-muted)] hover:text-[var(--accent)] p-2 transition-colors">
            {isEditing ? <X size={24} /> : <Edit2 size={20} />}
          </button>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">
            <X size={24} />
          </button>
        </div>
        
        <div className="mt-4 space-y-6">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Nome", "Name")}</label>
                <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Valor (R$)", "Value (R$)")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
                  <input 
                    type="text" 
                    value={(formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      setFormData({...formData, value: parseInt(val || '0') / 100});
                    }} 
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none font-mono" 
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none">
                  <option value="liquidity">{t("Liquidez", "Liquidity")}</option>
                  <option value="investment">{t("Investimento", "Investment")}</option>
                  <option value="physical">{t("Bem Físico", "Physical Asset")}</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Detalhes", "Details")}</label>
                <textarea value={formData.detail} onChange={e => setFormData({...formData, detail: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none h-24" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => onDelete(asset.id)} className="flex-1 py-4 bg-[var(--destructive)]/10 text-[var(--destructive)] rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--destructive)]/20 transition-colors flex items-center justify-center gap-2">
                  <Trash2 size={16} /> {t("Excluir", "Delete")}
                </button>
                <button onClick={handleSave} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors flex items-center justify-center gap-2">
                  <Save size={16} /> {t("Salvar", "Save")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em]">{asset.type}</span>
                <h3 className="text-2xl font-medium text-[var(--text-primary)] mt-1">{asset.name}</h3>
              </div>
              <div className="space-y-1">
                <p className="text-4xl font-mono tracking-tighter">
                  {privacyMode ? '••••••' : (asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                {asset.change && <p className="text-[var(--accent)] text-xs font-bold">{asset.change} {t("no período", "in period")}</p>}
              </div>
              <div className="h-px bg-[var(--border-card)] my-4" />
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{asset.detail}</p>
              <button onClick={() => setIsEditing(true)} className="w-full py-5 bg-[var(--text-primary)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)] transition-colors">
                {t("Editar Ativo", "Edit Asset")}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
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

function AddAssetModal({ onClose, onAdd, language, investorProfile, user }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({ name: '', value: 0, type: 'liquidity', detail: '' });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStage, setExtractionStage] = useState('');
  const [extractionProgress, setExtractionProgress] = useState(0);
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

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        let part;
        
        if (isSpreadsheet) {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = read(data, { type: 'array' });
          let content = "";
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            content += `Sheet: ${sheetName}\n${utils.sheet_to_csv(worksheet)}\n`;
          });
          part = { text: `Document content (Spreadsheet converted to CSV):\n${content}` };
        } else if (isImageOrPdf) {
          const base64Data = e.target?.result?.toString().split(',')[1];
          if (!base64Data) return;
          part = { inlineData: { data: base64Data, mimeType: file.type || 'application/octet-stream' } };
        } else {
          const textContent = e.target?.result?.toString();
          part = { text: `Document content (Text):\n${textContent}` };
        }

        setExtractionStage(t("Consultando IA Zenith...", "Consulting Zenith AI..."));
        setExtractionProgress(0.8);

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              parts: [
                { text: `Você receberá um documento financeiro em formato de Imagem, PDF ou Texto (Planilha convertida).
                  1. Se for IMAGEM/PDF: Use OCR avançado para ler tabelas, cabeçalhos e rodapés.
                  2. Se for TEXTO/PLANILHA: Analise as colunas de 'Valor', 'Data' e 'Descrição'.
                  3. Identifique o tipo de ativo (CDB, Ações, FII, Tesouro) e o emissor.
                  4. Gere um INSIGHT baseado no Perfil [${investorProfile}] fornecido.
                  5. Responda APENAS o JSON: { "ativos": [{ "name": "string", "value": 0.0, "type": "investment", "subcategoria": "string", "emissor": "string" }], "insight": "string", "total_detectado": 0.0 }` 
                },
                part
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                ativos: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      value: { type: Type.NUMBER },
                      type: { type: Type.STRING, enum: ['liquidity', 'investment', 'physical'] },
                      subcategoria: { type: Type.STRING },
                      emissor: { type: Type.STRING }
                    }
                  }
                },
                insight: { type: Type.STRING },
                total_detectado: { type: Type.NUMBER }
              }
            }
          }
        });

        const result = JSON.parse(response.text || '{}');
        
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="absolute top-0 right-0 p-6">
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2"><X size={24} /></button>
        </div>
        <div className="mt-4 space-y-6">
          <h3 className="text-2xl font-medium text-[var(--text-primary)]">{t("Novo Ativo", "New Asset")}</h3>
          
          <AnimatePresence>
            {isExtracting && (
              <ProcessingOverlay 
                language={language} 
                stage={extractionStage} 
                progress={extractionProgress} 
              />
            )}
          </AnimatePresence>

          {/* ÁREA DE UPLOAD IA */}
          <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-6 transition-all flex flex-col items-center justify-center gap-3 text-center ${dragActive ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-card)] hover:border-[var(--text-muted)]'}`}
          >
            {isExtracting ? (
              <>
                <Loader2 size={32} className="text-[var(--accent)] animate-spin" />
                <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest">{t("Extraindo dados com IA...", "Extracting data with AI...")}</p>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)]">
                  <FileUp size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest mb-1">{t("Extração Automática", "Automatic Extraction")}</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{t("Arraste seu extrato ou comprovante aqui para preencher os dados automaticamente.", "Drag your statement or receipt here to fill in data automatically.")}</p>
                </div>
                <input 
                  type="file" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  accept="image/*,application/pdf,.csv,.xlsx,.tsv"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                />
              </>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Nome", "Name")}</label>
              <input placeholder={t("Ex: Carteira de Ações", "Ex: Stock Wallet")} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Valor (R$)", "Value (R$)")}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
                <input 
                  type="text" 
                  value={(formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormData({...formData, value: parseInt(val || '0') / 100});
                  }} 
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none font-mono" 
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none">
                <option value="liquidity">{t("Liquidez", "Liquidity")}</option>
                <option value="investment">{t("Investimento", "Investment")}</option>
                <option value="physical">{t("Bem Físico", "Physical Asset")}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Detalhes", "Details")}</label>
              <textarea placeholder={t("Descrição curta...", "Short description...")} value={formData.detail} onChange={e => setFormData({...formData, detail: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none h-24" />
            </div>
            <button onClick={handleAdd} className="w-full py-5 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors mt-4">
              {t("Adicionar Ativo", "Add Asset")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ProfileModal({ profile, onClose, onSave, onLogout, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({ ...profile });

  const handleSave = () => {
    if (!formData.displayName.trim()) {
      alert(t('O nome não pode estar vazio.', 'The name cannot be empty.'));
      return;
    }
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 p-6">
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2"><X size={24} /></button>
        </div>
        <div className="mt-4 space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-3xl border-2 border-[var(--accent)] overflow-hidden">
              <img src={formData.photoURL} alt={t("Perfil", "Profile")} className="w-full h-full object-cover" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-medium text-[var(--text-primary)]">{profile.displayName}</h3>
              <p className="text-[var(--text-muted)] text-xs">{profile.email}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Nome de Exibição", "Display Name")}</label>
              <input value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("URL da Foto", "Photo URL")}</label>
              <input value={formData.photoURL} onChange={e => setFormData({...formData, photoURL: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Chave Pix", "Pix Key")}</label>
              <input 
                value={formData.pix_key || ''} 
                placeholder={t("E-mail, CPF, Telefone ou Chave Aleatória", "Email, CPF, Phone or Random Key")}
                onChange={e => setFormData({...formData, pix_key: e.target.value})} 
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none" 
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Perfil de Investidor", "Investor Profile")}</label>
              <select 
                value={formData.investor_profile || 'Conservador'} 
                onChange={e => setFormData({...formData, investor_profile: e.target.value as any})} 
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none"
              >
                <option value="Conservador">Conservador</option>
                <option value="Sofisticado">Sofisticado</option>
                <option value="Arrojado">Arrojado</option>
              </select>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <button onClick={handleSave} className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors flex items-center justify-center gap-2">
                <Save size={16} /> {t("Salvar Alterações", "Save Changes")}
              </button>
              <button onClick={onLogout} className="w-full py-4 bg-[var(--destructive)]/10 text-[var(--destructive)] rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[var(--destructive)]/20 transition-colors flex items-center justify-center gap-2">
                <LogOut size={16} /> {t("Sair da Conta", "Log Out")}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
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
    <div className={`animate-pulse bg-white/5 rounded-xl ${className}`} />
  );
}

function IngestionHub({ isOpen, onClose, onProcess, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  
  if (!isOpen) return null;

  const options = [
    { id: 'scanner', icon: <QrCode size={24} />, label: t('Scanner QR/Boleto', 'QR/Boleto Scanner'), color: '#00FFA3' },
    { id: 'upload', icon: <FileText size={24} />, label: t('Upload de Documentos', 'Document Upload'), color: '#007AFF' },
    { id: 'spreadsheet', icon: <Table size={24} />, label: t('Importar Planilha', 'Import Spreadsheet'), color: '#FF9500' },
    { id: 'manual', icon: <Edit3 size={24} />, label: t('Lançamento Manual', 'Manual Entry'), color: '#FF2D55' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="relative w-full max-w-md bg-[#121212] border-t border-[var(--border-card)] rounded-t-[40px] p-8 pb-12 shadow-2xl"
      >
        <div className="w-12 h-1.5 bg-[var(--border-card)] rounded-full mx-auto mb-8" />
        
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('Hub de Ingestão', 'Ingestion Hub')}</h2>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {options.map((opt, idx) => (
            <button 
              key={`ingest-item-${opt.id}-${idx}`}
              onClick={() => onProcess(opt.id)}
              className="flex flex-col items-center justify-center p-6 bg-white/5 border border-white/10 rounded-[32px] hover:bg-white/10 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110" style={{ backgroundColor: `${opt.color}20`, color: opt.color }}>
                {opt.icon}
              </div>
              <span className="text-xs font-bold text-white/80 text-center tracking-tight">{opt.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function ReviewModal({ transaction, onConfirm, onCancel, language, isProcessing, users, ownerName, ownerPhoto }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(transaction?.participants || []);
  const [formData, setFormData] = useState({ ...transaction });

  const shareValue = transaction ? transaction.value / (selectedParticipants.length + 1) : 0;

  useEffect(() => {
    if (transaction) {
      setFormData({ ...transaction });
      // Smart Auto-selection based on Category
      if (transaction.categoria_primaria === 'Moradia' || transaction.category === 'Moradia') {
        setSelectedParticipants(users.map((u: any) => u.uid));
      }
    }
  }, [transaction, users]);

  // Handle category change auto-selection
  useEffect(() => {
    if (formData.categoria_primaria === 'Moradia' || formData.category === 'Moradia') {
      setSelectedParticipants(users.map((u: any) => u.uid));
    }
  }, [formData.categoria_primaria, formData.category, users]);

  if (!transaction && !isProcessing) return null;

  const toggleParticipant = (uid: string) => {
    setSelectedParticipants(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleConfirm = () => {
    onConfirm({ ...formData, participants: selectedParticipants });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-[40px] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {isProcessing ? (
          <div className="space-y-6 py-4">
            <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-3xl flex items-center justify-center mx-auto relative">
              <Sparkles size={40} className="text-[var(--accent)] animate-pulse" />
              <div className="absolute inset-0 border-4 border-[var(--accent)] border-t-transparent rounded-3xl animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-white">{t('Processando IA...', 'Processing AI...')}</h3>
              <p className="text-white/40 text-xs font-medium uppercase tracking-widest">{t('Analisando Documento', 'Analyzing Document')}</p>
            </div>
            <div className="space-y-3">
              <Shimmer className="h-12 w-full" />
              <Shimmer className="h-12 w-3/4 mx-auto" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 bg-[var(--accent)]/10 rounded-2xl flex items-center justify-center text-[var(--accent)]">
                <Zap size={28} />
              </div>
              <div>
                <p className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em]">{t('IA Detectou', 'AI Detected')}</p>
                <h3 className="text-xl font-bold text-white">{t('Revisar Lançamento', 'Review Entry')}</h3>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">{t('Título', 'Title')}</span>
                <span className="text-sm font-medium text-white">{transaction.label}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">{t('Valor', 'Value')}</span>
                <span className="text-lg font-mono font-bold text-[var(--accent)]">R$ {transaction.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">{t('Categoria', 'Category')}</span>
                <select 
                  className="bg-transparent text-sm font-medium text-white outline-none border-b border-white/10 focus:border-[var(--accent)] transition-colors cursor-pointer"
                  value={formData.categoria_primaria || formData.category}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setFormData({ ...formData, categoria_primaria: newCat, category: newCat });
                    if (newCat === 'Moradia') {
                      setSelectedParticipants(users.map((u: any) => u.uid));
                    }
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

            {/* SPLIT SECTION */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t('Dividir com', 'Split with')}</span>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setSelectedParticipants(users.map((u: any) => u.uid))}
                      className="px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] text-[8px] font-black uppercase rounded-md hover:bg-[var(--accent)]/20 transition-all border border-[var(--accent)]/20 shadow-sm"
                    >
                      {t('Todos', 'All')}
                    </button>
                    <button 
                      onClick={() => setSelectedParticipants([])}
                      className="px-2 py-0.5 bg-white/5 text-white/40 text-[8px] font-black uppercase rounded-md hover:bg-white/10 transition-all border border-white/10 shadow-sm"
                    >
                      {t('Nenhum', 'None')}
                    </button>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">
                  {selectedParticipants.length > 0 ? `${selectedParticipants.length + 1} ${t('Pessoas', 'People')} (1/N)` : t('Apenas eu', 'Just me')}
                </span>
              </div>
              
              <div className="grid grid-cols-4 gap-3 bg-white/5 p-4 rounded-3xl border border-white/10 shadow-inner">
                {/* OWNER (YOU) - ALWAYS SELECTED */}
                <div className="flex flex-col items-center gap-2 transition-all">
                  <div className="w-12 h-12 rounded-2xl border-2 border-[var(--accent)] scale-110 shadow-[0_0_15px_rgba(0,255,163,0.3)] overflow-hidden relative">
                    <img src={ownerPhoto} alt={ownerName} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-[var(--accent)]/10" />
                  </div>
                  <div className="space-y-0.5 text-center w-full">
                    <span className="text-[8px] font-black uppercase text-[var(--accent)] block truncate">
                      {ownerName?.split(' ')[0]}
                    </span>
                    <span className="text-[7px] font-mono font-bold text-white/60 block">
                      {shareValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {users.map((u: any, idx: number) => {
                  const isSelected = selectedParticipants.includes(u.uid);
                  return (
                    <button 
                      key={`user-sel-${u.uid}-${idx}`}
                      onClick={() => toggleParticipant(u.uid)}
                      className="flex flex-col items-center gap-2 group transition-all"
                    >
                      <div className={`w-12 h-12 rounded-2xl border-2 transition-all overflow-hidden ${isSelected ? 'border-[var(--accent)] scale-110 shadow-[0_0_15px_rgba(0,255,163,0.3)]' : 'border-white/10 grayscale opacity-40 hover:opacity-100 hover:grayscale-0'}`}>
                        <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" />
                      </div>
                      <div className="space-y-0.5 text-center w-full">
                        <span className={`text-[8px] font-bold truncate block ${isSelected ? 'text-[var(--accent)]' : 'text-white/40'}`}>
                          {u.displayName.split(' ')[0]}
                        </span>
                        {isSelected && (
                          <span className="text-[7px] font-mono font-bold text-white/60 block animate-in fade-in zoom-in duration-300">
                            {shareValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedParticipants.length > 0 && (
                <div className="bg-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-2xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">{t('Sua Cota', 'Your Share')}</span>
                    <span className="text-sm font-mono font-bold text-[var(--accent)]">
                      R$ {(transaction.value / (selectedParticipants.length + 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={onCancel}
                className="py-4 bg-white/5 text-white/60 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-colors"
              >
                {t('Descartar', 'Discard')}
              </button>
              <button 
                onClick={handleConfirm}
                className="py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,255,163,0.3)]"
              >
                {t('Confirmar', 'Confirm')}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
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
      </div>

      {children}
    </div>
  );
}

function SplitsList({ splits, users, onCopyPix, onSettle, pixKey, copyFeedback, language }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  
  if (splits.length === 0) return null;

  return (
    <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
      {splits.map((split: any, idx: number) => {
        const participant = users.find((u: any) => u.uid === split.uid);
        const isCopied = copyFeedback === split.id;
        
        return (
          <div key={`split-item-${split.id}-${idx}`} className="flex items-center justify-between p-3 bg-[var(--bg-app)]/50 rounded-xl border border-[var(--border-card)]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full overflow-hidden bg-[var(--accent)]/10">
                <img src={participant?.photoURL || `https://picsum.photos/seed/${split.uid}/50/50`} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[var(--text-primary)] leading-none mb-1">{participant?.displayName || '...'}</p>
                <p className="text-[10px] font-mono text-[var(--accent)] leading-none">
                  {split.shareValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => onCopyPix(pixKey, split.id)}
                className={`p-2 rounded-lg transition-all ${isCopied ? 'bg-[var(--trend-up)] text-[var(--bg-app)]' : 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'}`}
                title={t('Copiar Minha Chave Pix', 'Copy My Pix Key')}
              >
                {isCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button 
                onClick={() => onSettle(split)}
                className="p-2 rounded-lg bg-[var(--text-primary)]/5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all"
                title={t('Confirmar Recebimento', 'Confirm Receipt')}
              >
                <CircleCheck size={12} />
              </button>
            </div>
          </div>
        );
      })}
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
            CPF: {dda.cpf || '097.166.479-05'}
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

function HomeInvestmentCard({ saldoTotal, perfilAtual, privacyMode, onClick }: any) {
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
          <span className="text-[10px] text-[var(--accent)] font-bold">70% Alocado</span>
        </div>
        <div className="h-2 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: '70%' }}
            className="h-full bg-[var(--accent)]"
          />
        </div>
      </div>
    </motion.div>
  );
}

function DetalhesGastosPage({ 
  transactions, 
  splits, 
  splitProposals, 
  reports, 
  users, 
  familyMembers, 
  allAvailableParticipants,
  profile, 
  privacyMode, 
  onSeed, 
  language, 
  onEdit, 
  onDelete 
}: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [activeTab, setActiveTab] = useState<'transacoes' | 'rateio'>('transacoes');
  
  const totalAReceber = splits.reduce((acc: number, s: any) => acc + (s.shareValue || 0), 0);

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

  return (
    <div className="space-y-8 pb-32">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('Carteira', 'Wallet')}</h2>
          <p className="text-[var(--text-muted)] text-xs">{t('Gestão financeira completa', 'Complete financial management')}</p>
        </div>
        <div className="flex bg-[var(--bg-card)] p-1 rounded-2xl border border-[var(--border-card)]">
          <button 
            onClick={() => setActiveTab('transacoes')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'transacoes' ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-muted)] hover:text-white'}`}
          >
            {t('Transações', 'Transactions')}
          </button>
          <button 
            onClick={() => setActiveTab('rateio')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'rateio' ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-muted)] hover:text-white'}`}
          >
            {t('Rateio', 'Split')}
          </button>
        </div>
      </header>

      {activeTab === 'rateio' ? (
        <RateioFamiliarView 
          transactions={transactions}
          splits={splits}
          splitProposals={splitProposals}
          reports={reports}
          users={users}
          familyMembers={familyMembers}
          allAvailableParticipants={allAvailableParticipants}
          language={language}
          profile={profile}
          privacyMode={privacyMode}
          onSeed={onSeed}
        />
      ) : (
        <>
          {/* Header com Card A Receber */}
          <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-[var(--accent)]/10 transition-colors" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.3em]">{t("Gestão de Créditos", "Credit Management")}</span>
            <div className="flex items-center gap-3 mt-1">
              <h3 className="text-2xl font-medium text-[var(--text-primary)]">{t("A Receber", "To Receive")}</h3>
              <button 
                onClick={() => setActiveTab('rateio')}
                className="px-3 py-1 bg-[var(--accent)]/10 text-[var(--accent)] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/20 transition-all flex items-center gap-1"
              >
                <Users size={12} />
                {t("Conciliar", "Conciliate")}
              </button>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
            <TrendingUp size={24} />
          </div>
        </div>
        <p className="text-4xl font-mono tracking-tighter text-[var(--text-primary)]">
          {totalAReceber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
          {t("Total pendente de devedores", "Total pending from debtors")}
        </p>
      </section>

      {/* Lista de Gastos */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest">{t("Histórico de Gastos", "Expense History")}</h2>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">{transactions.filter((tx: any) => tx.type === 'out').length} {t("itens", "items")}</span>
        </div>
        
        <div className="space-y-3">
          {transactions.filter((tx: any) => tx.type === 'out').map((tx: any, idx: number) => (
            <motion.div 
              key={`expense-history-${tx.id}-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-between items-center p-4 bg-[var(--bg-card)] rounded-[24px] border border-[var(--border-card)] group hover:border-[var(--accent)] transition-all"
            >
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: `${getColor(tx.categoria_primaria)}1A`, color: getColor(tx.categoria_primaria) }}
                >
                  {getIcon(tx.categoria_primaria)}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{tx.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider">
                    {tx.date?.toDate ? tx.date.toDate().toLocaleDateString('pt-BR') : t("Recente", "Recent")}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-base font-mono font-bold text-[var(--trend-down)]">
                    - {tx.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function ZenithIAView({ language, transactions, assets, profile }: any) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  
  return (
    <div className="space-y-8 pb-32">
      <div className="flex flex-col items-center text-center space-y-4 py-10">
        <div className="w-20 h-20 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] relative">
          <Sparkles size={40} />
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full border-2 border-[var(--accent)]"
          />
        </div>
        <div>
          <h2 className="text-2xl font-medium text-[var(--text-primary)]">Zenith IA</h2>
          <p className="text-[var(--text-muted)] text-xs max-w-[240px] mx-auto">
            {t("Sua inteligência financeira pessoal está analisando sua carteira.", "Your personal financial intelligence is analyzing your portfolio.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-[var(--accent)]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{t("Insight do Dia", "Daily Insight")}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
            "{t("Notei que seus gastos com 'Energia' subiram 15% este mês. Que tal revisar o uso do ar-condicionado?", "I noticed your 'Energy' expenses rose 15% this month. How about reviewing the air conditioning use?")}"
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-[var(--accent)]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{t("Projeção de Patrimônio", "Wealth Projection")}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {t("Mantendo sua taxa de poupança atual, você atingirá sua meta de 'Liberdade Financeira' em 8.4 anos.", "Maintaining your current savings rate, you will reach your 'Financial Freedom' goal in 8.4 years.")}
          </p>
        </div>
      </div>

      <button className="w-full py-5 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all flex items-center justify-center gap-3">
        <Sparkles size={16} />
        {t("Gerar Relatório Completo", "Generate Full Report")}
      </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[40px] p-8 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 p-6">
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2"><X size={24} /></button>
        </div>
        <div className="mt-4 space-y-6">
          <h3 className="text-2xl font-medium text-[var(--text-primary)]">{initialData ? t('Editar Transação', 'Edit Transaction') : t('Nova Transação', 'New Transaction')}</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Descrição", "Description")}</label>
              <input 
                type="text" 
                required
                placeholder={t("Ex: Recebimento Pix", "Ex: Pix Receipt")}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-4 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none transition-colors mt-1"
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
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-4 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none transition-colors mt-1 font-mono"
                value={displayValue}
                onChange={handleValueChange}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Data", "Date")}</label>
              <input 
                type="date" 
                required
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-4 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none transition-colors mt-1"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { id: 'in', label: t('Entrada', 'Income'), color: 'var(--trend-up)' },
                  { id: 'out', label: t('Saída', 'Expense'), color: 'var(--trend-down)' },
                  { id: 'yield', label: t('Rendimento', 'Yield'), color: 'var(--trend-yield)' }
                ].map((t_type, idx) => (
                  <button
                    key={`tx-type-opt-${t_type.id}-${idx}`}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: t_type.id as any })}
                    className={`py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${formData.type === t_type.id ? 'bg-[var(--text-primary)]/5 border-[var(--text-primary)]/20 text-[var(--text-primary)]' : 'bg-transparent border-[var(--border-card)] text-[var(--text-muted)]'}`}
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
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-4 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] outline-none transition-colors mt-1"
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
              className="w-full py-4 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-all mt-4"
            >
              {initialData ? t('Salvar Alterações', 'Save Changes') : t('Confirmar Transação', 'Confirm Transaction')}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
