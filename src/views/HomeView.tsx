import React, { useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { MarketRateState } from '../lib/adapters/marketRateService';
import type { NetWorthProjectionPoint } from '../lib/adapters/netWorthProjection';
import { parseTransactionDate, resolveGoalTargets } from '../lib/finance';
import type { FinancialGoalTargets } from '../lib/finance';
import type { Asset, Transaction, DDA, Settings, ChartSlot } from '../types/app';
import { DDASuggestion, MiniMetricCard, AssetMiniCard } from '../components/dashboard/cards';
import { YieldProjectionCard } from '../components/dashboard/YieldProjectionCard';
import type { VisualSettings } from '../components/CardSettingsPanel';
import { useHomeLayout } from '../hooks/useHomeLayout';
import { PatrimonioHeroSection } from '../components/dashboard/PatrimonioHeroSection';

// Componentes modulares do dashboard
import { PatrimonyEvolutionChart } from '../components/dashboard/PatrimonyEvolutionChart';
import { AssetAllocationChart } from '../components/dashboard/AssetAllocationChart';
import { CashFlowChart } from '../components/dashboard/CashFlowChart';
import { CategoryDistributionChart } from '../components/dashboard/CategoryDistributionChart';
import { GoalsProgressChart } from '../components/dashboard/GoalsProgressChart';

const formatBRL2 = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'R$ 0,00';

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
  visualSettings,
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
}) => {
  const resolvedGoalTargets = useMemo(() => resolveGoalTargets(goalTargets), [goalTargets]);

  const {
    homeLayout,
    activePatrimonioIndex,
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
    metricItems,
    topMetricItems,
    carouselItems,
    remainingDashboardItems,
    metricLayoutClass,
  } = useHomeLayout({
    settings,
    assets,
    transactions,
    marketRate,
    projectionData,
    chartData,
    openDrawer,
  });

  const filteredRecentTransactions = useMemo(() => {
    let filtered = [...transactions];
    if (chartFilterValue.type === 'category' && chartFilterValue.value) {
      filtered = filtered.filter((tx) => getTransactionCategory(tx) === chartFilterValue.value);
    }
    filtered.sort((a, b) => {
      const dateA =
        parseTransactionDate(
          (a as { date?: unknown; createdAt?: unknown; timestamp?: unknown; data?: unknown })?.date ||
            (a as { createdAt?: unknown })?.createdAt ||
            (a as { timestamp?: unknown })?.timestamp ||
            (a as { data?: unknown })?.data
        )?.getTime() ?? 0;
      const dateB =
        parseTransactionDate(
          (b as { date?: unknown; createdAt?: unknown; timestamp?: unknown; data?: unknown })?.date ||
            (b as { createdAt?: unknown })?.createdAt ||
            (b as { timestamp?: unknown })?.timestamp ||
            (b as { data?: unknown })?.data
        )?.getTime() ?? 0;
      return dateB - dateA;
    });
    return filtered.slice(0, 5);
  }, [transactions, chartFilterValue]);

  const allocationData = useMemo(() => {
    const types: Record<string, number> = { liquidity: 0, investment: 0, physical: 0 };
    assets.forEach((a) => {
      if (a.type && types[a.type] !== undefined) {
        types[a.type] += Number(a.currentValue ?? a.manualBalance ?? a.value) || 0;
      }
    });
    return [
      { name: 'Bens Materiais', value: types.physical, color: 'var(--accent)' },
      { name: 'Ações/Invest.', value: types.investment, color: 'var(--trend-up)' },
      { name: 'Liquidez', value: types.liquidity, color: 'var(--trend-yield)' },
    ].filter((d) => d.value > 0);
  }, [assets]);

  const goals = useMemo(() => {
    const liquidity = assets
      .filter((a) => a.type === 'liquidity')
      .reduce((acc, a) => acc + Number(a.currentValue ?? a.manualBalance ?? a.value), 0);
    const total = assets.reduce((acc, a) => acc + Number(a.currentValue ?? a.manualBalance ?? a.value), 0);

    const emergencyGoal = resolvedGoalTargets.emergencyReserve;
    const freedomGoal = resolvedGoalTargets.financialFreedom;

    return [
      {
        name: 'Reserva de Emergência',
        current: liquidity,
        target: emergencyGoal,
        percent: Math.min(Math.round((liquidity / emergencyGoal) * 100), 100),
        color: 'var(--trend-up)',
      },
      {
        name: 'Liberdade Financeira',
        current: total,
        target: freedomGoal,
        percent: Math.min(Math.round((total / freedomGoal) * 100), 100),
        color: 'var(--accent)',
      },
    ];
  }, [assets, resolvedGoalTargets]);

  const renderMetric = (id: string) => {
    const metricConfig = (settings?.zenith_config?.metrics?.[id] || {
      visible: true,
      label: id.replace('METRIC_', ''),
    }) as ChartSlot;
    if (metricConfig.visible === false) return null;

    const mainColor =
      metricConfig.color ||
      (id === 'METRIC_ENTRADAS'
        ? 'var(--trend-up)'
        : id === 'METRIC_SAIDAS'
          ? 'var(--trend-down)'
          : id === 'METRIC_INVESTIMENTOS'
            ? 'var(--trend-up)'
            : 'var(--trend-yield)');
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
      return (
        <AssetMiniCard
          key={id}
          asset={asset}
          cdiAnnualPercent={marketRate.cdiAnnualPercent}
          privacy={privacyMode}
          onSettings={() => openDrawer('settings')}
        />
      );
    }

    switch (id) {
      case 'METRIC_SALDO':
        return (
          <MiniMetricCard
            key={id}
            id="net-worth"
            label={metricConfig.label || t('Patrimônio Total', 'Net Worth')}
            value={(metrics.netWorth ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            percent={metrics.netWorthVar}
            trend={metrics.netWorthTrend}
            data={chartData
              .filter((point) => typeof point.value === 'number')
              .slice(-10)
              .map((point) => ({ v: point.value as number }))}
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
            label={metricConfig.label || t('Entradas', 'Incomes')}
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
            label={metricConfig.label || t('Saídas', 'Expenses')}
            value={(metrics.out.total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            percent={metrics.out.var}
            trend={metrics.out.trend}
            data={metrics.out.data}
            color={mainColor}
            opacity={opacity}
            privacy={privacyMode}
            onSettings={openSettings}
            resolveStyle={resolveStyle}
            isExpense
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
            label={metricConfig.label || t('Investimentos', 'Investments')}
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
            privacyMode={privacyMode}
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
        // Ocultado temporariamente até que os modelos de IA correspondentes estejam prontos
        const isReady = false;
        if (!isReady) return null;

        const labels: Record<string, string> = {
          CHART_SAZON_MENS: t('Sazonalidade de Categoria', 'Category Seasonality'),
          CHART_PREV_CONTAS: t('Predição de Boletos', 'Bill Prediction'),
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
                {t('Em breve: Detecção automática e predição inteligente via IA.', 'Coming soon: Automatic detection and smart prediction via AI.')}
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
      {/* DDA SUGGESTIONS */}
      <AnimatePresence>
        {ddas
          .filter((d) => d.status === 'pending')
          .map((dda, idx) => (
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

      {/* CARROSSEL PATRIMÔNIO */}
      <PatrimonioHeroSection
        metrics={metrics}
        privacyMode={privacyMode}
        onTogglePrivacy={onTogglePrivacy}
        settings={settings}
        evolutionView={evolutionView}
        projectionTaxMode={projectionTaxMode}
        monthlyContribution={monthlyContribution}
        computedProjectionData={computedProjectionData}
        patrimonioCarouselRef={patrimonioCarouselRef}
        handlePatrimonioScroll={handlePatrimonioScroll}
        activePatrimonioIndex={activePatrimonioIndex}
        renderChart={renderChart}
        resolvedGoalTargets={resolvedGoalTargets}
        transactions={transactions}
        assets={assets}
        marketRate={marketRate}
        t={t}
      />

      {/* DASHBOARD INTEGRADO (DYNAMIC ORDER) */}
      {metricItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
              {t('Visão Geral', 'Overview')}
            </span>
            <button
              type="button"
              onClick={() => openDrawer('settings')}
              className="p-1.5 px-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
              title={t('Configurações de Layout & Dashboard', 'Layout & Dashboard Settings')}
              aria-label={t('Configurações de Layout & Dashboard', 'Layout & Dashboard Settings')}
            >
              <SettingsIcon size={12} className="text-[var(--accent)]" />
              <span className="text-[10px] font-bold text-[var(--text-primary)]">
                {t('Layout', 'Layout')}
              </span>
            </button>
          </div>
          {homeLayout === 'carrossel' ? (
            <>
              {topMetricItems.length > 0 && (
                <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
                  {topMetricItems.map((id) => renderMetric(id))}
                </div>
              )}
              {carouselItems.length > 0 && (
                <>
                  <div ref={carouselRef} onScroll={handleMetricCarouselScroll} className={metricLayoutClass}>
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
                        type="button"
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
            <div className={metricLayoutClass}>{metricItems.map((id) => renderMetric(id))}</div>
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
