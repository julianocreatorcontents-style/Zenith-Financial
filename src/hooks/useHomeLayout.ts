import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import type { MarketRateState } from '../lib/adapters/marketRateService';
import { calculateNetWorthProjection, NetWorthProjectionPoint } from '../lib/adapters/netWorthProjection';
import { projectYieldBetween, resolveAssetPolicy } from '../lib/adapters/assetYieldService';
import { usePersistentState } from './usePersistentState';
import type { Asset, Transaction, Settings } from '../types/app';

const formatBRL2 = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'R$ 0,00';
const formatSignedBRL = (value: number) => `${value >= 0 ? '+' : ''}${formatBRL2(value)}`;

export interface UseHomeLayoutProps {
  settings: Settings;
  assets: Asset[];
  transactions: Transaction[];
  marketRate: MarketRateState;
  projectionData: NetWorthProjectionPoint[];
  chartData: Array<{ name: string; value: number | null; date?: string; predicted?: number }>;
  openDrawer: (page?: 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash') => void;
}

export function useHomeLayout({
  settings,
  assets,
  transactions,
  marketRate,
  projectionData,
  chartData,
  openDrawer,
}: UseHomeLayoutProps) {
  const [activePatrimonioIndex, setActivePatrimonioIndex] = useState(0);
  const patrimonioCarouselRef = useRef<HTMLDivElement>(null);
  const isPatrimonioJumping = useRef(false);

  const [activeMetricIndex, setActiveMetricIndex] = useState(0);
  const [homeLayout, setHomeLayout] = usePersistentState<'lista' | 'grade' | 'carrossel'>('zenith_home_layout', 'carrossel');
  const carouselRef = useRef<HTMLDivElement>(null);
  const carouselScrollFrame = useRef<number | null>(null);

  const evolChartConfig = settings?.zenith_config?.charts?.['CHART_EVOL_PATRIMONIO'];

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

  const handlePatrimonioScroll = useCallback(() => {
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
  }, [activePatrimonioIndex]);

  useEffect(() => {
    if (!patrimonioCarouselRef.current) return;
    requestAnimationFrame(() => {
      const el = patrimonioCarouselRef.current;
      if (!el) return;
      const firstOfMiddle = el.children[2] as HTMLElement;
      if (firstOfMiddle) el.scrollLeft = firstOfMiddle.offsetLeft;
    });
  }, []);

  return {
    homeLayout,
    setHomeLayout,
    activePatrimonioIndex,
    setActivePatrimonioIndex,
    patrimonioCarouselRef,
    handlePatrimonioScroll,
    activeMetricIndex,
    carouselRef,
    handleMetricCarouselScroll,
    scrollToMetric,
    evolutionView,
    projectionTaxMode,
    monthlyContribution,
    computedProjectionData,
    resolveStyle,
    portfolioMetrics,
    totalCardChartData,
    totalCardOverlayDetails,
    openSettings,
    orderedDashboardItems,
    metricItems,
    topMetricItems,
    carouselItems,
    remainingDashboardItems,
    metricLayoutClass,
  };
}
