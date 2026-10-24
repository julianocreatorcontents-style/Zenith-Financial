import React, { useState } from 'react';
import { 
  Palette, Globe, ShieldCheck, PieChart, Sparkles, Save, Check, Eye, EyeOff, GripVertical,
  ChevronDown, ChevronUp, MoreVertical, Plus, RefreshCw, BarChart as BarChartIcon
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface ColorValue {
  hex: string;
  opacity?: number;
  label?: string;
}

interface AdvancedInterface {
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

interface MasterStates {
  modo_privacidade: boolean;
  insights_ia_ativo: boolean;
  idioma: string;
  tema_global: 'Escuro' | 'Claro' | 'Contraste';
  dashboard_management_expanded: boolean;
}

interface ZenithConfig {
  master_states: MasterStates;
  categories: Record<string, CategorySlot>;
  charts?: Record<string, ChartSlot>;
  metrics?: Record<string, ChartSlot>;
  dashboard_order?: string[];
}

interface HeritageSettingsProps {
  onClose: () => void;
  userId: string;
  currentConfig?: ZenithConfig;
  language: string;
  chartFilter?: { period: string; month: string; day: string };
  onChartFilterChange?: (filter: { period: string; month: string; day: string }) => void;
}

export const HeritageSettings: React.FC<HeritageSettingsProps> = ({ 
  onClose, 
  userId, 
  currentConfig,
  language,
  chartFilter,
  onChartFilterChange
}) => {
  // Hardcoded Charts for Backtest
  const HARDCODED_CHARTS: Record<string, ChartSlot> = {
    'CHART_EVOL_PATRIMONIO': { 
      id: 'CHART_EVOL_PATRIMONIO', 
      label: 'Evolução Patrimonial', 
      visible: true, 
      type: 'LineChart',
      visualType: 'Área',
      color: 'var(--accent)',
      opacity: 80,
      isGradient: true,
      granularity: 'Mês',
      timeframe: '6M',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: true
    },
    'CHART_ALOC_ATIV': { 
      id: 'CHART_ALOC_ATIV', 
      label: 'Alocação de Ativos', 
      visible: true, 
      type: 'DonutChart',
      visualType: 'Linha',
      color: '#007AFF',
      opacity: 100,
      isGradient: false,
      granularity: 'Mês',
      timeframe: '30D',
      predictiveInsights: false,
      tooltipsEnabled: true,
      touchToZoom: false
    },
    'CHART_FLUXO_CAIXA': { 
      id: 'CHART_FLUXO_CAIXA', 
      label: 'Fluxo de Caixa', 
      visible: true, 
      type: 'BarChart',
      visualType: 'Barra',
      color: '#FF3B30',
      opacity: 80,
      isGradient: true,
      granularity: 'Dia',
      timeframe: '30D',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: true
    },
    'CHART_METAS_PROG': { 
      id: 'CHART_METAS_PROG', 
      label: 'Progresso de Metas', 
      visible: true, 
      type: 'LinearProgress',
      visualType: 'Coluna',
      color: '#FFCC00',
      opacity: 100,
      isGradient: false,
      granularity: 'Mês',
      timeframe: '1A',
      predictiveInsights: false,
      tooltipsEnabled: true,
      touchToZoom: false
    },
    'CHART_DIST_CATEG': { 
      id: 'CHART_DIST_CATEG', 
      label: 'Distribuição de Gastos', 
      visible: true, 
      type: 'Placeholder',
      visualType: 'Barra',
      color: '#AF52DE',
      opacity: 70,
      isGradient: true,
      granularity: 'Mês',
      timeframe: '6M',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: true
    },
    'CHART_SAZON_MENS': { 
      id: 'CHART_SAZON_MENS', 
      label: 'Sazonalidade de Categoria', 
      visible: true, 
      type: 'Placeholder',
      visualType: 'Linha',
      color: '#5856D6',
      opacity: 100,
      isGradient: false,
      granularity: 'Ano',
      timeframe: '1A',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: false
    },
    'CHART_PREV_CONTAS': { 
      id: 'CHART_PREV_CONTAS', 
      label: 'Predição de Boletos', 
      visible: true, 
      type: 'Placeholder',
      visualType: 'Coluna',
      color: '#FF9500',
      opacity: 90,
      isGradient: true,
      granularity: 'Dia',
      timeframe: '15D',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: true
    },
  };

  const HARDCODED_METRICS: Record<string, ChartSlot> = {
    'METRIC_ENTRADAS': { 
      id: 'METRIC_ENTRADAS', 
      label: 'Entradas', 
      visible: true, 
      type: 'MetricCard',
      visualType: 'Linha',
      color: 'var(--accent)',
      opacity: 100,
      isGradient: false,
      granularity: 'Mês',
      timeframe: '30D',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: false
    },
    'METRIC_SAIDAS': { 
      id: 'METRIC_SAIDAS', 
      label: 'Saídas', 
      visible: true, 
      type: 'MetricCard',
      visualType: 'Linha',
      color: '#FF3B30',
      opacity: 100,
      isGradient: false,
      granularity: 'Mês',
      timeframe: '30D',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: false
    },
    'METRIC_RENDIMENTOS': { 
      id: 'METRIC_RENDIMENTOS', 
      label: 'Rendimentos', 
      visible: true, 
      type: 'MetricCard',
      visualType: 'Linha',
      color: '#007AFF',
      opacity: 100,
      isGradient: false,
      granularity: 'Mês',
      timeframe: '30D',
      predictiveInsights: true,
      tooltipsEnabled: true,
      touchToZoom: false
    }
  };

  const DEFAULT_DASHBOARD_ORDER = [
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

  const [localConfig, setLocalConfig] = useState<ZenithConfig>(() => {
    const defaultCategories: Record<string, CategorySlot> = {
      'evolution': { 
        id: 'evolution', 
        nome: 'Evolução', 
        cor_destaque: { hex: '#00FFA3', label: 'Neon Green' }, 
        visivel_no_dash: true, 
        config_avancada: { main_color: '#00FFA3', grid_style: 'horizontal', show_values: true, margin_top: 0 },
        ia_insights_buffer: {}
      },
      'allocation': { 
        id: 'allocation', 
        nome: 'Alocação', 
        cor_destaque: { hex: '#007AFF', label: 'Blue' }, 
        visivel_no_dash: true, 
        config_avancada: { main_color: '#007AFF', show_values: true },
        ia_insights_buffer: {}
      },
      'cashflow': { 
        id: 'cashflow', 
        nome: 'Fluxo', 
        cor_destaque: { hex: '#FF3B30', label: 'Red' }, 
        visivel_no_dash: true, 
        config_avancada: { main_color: '#00FFA3', grid_style: 'horizontal', show_values: true, margin_top: 0 },
        ia_insights_buffer: {}
      }
    };

    const base = currentConfig || {
      master_states: {
        modo_privacidade: false,
        insights_ia_ativo: false,
        idioma: "Português (Brasil)",
        tema_global: "Escuro",
        dashboard_management_expanded: true
      },
      categories: defaultCategories,
      charts: HARDCODED_CHARTS,
      metrics: HARDCODED_METRICS,
      dashboard_order: DEFAULT_DASHBOARD_ORDER
    };

    // Ensure hardcoded charts and default categories exist even if config is loaded
    const mergedCharts = { ...HARDCODED_CHARTS };
    if (base.charts) {
      Object.keys(base.charts).forEach(id => {
        mergedCharts[id] = { ...mergedCharts[id], ...base.charts[id] };
      });
    }

    const mergedMetrics = { ...HARDCODED_METRICS };
    if (base.metrics) {
      Object.keys(base.metrics).forEach(id => {
        mergedMetrics[id] = { ...mergedMetrics[id], ...base.metrics[id] };
      });
    }

    const mergedCategories = { ...defaultCategories, ...(base.categories || {}) };
    
    const mergedDashboardOrder = base.dashboard_order && base.dashboard_order.length > 0 
      ? Array.from(new Set([...base.dashboard_order, ...DEFAULT_DASHBOARD_ORDER]))
      : DEFAULT_DASHBOARD_ORDER;

    return { 
      ...base, 
      charts: mergedCharts, 
      categories: mergedCategories, 
      dashboard_order: mergedDashboardOrder,
      metrics: mergedMetrics
    };
  });

  const [loading, setLoading] = useState(false);

  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  const handleSave = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Local Storage Sync (Memory Lock)
      localStorage.setItem(`zenith_config_${userId}`, JSON.stringify(localConfig));

      const settingsRef = doc(db, 'settings', userId);
      await updateDoc(settingsRef, {
        zenith_config: localConfig
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${userId}`));
      onClose();
    } catch (error) {
      console.error("Error saving Zenith config:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateMaster = async (field: keyof MasterStates, value: any) => {
    const newConfig = {
      ...localConfig,
      master_states: { ...localConfig.master_states, [field]: value }
    };
    setLocalConfig(newConfig);
    // Instant sync for local storage
    localStorage.setItem(`zenith_config_${userId}`, JSON.stringify(newConfig));
    
    // Persist to Firestore
    await updateDoc(doc(db, 'settings', userId), {
      [`zenith_config.master_states.${field}`]: value
    }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${userId}`));
  };

  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  const updateChartConfig = async (id: string, updates: Partial<ChartSlot>, isMetric: boolean = false) => {
    const key = isMetric ? 'metrics' : 'charts';
    const newConfig = {
      ...localConfig,
      [key]: {
        ...localConfig[key],
        [id]: { ...localConfig[key]![id], ...updates }
      }
    };
    setLocalConfig(newConfig);
    localStorage.setItem(`zenith_config_${userId}`, JSON.stringify(newConfig));
    
    // Persist to Firestore
    const firestoreUpdates: any = {};
    Object.keys(updates).forEach(field => {
      firestoreUpdates[`zenith_config.${key}.${id}.${field}`] = (updates as any)[field];
    });
    await updateDoc(doc(db, 'settings', userId), firestoreUpdates).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${userId}`));
  };

  const toggleChartVisibility = (id: string, isMetric: boolean = false) => {
    const key = isMetric ? 'metrics' : 'charts';
    const chart = localConfig[key]![id];
    const newVisible = !chart.visible;
    updateChartConfig(id, { visible: newVisible }, isMetric);
    if (!newVisible && expandedChart === id) {
      setExpandedChart(null);
    }
  };

  const handleDashboardReorder = async (newOrder: string[]) => {
    const newConfig = { ...localConfig, dashboard_order: newOrder };
    setLocalConfig(newConfig);
    localStorage.setItem(`zenith_config_${userId}`, JSON.stringify(newConfig));
    
    // Persist to Firestore
    await updateDoc(doc(db, 'settings', userId), {
      'zenith_config.dashboard_order': newOrder
    }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${userId}`));
  };

  const settingsBody = (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* 1. Configurações Globais (Topo) */}
              <div className="space-y-3">
                {/* 🎨 Temas Visuais */}
                <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex flex-col gap-3 border border-[var(--border-card)]">
                  <div className="flex items-center gap-3">
                    <Palette size={18} className="text-[var(--accent)]" />
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Temas Visuais</p>
                  </div>
                  <div className="flex gap-1 bg-[var(--bg-app)] p-1 rounded-xl">
                    {(['Claro', 'Escuro', 'Contraste'] as const).map(t_mode => (
                      <button 
                        key={t_mode}
                        onClick={() => updateMaster('tema_global', t_mode)}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${localConfig.master_states.tema_global === t_mode ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-lg shadow-[var(--accent)]/20' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                      >
                        {t_mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 🌐 Idioma */}
                <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex items-center justify-between border border-[var(--border-card)]">
                  <div className="flex items-center gap-3">
                    <Globe size={18} className="text-[var(--accent)]" />
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Idioma</p>
                  </div>
                  <select 
                    value={localConfig.master_states.idioma}
                    onChange={(e) => updateMaster('idioma', e.target.value)}
                    className="bg-[var(--bg-app)] border-none rounded-xl text-[10px] font-bold px-3 py-2 outline-none cursor-pointer text-[var(--text-primary)]"
                  >
                    <option>Português (Brasil)</option>
                    <option>English (US)</option>
                    <option>Español</option>
                  </select>
                </div>

                {/* 🔒 Modo Privacidade */}
                <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex items-center justify-between border border-[var(--border-card)]">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={18} className="text-[var(--accent)]" />
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Privacidade</p>
                  </div>
                  <button 
                    onClick={() => updateMaster('modo_privacidade', !localConfig.master_states.modo_privacidade)}
                    className={`w-12 h-6 rounded-full transition-all relative ${localConfig.master_states.modo_privacidade ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-hover)]'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${localConfig.master_states.modo_privacidade ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              {/* 2. O Grande Grupo (Gestão do Dashboard ↓) */}
              <div className="space-y-2">
                <button 
                  onClick={() => updateMaster('dashboard_management_expanded', !localConfig.master_states.dashboard_management_expanded)}
                  className="w-full bg-[var(--bg-card)] rounded-[24px] p-5 flex items-center justify-between group hover:bg-[var(--bg-card-hover)] transition-all border border-[var(--border-card)]"
                >
                  <div className="flex items-center gap-4">
                    <PieChart size={20} className="text-[var(--accent)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-tight">Gestão do Dashboard</p>
                  </div>
                  {localConfig.master_states.dashboard_management_expanded ? <ChevronUp size={18} className="text-[var(--text-muted)]" /> : <ChevronDown size={18} className="text-[var(--text-muted)]" />}
                </button>

                <AnimatePresence>
                  {localConfig.master_states.dashboard_management_expanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-4 pt-2"
                    >
                      {/* FILTRO DO GRÁFICO */}
                      <div className="bg-[var(--bg-card)] rounded-[24px] p-4 space-y-3 border border-[var(--border-card)]">
                        <div className="flex items-center gap-3">
                          <BarChartIcon size={18} className="text-[var(--accent)]" />
                          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Filtro do Gráfico</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Período</label>
                            <select
                              value={chartFilter?.period || 'Meses'}
                              onChange={(e) => onChartFilterChange?.({ period: e.target.value, month: chartFilter?.month || 'Atual', day: chartFilter?.day || 'Todos' })}
                              className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer"
                            >
                              <option value="Semanas">Semanas</option>
                              <option value="Meses">Meses</option>
                              <option value="Anos">Anos</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Mês</label>
                            <select
                              value={chartFilter?.month || 'Atual'}
                              onChange={(e) => onChartFilterChange?.({ period: chartFilter?.period || 'Meses', month: e.target.value, day: chartFilter?.day || 'Todos' })}
                              className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer"
                            >
                              <option value="Atual">Atual</option>
                              <option value="Janeiro">Janeiro</option>
                              <option value="Fevereiro">Fevereiro</option>
                              <option value="Março">Março</option>
                              <option value="Abril">Abril</option>
                              <option value="Maio">Maio</option>
                              <option value="Junho">Junho</option>
                              <option value="Julho">Julho</option>
                              <option value="Agosto">Agosto</option>
                              <option value="Setembro">Setembro</option>
                              <option value="Outubro">Outubro</option>
                              <option value="Novembro">Novembro</option>
                              <option value="Dezembro">Dezembro</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Dia</label>
                            <select
                              value={chartFilter?.day || 'Todos'}
                              onChange={(e) => onChartFilterChange?.({ period: chartFilter?.period || 'Meses', month: chartFilter?.month || 'Atual', day: e.target.value })}
                              disabled={(chartFilter?.period || 'Meses') !== 'Meses'}
                              className={`w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer ${(chartFilter?.period || 'Meses') !== 'Meses' ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <option value="Todos">Todos</option>
                              <option>01-10</option>
                              <option>11-20</option>
                              <option>21-31</option>
                            </select>
                          </div>
                        </div>
                        <p className="text-[8px] text-[var(--text-muted)] leading-relaxed">
                          O dia filtra apenas o período Mensal. Semanas e Anos usam o mês como âncora.
                        </p>
                      </div>

                      {/* LISTA ÚNICA INTEGRADA */}
                      <div className="space-y-2">
                        <p className="px-4 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">Lista Única Integrada (Narrativa Financeira)</p>
                        <Reorder.Group 
                          axis="y" 
                          values={Array.from(new Set(localConfig.dashboard_order || []))} 
                          onReorder={handleDashboardReorder}
                          className="space-y-2"
                        >
                          {Array.from(new Set(localConfig.dashboard_order || [])).map(id => {
                            const isMetric = id.startsWith('METRIC_');
                            const item = isMetric ? localConfig.metrics?.[id] : localConfig.charts?.[id];
                            if (!item) return null;
                            
                            const isExpanded = expandedChart === id;
                            const isDisabled = !item.visible;

                            return (
                              <Reorder.Item 
                                key={id} 
                                value={id}
                                className={`bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] transition-all ${isExpanded ? 'border-[var(--accent)]/30 bg-[var(--bg-card-hover)]' : ''}`}
                              >
                                <div className={`flex items-center justify-between p-3 ${isDisabled ? 'opacity-40' : ''}`}>
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                                      <GripVertical size={16} />
                                    </div>
                                    <div 
                                      className="flex-1 cursor-pointer"
                                      onClick={() => !isDisabled && setExpandedChart(isExpanded ? null : id)}
                                    >
                                      <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                                        {item.label}
                                        {isMetric && <span className="text-[8px] bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded uppercase tracking-tighter">Métrica</span>}
                                        {!isDisabled && (isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                      </p>
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => toggleChartVisibility(id, isMetric)}
                                    className={`w-10 h-5 rounded-full transition-all relative ${item.visible ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-hover)]'}`}
                                  >
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${item.visible ? 'left-6' : 'left-1'}`} />
                                  </button>
                                </div>

                                <AnimatePresence>
                                  {isExpanded && !isDisabled && (
                                    <motion.div 
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="px-4 pb-5 pt-2 border-t border-[var(--border-card)] space-y-5"
                                    >
                                      {/* Estilo */}
                                      <div className="space-y-3">
                                        <p className="text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest">Estilo & Visual</p>
                                        {!isMetric && (
                                          <div className="grid grid-cols-5 gap-1">
                                            {['Candles', 'Linha', 'Área', 'Barra', 'Coluna'].map((type) => (
                                              <button
                                                key={type}
                                                onClick={() => updateChartConfig(id, { visualType: type as any })}
                                                className={`py-1.5 rounded-lg text-[8px] font-bold transition-all ${item.visualType === type ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'}`}
                                              >
                                                {type}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex items-center gap-3">
                                          <input 
                                            type="color" 
                                            value={item.color}
                                            onChange={(e) => updateChartConfig(id, { color: e.target.value }, isMetric)}
                                            className="w-6 h-6 rounded bg-transparent border-none cursor-pointer"
                                          />
                                          <input 
                                            type="range" 
                                            min="0" 
                                            max="100" 
                                            value={item.opacity}
                                            onChange={(e) => updateChartConfig(id, { opacity: parseInt(e.target.value) }, isMetric)}
                                            className="flex-1 h-1 bg-[var(--bg-card-hover)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
                                          />
                                          <span className="text-[9px] font-mono text-[var(--text-muted)]">{item.opacity}%</span>
                                        </div>
                                      </div>

                                      {/* Tempo */}
                                      <div className="space-y-3">
                                        <p className="text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest">Tempo & Filtros</p>
                                        <div className="flex gap-2">
                                          <div className="flex bg-[var(--bg-card)] rounded-xl p-1 flex-1">
                                            {['Ano', 'Mês', 'Dia'].map((g) => (
                                              <button
                                                key={g}
                                                onClick={() => updateChartConfig(id, { granularity: g as any }, isMetric)}
                                                className={`flex-1 py-1 rounded-lg text-[8px] font-bold transition-all ${item.granularity === g ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]/50'}`}
                                              >
                                                {g}
                                              </button>
                                            ))}
                                          </div>
                                          <select 
                                            value={item.timeframe}
                                            onChange={(e) => updateChartConfig(id, { timeframe: e.target.value as any }, isMetric)}
                                            className="bg-[var(--bg-card)] border-none rounded-xl text-[8px] font-bold px-2 outline-none cursor-pointer text-[var(--text-muted)]"
                                          >
                                            {['7D', '15D', '30D', '6M', '1A'].map(tf => (
                                              <option key={tf} value={tf}>{tf}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>

                                      {/* IA & Sync */}
                                      <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                          <p className="text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest">IA & Sincronização</p>
                                          <button className="text-[var(--text-muted)] hover:text-[var(--accent)]">
                                            <MoreVertical size={12} />
                                          </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <button 
                                            onClick={() => updateChartConfig(id, { predictiveInsights: !item.predictiveInsights }, isMetric)}
                                            className={`flex items-center justify-center gap-2 p-2 rounded-xl border transition-all ${item.predictiveInsights ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-muted)]'}`}
                                          >
                                            <Sparkles size={12} />
                                            <span className="text-[8px] font-bold uppercase">IA Insights</span>
                                          </button>
                                          <button className="flex items-center justify-center gap-2 p-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] transition-all">
                                            <RefreshCw size={12} />
                                            <span className="text-[8px] font-bold uppercase">Sync</span>
                                          </button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </Reorder.Item>
                            );
                          })}
                        </Reorder.Group>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ✨ Insights IA Master Switch */}
              <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex items-center justify-between border border-[var(--border-card)]">
                <div className="flex items-center gap-3">
                  <Sparkles size={18} className="text-[var(--accent)]" />
                  <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Insights IA Global</p>
                </div>
                <button 
                  onClick={() => updateMaster('insights_ia_ativo', !localConfig.master_states.insights_ia_ativo)}
                  className={`w-12 h-6 rounded-full transition-all relative ${localConfig.master_states.insights_ia_ativo ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-hover)]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${localConfig.master_states.insights_ia_ativo ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

            </div>
  );

  const settingsFooter = (
            <div className="p-8 border-t border-[var(--border-card)] bg-[var(--bg-card)]">
              <button 
                onClick={handleSave}
                disabled={loading}
                className="w-full py-5 bg-[var(--accent)] text-[var(--bg-app)] rounded-[24px] font-bold text-sm flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[var(--accent)]/20 disabled:opacity-50 disabled:scale-100"
              >
                {loading ? <div className="w-5 h-5 border-2 border-black/20 border-t-[var(--bg-app)] rounded-full animate-spin" /> : <Save size={20} />}
                Salvar e Fechar
              </button>
            </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-app)] text-[var(--text-primary)]">
      {settingsBody}
      {settingsFooter}
    </div>
  );
};
