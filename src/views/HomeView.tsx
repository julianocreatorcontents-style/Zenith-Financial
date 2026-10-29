import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Eye,
  EyeOff,
  Sparkles,
  Settings as SettingsIcon,
  CreditCard,
  Landmark,
  Car,
  ArrowUpRight,
  ArrowRightLeft,
  List,
  LayoutGrid,
  GalleryHorizontal,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart as RePieChart,
  Pie,
  Cell
} from 'recharts';
import type { MarketRateState } from '../lib/adapters/marketRateService';
import { calculateNetWorthProjection } from '../lib/adapters/netWorthProjection';
import { parseTransactionDate, isExpenseTransaction } from '../lib/finance';
import { Asset, Transaction, DDA, Settings, ChartSlot } from '../types/app';
import {
  DDASuggestion,
  MiniMetricCard,
  AssetMiniCard,
  SummaryCard,
  HomeInvestmentCard
} from '../components/dashboard/MetricCards';
import { YieldProjectionCard } from './YieldProjectionCard';
import type { VisualSettings } from '../components/CardSettingsPanel';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const formatBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

const getTransactionCategory = (transaction: any) =>
  transaction?.categoria_primaria || transaction?.category || 'Outros';

interface HomeViewProps {
  visualSettings?: VisualSettings;
  user: any;
  settings: Settings;
  assets: Asset[];
  transactions: Transaction[];
  ddas: DDA[];
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  metrics: any;
  chartData: any[];
  projectionData: any[];
  cashFlowData: any[];
  evolutionView?: 'historico' | 'projecao';
  setEvolutionView?: (v: 'historico' | 'projecao') => void;
  projectionTaxMode?: 'liquido' | 'bruto';
  setProjectionTaxMode?: (m: 'liquido' | 'bruto') => void;
  chartFilterValue: { type: 'category' | 'asset' | null; value: string | null };
  setChartFilterValue: React.Dispatch<React.SetStateAction<{ type: 'category' | 'asset' | null; value: string | null }>>;
  marketRate: MarketRateState;
  forceCreateInvestment: boolean;
  setForceCreateInvestment: (f: boolean) => void;
  investorProfile: 'Conservador' | 'Sofisticado' | 'Arrojado';
  portfolioAllocationPercent: number;
  openDrawer: (page?: any) => void;
  onNavigateTab: (tab: any) => void;
  onSelectAsset: (asset: Asset) => void;
  onAcceptDDA: (dda: DDA) => Promise<void>;
  onRejectDDA: (dda: DDA) => Promise<void>;
  onUpdateAsset: (id: string, data: any) => Promise<void>;
  onCreateAsset: (data: any) => Promise<void>;
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
  onCreateAsset,
  t,
  visualSettings,
}) => {
  const [activePortfolioIndex, setActivePortfolioIndex] = useState(0);
  const [activeMetricIndex, setActiveMetricIndex] = useState(0);
  const [homeLayout, setHomeLayout] = useState<'lista' | 'grade' | 'carrossel'>('lista');
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

  const resolveStyle = useCallback((catId: string, propertyName: string, defaultValue?: any) => {
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
    const inv = assets.filter((a: any) => a.type === 'investment');
    const totalBalance = inv.reduce((s: number, a: any) => s + (a.currentValue || 0), 0);
    const dailyTotal = inv.reduce((s: number, a: any) => s + (a.dailyYield || 0), 0);
    const monthTotal = inv.reduce((s: number, a: any) => s + (a.monthYieldRemaining || 0), 0);
    const yearTotal = dailyTotal * 365;
    const avgPercent = inv.length > 0 ? (inv.reduce((s: number, a: any) => s + (a.yieldPercent || 0), 0) / inv.length) : 0;
    return { totalBalance, dailyTotal, monthTotal, yearTotal, avgPercent, count: inv.length };
  }, [assets]);

  const totalCardChartData = useMemo(
    () => chartData.filter((p: any) => typeof p.value === 'number').slice(-10).map((p: any) => ({ v: p.value as number })),
    [chartData]
  );

  const totalCardOverlayDetails = useMemo(() => [
    { label: 'Rende/dia', value: '+R$ ' + portfolioMetrics.dailyTotal.toFixed(2) },
    { label: 'Até fim do mês', value: '+R$ ' + portfolioMetrics.monthTotal.toFixed(2) },
    { label: 'Projeção anual', value: '+R$ ' + portfolioMetrics.yearTotal.toFixed(2) },
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
    () => assets.filter((a: any) => a.type === 'investment').map((a: any) => 'ASSET_' + a.id),
    [assets]
  );

  const portfolioItems = useMemo(
    () => [...assetItemIds],
    [assetItemIds]
  );

  const flowMetrics = useMemo(
    () => metricIds.filter((id) => {
      const cfg = (settings?.zenith_config?.metrics as any)?.[id];
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
    return filtered.slice(0, 5);
  }, [transactions, chartFilterValue]);

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
          percent={'+' + portfolioMetrics.avgPercent.toFixed(2) + '%'}
          trend="up"
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
      const asset = assets.find((a: any) => a.id === assetId);
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
            assets={assets as any}
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
      case 'CHART_EVOL_PATRIMONIO': {
        const isProjection = evolutionView === 'projecao';
        const evolutionData = isProjection ? computedProjectionData : chartData;
        const activeDataKey = isProjection && projectionTaxMode === 'liquido' ? 'valueNet' : 'value';
        const comparisonDataKey = isProjection
          ? (projectionTaxMode === 'liquido' ? 'value' : 'valueNet')
          : null;

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
                          const pointValue = isProjection && projectionTaxMode === 'liquido'
                            ? (data.valueNet ?? data.value ?? 0)
                            : (data.value ?? data.predicted ?? 0);
                          return (
                            <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
                              <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1">{data.date}</p>
                              <p className="text-base font-mono font-bold text-[var(--text-primary)]">
                                {privacyMode ? '••••••' : pointValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                              {isProjection && data.projected && (
                                <div className="mt-2 space-y-1">
                                  {projectionTaxMode === 'liquido' && data.valueNet !== undefined && data.value !== data.valueNet && (
                                    <p className="text-[9px] text-[var(--text-muted)] font-mono">
                                      {t('Bruto:', 'Gross:')} {privacyMode ? '••••••' : Number(data.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                  )}
                                  {projectionTaxMode === 'bruto' && data.valueNet !== undefined && data.value !== data.valueNet && (
                                    <p className="text-[9px] text-[var(--text-muted)] font-mono">
                                      {t('Líquido est.:', 'Est. net:')} {privacyMode ? '••••••' : Number(data.valueNet).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                  )}
                                  <p className="text-[8px] text-[var(--accent)] font-bold italic">
                                    ✨ {projectionTaxMode === 'liquido'
                                      ? t('Projeção líquida (com IR regressivo e IOF)', 'Net projection (with regressive IR & IOF)')
                                      : t('Projeção bruta pelas taxas dos investimentos', 'Gross projection based on investment rates')}
                                  </p>
                                  {data.contributedTotal > 0 && (
                                    <p className="text-[9px] text-[var(--text-muted)] font-mono">
                                      {t('Aportes acumulados:', 'Cumulative contributions:')} {privacyMode ? '••••••' : Number(data.contributedTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                  )}
                                </div>
                              )}
                              {!isProjection && predictiveEnabled && data.predicted != null && (
                                <p className="mt-2 text-[8px] text-[var(--accent)] font-bold italic">
                                  ✨ {t('Projeção baseada na tendência recente', 'Projection based on recent trend')}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  )}
                  {comparisonDataKey && (
                    <Area 
                      type="monotone" 
                      dataKey={comparisonDataKey} 
                      stroke={mainColor} 
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      fill="transparent" 
                      dot={false}
                      isAnimationActive={false}
                      opacity={0.4}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey={activeDataKey} 
                    stroke={mainColor} 
                    strokeWidth={visualType === 'Linha' ? 2 : 3}
                    fillOpacity={visualType === 'Linha' ? 0 : opacity} 
                    fill={`url(#color-${id})`} 
                    activeDot={{ r: 5, fill: mainColor, stroke: 'var(--bg-app)', strokeWidth: 2 }}
                    dot={false}
                  />
                  {predictiveEnabled && !isProjection && (
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
                  <Bar dataKey={activeDataKey} fill={mainColor} fillOpacity={opacity} radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        );
      }
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
                  onClick={() => onNavigateTab('IA')}
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
                onClick={() => onNavigateTab('Carteira')}
              />
              <div className="grid grid-cols-2 gap-3">
                {assets.slice(0, 4).map((asset, assetIdx) => (
                  <SummaryCard 
                    key={`${asset.id}-${assetIdx}`}
                    label={asset.name} 
                    value={(asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).replace('R$', 'R$ ')} 
                    icon={asset.type === 'liquidity' ? <CreditCard size={14}/> : asset.type === 'investment' ? <Landmark size={14}/> : <Car size={14}/>} 
                    onClick={() => onSelectAsset(asset)} 
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
      case 'CHART_DIST_CATEG': {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const monthExpenses = transactions.filter(t => {
          const d = parseTransactionDate(t.date);
          return isExpenseTransaction(t) && d && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
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
                  onClick={() => onNavigateTab('IA')}
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
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] font-medium text-[var(--text-primary)]">{tx.label}</p>
                          {tx.applied === false && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase tracking-wider">
                              {t("Agendado", "Scheduled")}
                            </span>
                          )}
                        </div>
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
      }
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
      </section>

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
    </>
  );
};

export default HomeView;
