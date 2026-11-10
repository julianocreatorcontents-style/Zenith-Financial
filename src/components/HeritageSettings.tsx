import React, { useState } from 'react';
import { 
  PieChart, Save, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { doc, updateDoc } from 'firebase/firestore';
import type { UpdateData } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { applyTheme } from '../lib/theme';
import { mapIdiomaToLanguage } from '../hooks/useUserSettings';
import type { ChartSlot, CategorySlot, MasterStates, ZenithConfig } from '../types/app';
import { GlobalSettingsSection } from './settings/GlobalSettingsSection';
import { ChartFilterCard } from './settings/ChartFilterCard';
import { DashboardSlotConfigItem } from './settings/DashboardSlotConfigItem';

interface HeritageSettingsProps {
  onClose: () => void;
  userId: string;
  currentConfig?: ZenithConfig;
  language: string;
  chartFilter?: { period: string; month: string; day: string };
  onChartFilterChange?: (filter: { period: string; month: string; day: string }) => void;
  hideGlobalSettings?: boolean;
}

export const HeritageSettings: React.FC<HeritageSettingsProps> = ({ 
  onClose, 
  userId, 
  currentConfig,
  chartFilter,
  onChartFilterChange,
  hideGlobalSettings = false,
}) => {
  // Hardcoded Charts for Backtest
  const HARDCODED_CHARTS: Record<string, ChartSlot> = {
    'CHART_EVOL_PATRIMONIO': { 
      id: 'CHART_EVOL_PATRIMONIO', 
      label: 'Evolução Patrimonial', 
      visible: true, 
      type: 'LineChart',
      visualType: 'Área',
      color: '#00FFA3',
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
      color: '#00FFA3',
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

    const mergedCharts = { ...HARDCODED_CHARTS };
    const baseCharts = base.charts;
    if (baseCharts) {
      Object.keys(baseCharts).forEach(id => {
        mergedCharts[id] = { ...mergedCharts[id], ...baseCharts[id] };
      });
    }

    const mergedMetrics = { ...HARDCODED_METRICS };
    const baseMetrics = base.metrics;
    if (baseMetrics) {
      Object.keys(baseMetrics).forEach(id => {
        mergedMetrics[id] = { ...mergedMetrics[id], ...baseMetrics[id] };
      });
    }

    const mergedCategories = { ...defaultCategories, ...(base.categories || {}) };
    
    const rawOrder = base.dashboard_order && base.dashboard_order.length > 0 
      ? base.dashboard_order 
      : DEFAULT_DASHBOARD_ORDER;
    const mergedDashboardOrder = Array.from(new Set(['CHART_EVOL_PATRIMONIO', ...rawOrder, ...DEFAULT_DASHBOARD_ORDER]));

    return { 
      ...base, 
      charts: mergedCharts, 
      categories: mergedCategories, 
      dashboard_order: mergedDashboardOrder,
      metrics: mergedMetrics
    };
  });

  const [loading, setLoading] = useState(false);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  const handleSave = async () => {
    if (!userId) return;
    setLoading(true);
    try {
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

  const updateMaster = async (field: keyof MasterStates, value: MasterStates[keyof MasterStates]) => {
    const newConfig: ZenithConfig = {
      ...localConfig,
      master_states: { ...localConfig.master_states, [field]: value }
    };
    setLocalConfig(newConfig);
    localStorage.setItem(`zenith_config_${userId}`, JSON.stringify(newConfig));

    if (field === 'tema_global' && typeof value === 'string') {
      applyTheme(value);
    }
    
    const updates: Record<string, unknown> = {
      [`zenith_config.master_states.${field}`]: value
    };
    if (field === 'modo_privacidade') {
      updates['privacyMode'] = Boolean(value);
    }
    if (field === 'idioma' && typeof value === 'string') {
      updates['language'] = mapIdiomaToLanguage(value);
    }

    await updateDoc(doc(db, 'settings', userId), updates as UpdateData<Record<string, unknown>>)
      .catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${userId}`));
  };

  const updateChartConfig = async (id: string, updates: Partial<ChartSlot>, isMetric: boolean = false) => {
    const key = isMetric ? 'metrics' : 'charts';
    const currentSlots = localConfig[key] || {};
    const currentSlot = currentSlots[id] || { id, label: id, visible: true, type: 'default' };

    const newConfig: ZenithConfig = {
      ...localConfig,
      [key]: {
        ...currentSlots,
        [id]: { ...currentSlot, ...updates }
      }
    };
    setLocalConfig(newConfig);
    localStorage.setItem(`zenith_config_${userId}`, JSON.stringify(newConfig));
    
    const firestoreUpdates: Record<string, unknown> = {};
    Object.entries(updates).forEach(([field, val]) => {
      firestoreUpdates[`zenith_config.${key}.${id}.${field}`] = val;
    });
    await updateDoc(doc(db, 'settings', userId), firestoreUpdates as unknown as UpdateData<Record<string, unknown>>).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${userId}`));
  };

  const toggleChartVisibility = (id: string, isMetric: boolean = false) => {
    const key = isMetric ? 'metrics' : 'charts';
    const chart = localConfig[key]?.[id];
    if (!chart) return;
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
    
    await updateDoc(doc(db, 'settings', userId), {
      'zenith_config.dashboard_order': newOrder
    }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${userId}`));
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-app)] text-[var(--text-primary)]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 1. Configurações Globais */}
        {!hideGlobalSettings && (
          <GlobalSettingsSection
            masterStates={localConfig.master_states}
            onUpdateMaster={updateMaster}
          />
        )}

        {/* 2. Gestão do Dashboard */}
        <div className="space-y-2">
          <button 
            onClick={() => updateMaster('dashboard_management_expanded', !localConfig.master_states.dashboard_management_expanded)}
            className="w-full bg-[var(--bg-card)] rounded-[24px] p-5 flex items-center justify-between group hover:bg-[var(--bg-card-hover)] transition-all border border-[var(--border-card)]"
          >
            <div className="flex items-center gap-4">
              <PieChart size={20} className="text-[var(--accent)]" />
              <p className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-tight">Gestão do Dashboard</p>
            </div>
            {localConfig.master_states.dashboard_management_expanded ? (
              <ChevronUp size={18} className="text-[var(--text-muted)]" />
            ) : (
              <ChevronDown size={18} className="text-[var(--text-muted)]" />
            )}
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
                <ChartFilterCard
                  chartFilter={chartFilter}
                  onChartFilterChange={onChartFilterChange}
                />

                {/* LISTA ÚNICA INTEGRADA */}
                <div className="space-y-2">
                  <p className="px-4 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
                    Lista Única Integrada (Narrativa Financeira)
                  </p>
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

                      return (
                        <DashboardSlotConfigItem
                          key={id}
                          id={id}
                          item={item}
                          isMetric={isMetric}
                          isExpanded={expandedChart === id}
                          onToggleExpand={() => setExpandedChart(expandedChart === id ? null : id)}
                          onToggleVisibility={() => toggleChartVisibility(id, isMetric)}
                          onUpdateConfig={(updates) => updateChartConfig(id, updates, isMetric)}
                        />
                      );
                    })}
                  </Reorder.Group>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="p-8 border-t border-[var(--border-card)] bg-[var(--bg-card)]">
        <button 
          onClick={handleSave}
          disabled={loading}
          className="w-full py-5 bg-[var(--accent)] text-[var(--bg-app)] rounded-[24px] font-bold text-sm flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[var(--accent)]/20 disabled:opacity-50 disabled:scale-100"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-black/20 border-t-[var(--bg-app)] rounded-full animate-spin" />
          ) : (
            <Save size={20} />
          )}
          Salvar e Fechar
        </button>
      </div>
    </div>
  );
};

export default HeritageSettings;
