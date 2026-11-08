import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Eye,
  EyeOff,
  Sparkles,
  List,
  LayoutGrid,
  GalleryHorizontal,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import type { MarketRateState } from '../lib/adapters/marketRateService';
import { calculateNetWorthProjection, NetWorthProjectionPoint } from '../lib/adapters/netWorthProjection';
import {
  parseTransactionDate,
  resolveGoalTargets,
} from '../lib/finance';
import { projectYieldBetween, resolveAssetPolicy } from '../lib/adapters/assetYieldService';
import type { FinancialGoalTargets } from '../lib/finance';
import { Asset, Transaction, DDA, Settings, ChartSlot } from '../types/app';
import {
  DDASuggestion,
  MiniMetricCard,
  AssetMiniCard,
} from '../components/dashboard/MetricCards';
import { FutureHeroCard } from '../components/dashboard/FutureHeroCard';
import { usePersistentState } from '../hooks/usePersistentState';
import { YieldProjectionCard } from './YieldProjectionCard';
import { GoalsHeroCard } from '../components/dashboard/GoalsHeroCard';
import { YieldReconciliationModal } from '../components/dashboard/YieldReconciliationModal';
import { FinancialCalendarModal } from '../components/modals/FinancialCalendarModal';
import type { VisualSettings } from '../components/CardSettingsPanel';

// Novos componentes modulares extraídos do dashboard
import { PatrimonyEvolutionChart } from '../components/dashboard/PatrimonyEvolutionChart';
import { AssetAllocationChart } from '../components/dashboard/AssetAllocationChart';
import { CashFlowChart } from '../components/dashboard/CashFlowChart';
import { CategoryDistributionChart } from '../components/dashboard/CategoryDistributionChart';
import { GoalsProgressChart } from '../components/dashboard/GoalsProgressChart';

const formatBRL2 = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'R$ 0,00';
const formatSignedBRL = (value: number) => `${value >= 0 ? '+' : ''}${formatBRL2(value)}`;

const getTransactionCategory = (transaction: Transaction) =>
  transaction?.categoria_primaria || transaction?.category || 'Outros';

export type DrawerPage = 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash';
export type NavigationTab = 'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Armazenamento';

export interface DashboardMetricTotal {
  total: number;
  var: string;
  trend: 'up' | 'down';
  data: Array<{ v: number }>;
}

export interface DashboardMetrics {
  in: DashboardMetricTotal;
  out: DashboardMetricTotal;
  yield?: DashboardMetricTotal;
  monthBalance?: number;
  netWorth: number;
  netWorthVar: string;
  netWorthTrend: 'up' | 'down';
  investments: number;
  investmentsVar: string;
  investmentsTrend: 'up' | 'down';
  investmentsData: Array<{ v: number }>;
}

export interface HomeViewUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  investor_profile?: 'Conservador' | 'Sofisticado' | 'Arrojado';
}

export interface ChartFilterState {
  type: 'category' | 'asset' | null;
  value: string | null;
}

export interface HomeViewProps {
  visualSettings?: VisualSettings;
  user?: HomeViewUser | null;
  settings: Settings;
  assets: Asset[];
  transactions: Transaction[];
  ddas: DDA[];
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  metrics: DashboardMetrics;
  chartData: Array<{ name: string; value: number | null; date?: string; predicted?: number }>;
  projectionData: NetWorthProjectionPoint[];
  cashFlowData: Array<{ name: string; value: number; isPredicted?: boolean }>;
  evolutionView?: 'historico' | 'projecao';
  setEvolutionView?: (v: 'historico' | 'projecao') => void;
  projectionTaxMode?: 'liquido' | 'bruto';
  setProjectionTaxMode?: (m: 'liquido' | 'bruto') => void;
  chartFilterValue: ChartFilterState;
  setChartFilterValue: React.Dispatch<React.SetStateAction<ChartFilterState>>;
  marketRate: MarketRateState;
  forceCreateInvestment: boolean;
  setForceCreateInvestment: (f: boolean) => void;
  investorProfile: 'Conservador' | 'Sofisticado' | 'Arrojado';
  portfolioAllocationPercent: number;
  openDrawer: (page?: DrawerPage) => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onSelectAsset: (asset: Asset) => void;
  onAcceptDDA: (dda: DDA) => Promise<void>;
  onRejectDDA: (dda: DDA) => Promise<void>;
  onUpdateAsset: (id: string, data: Partial<Asset>) => Promise<void>;
  onUpdateTransaction: (tx: Transaction, data: Partial<Transaction>) => Promise<void>;
  onCreateAsset: (data: Partial<Asset>) => Promise<void>;
  goalTargets?: FinancialGoalTargets;
  onSaveGoalTargets?: (goals: FinancialGoalTargets) => Promise<void> | void;
  t: (pt: string, en: string) => string;
}

export const HomeView: React.FC<HomeViewProps> = ({
  user: _user,
  settings,
  assets,
  transactions,
  ddas,
  privacyMode,
  onTogglePrivacy,
  metrics,
  chartData,
  projectionData,
  cashFlowData,
  evolutionView: _evolutionViewProp,
  setEvolutionView: _setEvolutionViewProp,
  projectionTaxMode: _projectionTaxModeProp,
  setProjectionTaxMode: _setProjectionTaxModeProp,
  chartFilterValue,
  setChartFilterValue,
  marketRate,
  forceCreateInvestment,
  setForceCreateInvestment,
  investorProfile,
  portfolioAllocationPercent,
  openDrawer,
  onNavigateTab,
  onSelectAsset,
  onAcceptDDA,
  onRejectDDA,
  onUpdateAsset,
  onUpdateTransaction,
  onCreateAsset,
  goalTargets,
  onSaveGoalTargets,
  t,
  visualSettings,
}) => {
  const resolvedGoalTargets = useMemo(() => resolveGoalTargets(goalTargets), [goalTargets]);
  const [activePatrimonioIndex, setActivePatrimonioIndex] = useState(0);
  const patrimonioCarouselRef = useRef<HTMLDivElement>(null);
  const isPatrimonioJumping = useRef(false);
  const [activeMetricIndex, setActiveMetricIndex] = useState(0);
  const [homeLayout, setHomeLayout] = usePersistentState<'lista' | 'grade' | 'carrossel'>('zenith_home_layout', 'carrossel');
  const carouselRef = useRef<HTMLDivElement>(null);
  const carouselScrollFrame = useRef<number | null>(null);

  const evolChartConfig = settings?.zenith_config?.charts?.['CHART_EVOL_PATRIMONIO'];

  // Ler estado do modo de visualização e impostos diretamente da config persistida
  const evolutionView = evolChartConfig?.evolutionViewMode ?? 'historico';
  const projectionTaxMode = evolChartConfig?.projectionTaxMode ?? 'liquido';
  const monthlyContribution = evolChartConfig?.monthlyContribution ?? 0;

  const targetYear = evolChartConfig?.projectionTargetYear ? Number(evolChartConfig.projectionTargetYear) : (new Date().getFullYear() + 1);
  const targetMonth = evolChartConfig?.projectionTargetMonth !== undefined ? Number(evolChartConfig.projectionTargetMonth) : 11;
  const now = new Date();
  const monthsDiff = (targetYear - now.getFullYear()) * 12 + (targetMonth - now.getMonth());
  const projectionMonths = Math.max(1, Math.min(120, monthsDiff));
  const includeCashFlow = evolChartConfig?.projectionIncludeCashFlow !== false;

  const computedProjectionData = useMemo(() => {
    if (evolutionView !== 'projecao') return projectionData;
    return calculateNetWorthProjection({
      assets,
      transactions,
      cdiAnnualPercent: marketRate.cdiAnnualPercent,
      months: projectionMonths,
      monthlyContribution,
      includeCashFlow,
    });
  }, [evolutionView, assets, transactions, marketRate.cdiAnnualPercent, monthlyContribution, projectionMonths, includeCashFlow, projectionData]);

  const resolveStyle = useCallback((catId: string, propertyName: string, defaultValue?: unknown) => {
    const config = settings?.zenith_config;
    if (!config) return defaultValue !== undefined ? defaultValue : 'var(--accent)';

    const cat = config.categories?.[catId];
    if (!cat) return defaultValue !== undefined ? defaultValue : 'var(--accent)';

    const avancado = cat.config_avancada?.[propertyName];
    if (avancado !== undefined && avancado !== null) {
      return avancado;
    }

    if (propertyName === "cor_grafico" || propertyName === "cor_destaque" || propertyName === "main_color") {
      return cat.cor_destaque?.hex || defaultValue;
    }

    const tema = config.master_states?.tema_global || "Escuro";
    const paletas: Record<string, Record<string, string>> = {
      "Escuro": { "bg": "#121212", "txt": "#E1E1E1", "accent": "#00FFA3" },
      "Claro": { "bg": "#F5F5F7", "txt": "#212121", "accent": "#007AFF" },
      "Contraste": { "bg": "#000000", "txt": "#00FF00", "accent": "#00FF00" }
    };

    const val = paletas[tema]?.[propertyName];
    if (val !== undefined) return val;
    if (defaultValue !== undefined) return defaultValue;
    return paletas[tema]?.["accent"] || 'var(--accent)';
  }, [settings?.zenith_config]);

  const portfolioMetrics = useMemo(() => {
    const inv = assets.filter((a) => a.type === 'investment');
    const today = new Date();
    const horizons = [
      today,
      new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()),
      new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()),
      new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
    ];

    let totalBalance = 0;
    let dailyTotal = 0;
    let monthTotal = 0;
    let avgPercent = 0;
    const projectionValues = horizons.map(() => 0);

    for (const asset of inv) {
      const currentValue = Number(asset.currentValue ?? asset.manualBalance ?? asset.value ?? 0) || 0;
      const daily = Number(asset.dailyYield ?? 0) || 0;
      const weekend = Number(asset.manualWeekendYield ?? 0) || 0;
      const businessDays = resolveAssetPolicy(asset)?.policy.dayCountConvention === 'BUSINESS_DAYS_252';

      totalBalance += currentValue;
      dailyTotal += daily;
      monthTotal += Number(asset.monthYieldRemaining ?? 0) || 0;
      avgPercent += Number(asset.yieldPercent ?? 0) || 0;

      horizons.forEach((horizon, index) => {
        projectionValues[index] += currentValue + projectYieldBetween(daily, weekend, businessDays, today, horizon);
      });
    }

    const yearTotal = projectionValues[3] - totalBalance;
    return {
      totalBalance,
      dailyTotal,
      monthTotal,
      yearTotal,
      projectionValues,
      avgPercent: inv.length > 0 ? avgPercent / inv.length : 0,
      count: inv.length,
    };
  }, [assets]);

  const totalCardChartData = useMemo(
    () => chartData.filter((p) => typeof p.value === 'number').slice(-10).map((p) => ({ v: p.value as number })),
    [chartData]
  );

  const totalCardOverlayDetails = useMemo(() => [
    { label: 'Rende/dia', value: formatSignedBRL(portfolioMetrics.dailyTotal) },
    { label: 'Até fim do mês', value: formatSignedBRL(portfolioMetrics.monthTotal) },
    { label: 'Projeção anual', value: formatSignedBRL(portfolioMetrics.yearTotal) },
    { label: 'Ativos', value: portfolioMetrics.count.toString() },
  ], [portfolioMetrics]);

  const openSettings = useCallback(() => openDrawer('settings'), [openDrawer]);

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

  const metricIds = useMemo(
    () => orderedDashboardItems.filter(id => id.startsWith('METRIC_') && id !== 'METRIC_RENDIMENTOS'),
    [orderedDashboardItems]
  );

  const assetItemIds = useMemo(
    () => assets.filter((a) => a.type === 'investment').map((a) => 'ASSET_' + a.id),
    [assets]
  );

  const portfolioItems = useMemo(
    () => [...assetItemIds],
    [assetItemIds]
  );

  const flowMetrics = useMemo(
    () => metricIds.filter((id) => {
      const cfg = settings?.zenith_config?.metrics?.[id];
      return cfg?.visible !== false;
    }),
    [metricIds, settings?.zenith_config?.metrics]
  );

  const metricItems = useMemo(
    () => ['METRIC_TOTAL_CARTEIRA', ...flowMetrics, ...portfolioItems],
    [flowMetrics, portfolioItems]
  );

  const topMetricItems = useMemo(
    () => ['METRIC_TOTAL_CARTEIRA', ...flowMetrics],
    [flowMetrics]
  );

  const carouselItems = portfolioItems;

  const remainingDashboardItems = useMemo(
    () => orderedDashboardItems.filter(id => !['METRIC_ENTRADAS','METRIC_SAIDAS','METRIC_TOTAL_CARTEIRA'].includes(id) && !id.startsWith('ASSET_')),
    [orderedDashboardItems]
  );

  const metricLayoutClass =
    homeLayout === 'grade'
      ? 'grid grid-cols-2 gap-4 w-full max-w-2xl mx-auto'
      : homeLayout === 'carrossel'
        ? 'flex overflow-x-auto snap-x snap-mandatory gap-4 w-full pb-8 pt-2 px-4 [&::-webkit-scrollbar]:hidden'
        : 'flex flex-col gap-4 w-full max-w-md mx-auto';

  const handleMetricCarouselScroll = useCallback(() => {
    if (carouselScrollFrame.current !== null) return;

    carouselScrollFrame.current = requestAnimationFrame(() => {
      carouselScrollFrame.current = null;
      const el = carouselRef.current;
      if (!el || carouselItems.length === 0) return;

      const setWidth = el.scrollWidth / 3;
      if (setWidth > 0) {
        if (el.scrollLeft < setWidth * 0.5) el.scrollLeft += setWidth;
        else if (el.scrollLeft > setWidth * 1.5) el.scrollLeft -= setWidth;
      }

      const center = el.scrollLeft + el.clientWidth / 2;
      let closestIndex = 0;
      let closestDistance = Infinity;
      Array.from(el.children).forEach((child, index) => {
        const node = child as HTMLElement;
        const childCenter = node.offsetLeft + node.offsetWidth / 2;
        const distance = Math.abs(childCenter - center);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setActiveMetricIndex(closestIndex % carouselItems.length);
    });
  }, [carouselItems.length]);

  useEffect(() => {
    return () => {
      if (carouselScrollFrame.current !== null) {
        cancelAnimationFrame(carouselScrollFrame.current);
      }
    };
  }, []);

  const scrollToMetric = useCallback((index: number) => {
    const el = carouselRef.current;
    if (!el || carouselItems.length === 0) return;
    const target = el.children[carouselItems.length + index] as HTMLElement | undefined;
    if (!target) return;
    el.scrollTo({
      left: target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [carouselItems.length]);

  useEffect(() => {
    if (homeLayout !== 'carrossel') return;
    const el = carouselRef.current;
    if (!el || carouselItems.length === 0) return;

    const frame = requestAnimationFrame(() => {
      const firstOfMiddleSet = el.children[carouselItems.length] as HTMLElement | undefined;
      el.scrollLeft = firstOfMiddleSet?.offsetLeft ?? el.scrollWidth / 3;
      setActiveMetricIndex(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [homeLayout, carouselItems.length]);

  const filteredRecentTransactions = useMemo(() => {
    let filtered = [...transactions];
    if (chartFilterValue.type === 'category' && chartFilterValue.value) {
      filtered = filtered.filter(t => getTransactionCategory(t) === chartFilterValue.value);
    }
    filtered.sort((a, b) => {
      const dateA = parseTransactionDate((a as { date?: unknown; createdAt?: unknown; timestamp?: unknown; data?: unknown })?.date || (a as { createdAt?: unknown })?.createdAt || (a as { timestamp?: unknown })?.timestamp || (a as { data?: unknown })?.data)?.getTime() ?? 0;
      const dateB = parseTransactionDate((b as { date?: unknown; createdAt?: unknown; timestamp?: unknown; data?: unknown })?.date || (b as { createdAt?: unknown })?.createdAt || (b as { timestamp?: unknown })?.timestamp || (b as { data?: unknown })?.data)?.getTime() ?? 0;
      return dateB - dateA;
    });
    return filtered.slice(0, 5);
  }, [transactions, chartFilterValue]);

  const allocationData = useMemo(() => {
    const types: Record<string, number> = { liquidity: 0, investment: 0, physical: 0 };
    assets.forEach(a => { 
      if (a.type && types[a.type] !== undefined) {
        types[a.type] += Number(a.currentValue ?? a.manualBalance ?? a.value) || 0; 
      }
    });
    return [
      { name: 'Bens Materiais', value: types.physical, color: 'var(--accent)' },
      { name: 'Ações/Invest.', value: types.investment, color: 'var(--trend-up)' },
      { name: 'Liquidez', value: types.liquidity, color: 'var(--trend-yield)' },
    ].filter(d => d.value > 0);
  }, [assets]);

  const goals = useMemo(() => {
    const liquidity = assets.filter(a => a.type === 'liquidity').reduce((acc, a) => acc + Number(a.currentValue ?? a.manualBalance ?? a.value), 0);
    const total = assets.reduce((acc, a) => acc + Number(a.currentValue ?? a.manualBalance ?? a.value), 0);
    
    const emergencyGoal = resolvedGoalTargets.emergencyReserve;
    const freedomGoal = resolvedGoalTargets.financialFreedom;
    
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
  }, [assets, resolvedGoalTargets]);

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

    if (id === 'METRIC_TOTAL_CARTEIRA') {
      return (
        <MiniMetricCard
          key={id}
          id="total-carteira"
          label="Total da Carteira"
          value={portfolioMetrics.totalBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          percent={(portfolioMetrics.avgPercent >= 0 ? '+' : '') + portfolioMetrics.avgPercent.toFixed(2) + '%'}
          trend={portfolioMetrics.avgPercent >= 0 ? 'up' : 'down'}
          data={totalCardChartData}
          color="var(--accent)"
          opacity={1}
          privacy={privacyMode}
          onSettings={openSettings}
          overlayDetails={totalCardOverlayDetails}
        />
      );
    }
    if (id.startsWith('ASSET_')) {
      const assetId = id.replace('ASSET_', '');
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return null;
      return <AssetMiniCard key={id} asset={asset} cdiAnnualPercent={marketRate.cdiAnnualPercent} privacy={privacyMode} onSettings={() => openDrawer('settings')} />;
    }

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
            onSettings={openSettings}
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
            onSettings={openSettings}
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
            onSettings={openSettings}
            resolveStyle={resolveStyle}
            isExpense={true}
          />
        );
      case 'METRIC_RENDIMENTOS':
        return (
          <YieldProjectionCard
            visualSettings={visualSettings}
            key={id}
            assets={assets}
            cdiAnnualPercent={marketRate.cdiAnnualPercent}
            rateSource={marketRate.source}
            language={settings.language}
            forceOpenCreateModal={forceCreateInvestment}
            onCloseCreateModal={() => setForceCreateInvestment(false)}
            onUpdateAsset={onUpdateAsset}
            onCreateAsset={onCreateAsset}
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
            onSettings={openSettings}
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
        return (
          <PatrimonyEvolutionChart
            key={id}
            id={id}
            evolutionView={evolutionView}
            projectionTaxMode={projectionTaxMode}
            computedProjectionData={computedProjectionData}
            chartData={chartData}
            visualType={visualType}
            mainColor={mainColor}
            opacity={opacity}
            isGradient={isGradient}
            tooltipsEnabled={tooltipsEnabled}
            predictiveEnabled={predictiveEnabled}
            showValues={Boolean(resolveStyle('evolution', 'show_values', true))}
            privacyMode={privacyMode}
            t={t}
          />
        );

      case 'CHART_METAS_PROG':
        return (
          <GoalsProgressChart
            key={id}
            id={id}
            goals={goals}
            resolvedGoalTargets={resolvedGoalTargets}
            onSaveGoalTargets={onSaveGoalTargets}
            opacity={opacity}
            t={t}
          />
        );

      case 'CHART_ALOC_ATIV':
        return (
          <AssetAllocationChart
            key={id}
            id={id}
            allocationData={allocationData}
            chartFilterValue={chartFilterValue}
            setChartFilterValue={setChartFilterValue}
            opacity={opacity}
            tooltipsEnabled={tooltipsEnabled}
            privacyMode={privacyMode}
            onNavigateTab={onNavigateTab}
            openDrawer={openDrawer}
            metrics={metrics}
            investorProfile={investorProfile}
            portfolioAllocationPercent={portfolioAllocationPercent}
            assets={assets}
            onSelectAsset={onSelectAsset}
            t={t}
          />
        );

      case 'CHART_FLUXO_CAIXA':
        return (
          <CashFlowChart
            key={id}
            id={id}
            cashFlowData={cashFlowData}
            mainColor={mainColor}
            opacity={opacity}
            tooltipsEnabled={tooltipsEnabled}
            showValues={Boolean(resolveStyle('cashflow', 'show_values', true))}
            openDrawer={openDrawer}
            t={t}
          />
        );

      case 'CHART_DIST_CATEG':
        return (
          <CategoryDistributionChart
            key={id}
            id={id}
            transactions={transactions}
            recentTransactions={filteredRecentTransactions}
            chartFilterValue={chartFilterValue}
            setChartFilterValue={setChartFilterValue}
            opacity={opacity}
            tooltipsEnabled={tooltipsEnabled}
            privacyMode={privacyMode}
            onNavigateTab={onNavigateTab}
            openDrawer={openDrawer}
            t={t}
          />
        );

      case 'CHART_SAZON_MENS':
      case 'CHART_PREV_CONTAS': {
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
      }
      default:
        return null;
    }
  };

  const handlePatrimonioScroll = () => {
    if (!patrimonioCarouselRef.current || isPatrimonioJumping.current) return;
    const el = patrimonioCarouselRef.current;
    const segment = el.scrollWidth / 3;
    const cardWidth = el.scrollWidth / 6;
    const newIdx = Math.round(el.scrollLeft / cardWidth) % 2;
    if (newIdx !== activePatrimonioIndex) setActivePatrimonioIndex(newIdx);
    if (el.scrollLeft < segment * 0.5) {
      isPatrimonioJumping.current = true;
      el.scrollLeft += segment;
      setTimeout(() => { isPatrimonioJumping.current = false; }, 100);
    } else if (el.scrollLeft > segment * 1.5) {
      isPatrimonioJumping.current = true;
      el.scrollLeft -= segment;
      setTimeout(() => { isPatrimonioJumping.current = false; }, 100);
    }
  };

  useEffect(() => {
    if (!patrimonioCarouselRef.current) return;
    requestAnimationFrame(() => {
      const el = patrimonioCarouselRef.current;
      if (!el) return;
      const firstOfMiddle = el.children[2] as HTMLElement;
      if (firstOfMiddle) el.scrollLeft = firstOfMiddle.offsetLeft;
    });
  }, []);

  const [showReconciliation, setShowReconciliation] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  useEffect(() => {
    const handleOpen = () => setShowReconciliation(true);
    window.addEventListener('open-reconciliation', handleOpen);
    return () => window.removeEventListener('open-reconciliation', handleOpen);
  }, []);

  const handleSaveReconciliation = async (updatedAssets: Array<{ id: string; manualDailyYield?: number | null; manualWeekendYield?: number | null }>) => {
    for (const asset of updatedAssets) {
      const original = assets.find((a) => a.id === asset.id);
      const nextDaily = asset.manualDailyYield ?? null;
      const nextWeekend = asset.manualWeekendYield ?? null;
      const previousDaily = original?.manualDailyYield ?? null;
      const previousWeekend = original?.manualWeekendYield ?? null;
      if (nextDaily === previousDaily && nextWeekend === previousWeekend) continue;
      await onUpdateAsset(asset.id, {
        manualDailyYield: nextDaily ?? undefined,
        manualWeekendYield: nextWeekend ?? undefined,
      });
    }
  };

  return (
    <>
      {/* CONTROLE DE LAYOUT */}
      <div className="flex items-center justify-between gap-3 w-full max-w-md mx-auto sm:max-w-2xl">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {t('Layout', 'Layout')}
        </span>
        <div className="flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-1">
          {([
            { id: 'lista', icon: List, label: t('Lista', 'List') },
            { id: 'grade', icon: LayoutGrid, label: t('Grade', 'Grid') },
            { id: 'carrossel', icon: GalleryHorizontal, label: t('Carrossel', 'Carousel') },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setHomeLayout(id)}
              aria-label={label}
              aria-pressed={homeLayout === id}
              className={`p-2 rounded-xl transition-colors ${homeLayout === id ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      {/* DDA SUGGESTIONS */}
      <AnimatePresence>
        {ddas.filter(d => d.status === 'pending').map((dda, idx) => (
          <DDASuggestion 
            key={`dda-${dda.id}-${idx}`} 
            dda={dda} 
            onAccept={onAcceptDDA} 
            onReject={onRejectDDA} 
            privacy={privacyMode} 
            language={settings.language}
          />
        ))}
      </AnimatePresence>

      {/* CARROSSEL PATRIMONIO: Evolucao + Futuro */}
      <div
        ref={patrimonioCarouselRef}
        onScroll={handlePatrimonioScroll}
        className="flex overflow-x-auto snap-x snap-mandatory gap-4 w-full pb-4 pt-2 [&::-webkit-scrollbar]:hidden"
      >
        {[0, 1, 2].map((loopIdx) => (
          <React.Fragment key={'patrimonio-loop-' + loopIdx}>
            <div className="snap-center shrink-0 w-[88vw] max-w-md">
              {/* CARD PATRIMÔNIO TOTAL */}
              <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-5 sm:p-6 relative overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    {settings?.customTerms?.['Saldo'] || (evolutionView === 'projecao' ? t("Projeção Patrimonial", "Net Worth Forecast") : t("Evolução do Patrimônio", "Net Worth Evolution"))}
                  </span>
                  {evolutionView === 'projecao' && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] uppercase tracking-wider">
                      {projectionTaxMode === 'liquido' ? t('Líquido', 'Net') : t('Bruto', 'Gross')}
                      {monthlyContribution > 0 && ` · R$ ${monthlyContribution}/mês`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-3xl font-mono tracking-tighter font-medium text-[var(--text-primary)]">
                    {privacyMode ? '••••••••' : (
                      evolutionView === 'projecao' && computedProjectionData.length > 1
                        ? (projectionTaxMode === 'liquido'
                            ? (computedProjectionData[computedProjectionData.length - 1].valueNet ?? 0)
                            : (computedProjectionData[computedProjectionData.length - 1].value ?? 0)
                          ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : (metrics.netWorth ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    )}
                  </h2>
                  <button 
                    onClick={onTogglePrivacy} 
                    className="w-7 h-7 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                  >
                    {privacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  {evolutionView === 'projecao' && computedProjectionData.length > 1 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] font-bold">
                      {computedProjectionData[computedProjectionData.length - 1].name}
                    </span>
                  )}
                </div>
                {renderChart('CHART_EVOL_PATRIMONIO')}
                <GoalsHeroCard currentNetWorth={metrics.netWorth ?? 0} transactions={transactions} assets={assets} target={resolvedGoalTargets.financialFreedom} privacy={privacyMode} />
              </section>
            </div>
            <div className="snap-center shrink-0 w-[88vw] max-w-md">
              <FutureHeroCard
                currentNetWorth={metrics.netWorth ?? 0}
                assets={assets}
                transactions={transactions}
                cdiAnnualPercent={marketRate.cdiAnnualPercent}
                privacy={privacyMode}
                onTogglePrivacy={onTogglePrivacy}
              />
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-center gap-2 mt-2 mb-4">
        {[0, 1].map((i) => (
          <div key={'dot-' + i} className={'h-2 rounded-full transition-all duration-300 ' + (activePatrimonioIndex === i ? 'w-6 bg-green-500' : 'w-2 bg-gray-600')} />
        ))}
      </div>

      {/* DASHBOARD INTEGRADO (DYNAMIC ORDER) */}
      {metricItems.length > 0 && (
        <div className="space-y-4">
          {homeLayout === 'carrossel' ? (
            <>
              {topMetricItems.length > 0 && (
                <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
                  {topMetricItems.map(id => renderMetric(id))}
                </div>
              )}
              {carouselItems.length > 0 && (
                <>
                  <div
                    ref={carouselRef}
                    onScroll={handleMetricCarouselScroll}
                    className={metricLayoutClass}
                  >
                    {[...carouselItems, ...carouselItems, ...carouselItems].map((id, index) => (
                      <div key={`carousel-metric-${id}-${index}`} className="snap-center shrink-0 w-[85vw] max-w-sm">
                        {renderMetric(id)}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    {carouselItems.map((id, index) => (
                      <button
                        key={`metric-dot-${id}`}
                        onClick={() => scrollToMetric(index)}
                        aria-label={`${t('Ir para', 'Go to')} ${id}`}
                        aria-current={activeMetricIndex === index}
                        className={`h-1.5 rounded-full transition-all duration-300 ${activeMetricIndex === index ? 'w-6 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'w-1.5 bg-green-500/30'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className={metricLayoutClass}>
              {metricItems.map(id => renderMetric(id))}
            </div>
          )}
        </div>
      )}

      {remainingDashboardItems.length > 0 && (
        <div className="space-y-6">
          {remainingDashboardItems.map((id, index) => (
            <React.Fragment key={`dash-${id}-${index}`}>
              {id.startsWith('METRIC_') ? renderMetric(id) : renderChart(id)}
            </React.Fragment>
          ))}
        </div>
      )}
    
      {/* Botão de Conciliação */}
      <div className="mt-4 flex justify-center mb-8">
        <button 
          onClick={() => setShowReconciliation(true)}
          className="flex items-center gap-2 px-5 py-3 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full text-xs font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-all shadow-lg"
        >
          <RefreshCw size={14} /> Conciliar Rendimentos com Extrato
        </button>
      </div>

      {showReconciliation && (
        <YieldReconciliationModal 
          assets={assets}
          onClose={() => setShowReconciliation(false)}
          onSave={handleSaveReconciliation}
        />
      )}
    
      {/* Botão Calendário */}
      <div className="mt-2 flex justify-center">
        <button 
          onClick={() => setShowCalendar(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-full text-xs font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-all shadow-sm"
        >
          <Calendar size={14} /> Histórico de Extratos
        </button>
      </div>

      {showCalendar && (
        <FinancialCalendarModal 
          assets={assets}
          transactions={transactions}
          onClose={() => setShowCalendar(false)}
          onUpdateAsset={onUpdateAsset}
          onUpdateTransaction={onUpdateTransaction}
        />
      )}
    </>
  );
};

export default HomeView;
