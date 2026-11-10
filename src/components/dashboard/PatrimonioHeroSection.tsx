import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { GoalsHeroCard } from './GoalsHeroCard';
import { FutureHeroCard } from './FutureHeroCard';
import type { Asset, Transaction, Settings } from '../../types/app';
import type { NetWorthProjectionPoint } from '../../lib/adapters/netWorthProjection';
import type { FinancialGoalTargets } from '../../lib/finance';
import type { MarketRateState } from '../../lib/adapters/marketRateService';
import type { DashboardMetrics } from '../../views/HomeView';

export interface PatrimonioHeroSectionProps {
  metrics: DashboardMetrics;
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  settings: Settings;
  evolutionView: 'historico' | 'projecao';
  projectionTaxMode: 'liquido' | 'bruto';
  monthlyContribution: number;
  computedProjectionData: NetWorthProjectionPoint[];
  patrimonioCarouselRef: React.RefObject<HTMLDivElement | null>;
  handlePatrimonioScroll: () => void;
  activePatrimonioIndex: number;
  renderChart: (id: string) => React.ReactNode;
  resolvedGoalTargets: FinancialGoalTargets;
  transactions: Transaction[];
  assets: Asset[];
  marketRate: MarketRateState;
  t: (pt: string, en: string) => string;
}

export const PatrimonioHeroSection: React.FC<PatrimonioHeroSectionProps> = ({
  metrics,
  privacyMode,
  onTogglePrivacy,
  settings,
  evolutionView,
  projectionTaxMode,
  monthlyContribution,
  computedProjectionData,
  patrimonioCarouselRef,
  handlePatrimonioScroll,
  activePatrimonioIndex,
  renderChart,
  resolvedGoalTargets,
  transactions,
  assets,
  marketRate,
  t,
}) => {
  return (
    <>
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
                    {settings?.customTerms?.['Saldo'] ||
                      (evolutionView === 'projecao'
                        ? t('Projeção Patrimonial', 'Net Worth Forecast')
                        : t('Evolução do Patrimônio', 'Net Worth Evolution'))}
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
                    {privacyMode
                      ? '••••••••'
                      : evolutionView === 'projecao' && computedProjectionData.length > 1
                        ? (projectionTaxMode === 'liquido'
                            ? (computedProjectionData[computedProjectionData.length - 1].valueNet ?? 0)
                            : (computedProjectionData[computedProjectionData.length - 1].value ?? 0)
                          ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : (metrics.netWorth ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </h2>
                  <button
                    type="button"
                    onClick={onTogglePrivacy}
                    className="w-7 h-7 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    aria-label={privacyMode ? t('Exibir valores', 'Show values') : t('Ocultar valores', 'Hide values')}
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
                <GoalsHeroCard
                  currentNetWorth={metrics.netWorth ?? 0}
                  transactions={transactions}
                  assets={assets}
                  target={resolvedGoalTargets.financialFreedom}
                  privacy={privacyMode}
                />
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
          <div
            key={'dot-' + i}
            className={'h-2 rounded-full transition-all duration-300 ' + (activePatrimonioIndex === i ? 'w-6 bg-green-500' : 'w-2 bg-gray-600')}
          />
        ))}
      </div>
    </>
  );
};

export default PatrimonioHeroSection;
