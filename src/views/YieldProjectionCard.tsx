import { useMemo, useState, useEffect } from 'react';
import { YieldCalculator } from '../domain/yield/YieldCalculator';
import { IncomeTaxPolicy } from '../domain/tax/IncomeTaxPolicy';
import { IofPolicy } from '../domain/tax/IofPolicy';
import { TaxAlertService } from '../domain/tax/TaxAlertService';
import type { TaxRegressiveAlert } from '../domain/tax/TaxAlertService';
import { assetToInvestment } from '../lib/adapters/assetToInvestment';
import type { RawAssetDoc } from '../lib/adapters/assetToInvestment';
import type { Investment } from '../domain/investment/Investment';
import type { YieldPolicy } from '../domain/yield/YieldPolicy';
import { InvestmentPolicyModal } from '../components/InvestmentPolicyModal';
import type { InvestmentPolicyData } from '../components/InvestmentPolicyModal';

interface YieldProjectionCardProps {
  assets?: RawAssetDoc[];
  cdiAnnualPercent?: number;
  rateSource?: 'bcb' | 'cache' | 'default';
  language?: string;
  onUpdateAsset?: (id: string, data: any) => Promise<void>;
  onCreateAsset?: (data: any) => Promise<void>;
  forceOpenCreateModal?: boolean;
  onCloseCreateModal?: () => void;
}

const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const getLogo = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('99pay')) return 'https://www.google.com/s2/favicons?domain=99pay.com.br&sz=128';
  if (n.includes('mercado pago')) return 'https://www.google.com/s2/favicons?domain=mercadopago.com.br&sz=128';
  return null;
};

function buildNetPolicy(policy: YieldPolicy, taxRate: number): YieldPolicy {
  return { ...policy, rateTiers: policy.rateTiers.map((t) => ({ upTo: t.upTo, baseRateValue: t.baseRateValue * (1 - taxRate), bonusRateValue: t.bonusRateValue * (1 - taxRate) })) };
}

export function YieldProjectionCard({
  assets,
  cdiAnnualPercent = 13.65,
  rateSource = 'default',
  language = 'pt-BR',
  onUpdateAsset,
  onCreateAsset,
  forceOpenCreateModal,
  onCloseCreateModal,
}: YieldProjectionCardProps) {
  const isEn = language === 'en-US';
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (forceOpenCreateModal) {
      setModalMode('create'); setSelectedAssetId(null); setModalOpen(true);
    }
  }, [forceOpenCreateModal]);

  const handleClose = () => {
    setModalOpen(false);
    if (modalMode === 'create' && onCloseCreateModal) onCloseCreateModal();
  };

  const normalizedAssets = useMemo(() => {
    if (!assets || assets.length === 0) return [];
    return assets
      .filter(a => a.type === 'investment' || a.type === 'liquidity' || a.strategy)
      .map(a => {
        if (a.strategy && a.investmentPolicy) return a;
        return {
          ...a, strategy: 'FIXED_INCOME_TIERED',
          investmentPolicy: { indexer: 'CDI', rateType: 'PERCENT_INDEXER', dayCountConvention: 'BUSINESS_DAYS_252', taxDisplayMode: 'NET', rateTiers: [{ upTo: null, baseRateValue: 100, bonusRateValue: 0 }] }
        } as RawAssetDoc;
      });
  }, [assets]);

  const handleSave = async (data: InvestmentPolicyData) => {
    const tiers = [{ upTo: data.hasTier2 ? data.tier2Limit : null, baseRateValue: data.baseRateValue, bonusRateValue: data.bonusRateValue }];
    if (data.hasTier2) tiers.push({ upTo: null, baseRateValue: data.tier2BaseRate, bonusRateValue: data.tier2BonusRate });

    const newPolicy = {
      indexer: data.indexer, rateType: data.rateType, dayCountConvention: data.dayCountConvention, taxDisplayMode: data.taxDisplayMode,
      rateTiers: tiers
    };

    if (modalMode === 'create' && onCreateAsset) {
      await onCreateAsset({ name: data.name, value: data.initialBalance || 0, type: 'investment', strategy: 'FIXED_INCOME_TIERED', investmentPolicy: newPolicy });
    } else if (modalMode === 'edit' && selectedAssetId && onUpdateAsset) {
      if (!selectedAssetId.startsWith('demo-')) {
        await onUpdateAsset(selectedAssetId, { name: data.name, value: data.initialBalance, strategy: 'FIXED_INCOME_TIERED', investmentPolicy: newPolicy });
      }
    }
    handleClose();
  };

  const projections = useMemo(() => {
    const fromProps = normalizedAssets.map(assetToInvestment).filter((inv): inv is Investment => inv !== null);
    const source = fromProps.length > 0 ? fromProps : [];
    const today = new Date();

    const lastDayOfMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    let daysToProject = lastDayOfMonthDate.getDate() - today.getDate();
    let labelMonth = lastDayOfMonthDate;
    if (daysToProject === 0) {
      const nextMonthLastDay = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      daysToProject = nextMonthLastDay.getDate();
      labelMonth = nextMonthLastDay;
    }
    const monthAbbr = labelMonth.toLocaleString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    
    return source.map((inv) => {
      const days = inv.daysInvested(today);
      const grossDaily = YieldCalculator.dailyYieldTiered(inv.currentBalance, cdiAnnualPercent, inv.policy);
      const daysInYear = inv.policy.dayCountConvention === 'CALENDAR_DAYS_365' ? 365 : 252;
      const daysToProjectConvention = inv.policy.dayCountConvention === 'BUSINESS_DAYS_252'
        ? Math.max(1, Math.round((daysToProject * 252) / 365))
        : daysToProject;
      
      let irRate = 0; let totalTax = 0; let futureIrRate = 0;
      // CORREÇÃO: Desconta IR mesmo no dia 0
      if (inv.taxDisplayMode === 'NET') {
        irRate = IncomeTaxPolicy.rateFor(Math.max(days, 1));
        totalTax = Math.min(irRate + (days >= 1 ? IofPolicy.rateFor(days) : 0), 1);
        futureIrRate = IncomeTaxPolicy.rateFor(days + 365);
      }

      const netDaily = totalTax > 0 ? grossDaily.multiply(1 - totalTax) : grossDaily;
      const pMonthGross = YieldCalculator.projectTiered(inv.currentBalance, cdiAnnualPercent, inv.policy, daysToProjectConvention);
      const p1YearGross = YieldCalculator.projectTiered(inv.currentBalance, cdiAnnualPercent, inv.policy, daysInYear);
      const pMonthNet = totalTax > 0 ? YieldCalculator.projectTiered(inv.currentBalance, cdiAnnualPercent, buildNetPolicy(inv.policy, totalTax), daysToProjectConvention) : pMonthGross;
      const p1YearNet = futureIrRate > 0 ? YieldCalculator.projectTiered(inv.currentBalance, cdiAnnualPercent, buildNetPolicy(inv.policy, futureIrRate), daysInYear) : p1YearGross;

      const profitMonth = pMonthNet.subtract(inv.currentBalance);
      const profitYear = p1YearNet.subtract(inv.currentBalance);

      const tier1 = inv.policy.rateTiers[0];
      const effectiveRate = (tier1?.baseRateValue || 0) + (tier1?.bonusRateValue || 0);
      let rateStr = '';
      if (inv.policy.rateType === 'FIXED') rateStr = `${effectiveRate.toFixed(2)}% a.a.`;
      else if (inv.policy.rateType === 'SPREAD') rateStr = `CDI + ${effectiveRate.toFixed(2)}%`;
      else {
        rateStr = `${effectiveRate}% do CDI`;
        if (inv.policy.rateTiers.length > 1) rateStr += ` (até ${formatBRL(tier1?.upTo?.toBRL() || 0)})`;
      }

      const taxAlerts = TaxAlertService.getAlertsForInvestment(inv, today);

      return {
        id: inv.id, name: inv.name, balance: inv.currentBalance.toBRL(), rateStr,
        dailyBruto: grossDaily.toBRL(), dailyLiquido: netDaily.toBRL(),
        pMonthNet: pMonthNet.toBRL(), p1YearNet: p1YearNet.toBRL(),
        profitMonth: profitMonth.toBRL(), profitYear: profitYear.toBRL(),
        showBoth: inv.taxDisplayMode === 'NET', irRate, futureIrRate, days,
        taxAlerts,
      };
    });
  }, [normalizedAssets, cdiAnnualPercent]);

  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  let labelDate = lastDay;
  if (lastDay.getDate() === today.getDate()) labelDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const monthLabel = `ATÉ ${labelDate.getDate()} ${labelDate.toLocaleString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}`;

  if (projections.length === 0 && !onCreateAsset) {
    return (
      <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-5">
        <p className="text-sm text-[var(--text-muted)]">Nenhum investimento configurado no momento.</p>
      </section>
    );
  }

  return (
    <>
      <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Rendimento projetado</h3>
          <div className="flex items-center gap-3">
            {onCreateAsset && <button type="button" onClick={() => { setModalMode('create'); setSelectedAssetId(null); setModalOpen(true); }} className="text-[var(--text-muted)] hover:text-[var(--accent)] font-bold text-lg">+</button>}
            <span
              className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-mono flex items-center gap-1.5"
              title={
                rateSource === 'bcb'
                  ? 'Taxa oficial BCB (tempo real)'
                  : rateSource === 'cache'
                  ? 'Taxa BCB em cache local'
                  : 'Taxa de referência padrão'
              }
            >
              <span>CDI {cdiAnnualPercent.toFixed(2)}%</span>
              {rateSource === 'bcb' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {rateSource === 'cache' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {projections.map((p) => (
            <div key={p.id} className="bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 relative group">
              <button type="button" onClick={() => { setModalMode('edit'); setSelectedAssetId(p.id); setModalOpen(true); }} className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-[var(--accent)] opacity-50 group-hover:opacity-100 p-1">⚙️</button>

              <div className="flex justify-between items-baseline mb-3 pr-8">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    {getLogo(p.name) && <img src={getLogo(p.name)!} alt={p.name} className="w-5 h-5 rounded-full bg-white object-contain p-0.5" />}
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</span>
                  </div>
                  <span className="text-[10px] text-[var(--accent)] font-medium">{p.rateStr}</span>
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)]">{formatBRL(p.balance)}</span>
              </div>

              <div className="flex justify-between items-baseline mb-3">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{p.showBoth ? 'Líquido / dia' : 'Rende / dia'}</span>
                <span className="text-base font-bold text-[var(--accent)] font-mono">+{formatBRL(p.showBoth ? p.dailyLiquido : p.dailyBruto)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-card)]">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{monthLabel}</span>
                  <div className="text-sm font-bold text-[var(--accent)] font-mono">+{formatBRL(p.profitMonth)}</div>
                  <div className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">Saldo: {formatBRL(p.pMonthNet)}</div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">1 ANO</span>
                  <div className="text-sm font-bold text-[var(--accent)] font-mono">+{formatBRL(p.profitYear)}</div>
                  <div className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">Saldo: {formatBRL(p.p1YearNet)}</div>
                </div>
              </div>

              {p.taxAlerts && p.taxAlerts.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-[var(--border-card)]/50 space-y-1.5">
                  {p.taxAlerts.map((alert: TaxRegressiveAlert, idx: number) => (
                    <div
                      key={`${p.id}-tax-alert-${idx}`}
                      className="rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 p-2 text-left"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold text-[var(--accent)] flex items-center gap-1.5">
                          <span>{alert.type === 'IOF_ZERO' ? '🛡️' : '📉'}</span>
                          <span>{alert.title[isEn ? 'en' : 'pt']}</span>
                        </span>
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--text-primary)] font-bold">
                          {alert.daysRemaining} {isEn ? 'd left' : 'd rest.'}
                        </span>
                      </div>
                      <p className="text-[9px] text-[var(--text-muted)] leading-tight mt-1">
                        {alert.description[isEn ? 'en' : 'pt']}
                      </p>
                      {alert.estimatedTaxSavings.toBRL() > 0 && (
                        <p className="text-[8px] font-mono text-[var(--text-primary)] font-semibold mt-1">
                          ✨ {isEn ? 'Est. tax savings if held:' : 'Economia estimada ao aguardar:'}{' '}
                          <span className="text-[var(--accent)] font-bold">+{formatBRL(alert.estimatedTaxSavings.toBRL())}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[9px] text-[var(--text-muted)] mt-2 italic text-right">
                {p.showBoth ? `IR ${(p.irRate * 100).toFixed(1)}%` : `Bruto · IR no resgate · ${p.days} dias`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <InvestmentPolicyModal 
        isOpen={modalOpen} mode={modalMode} onClose={handleClose} onSave={handleSave} 
        initialData={modalMode === 'edit' && selectedAssetId ? (() => {
          const inv = projections.find(x => x.id === selectedAssetId);
          const asset = normalizedAssets.find(x => x.id === selectedAssetId);
          if (!inv || !asset) return undefined;
          
          const tiers = asset.investmentPolicy?.rateTiers || [];
          const t1 = tiers[0] || { upTo: null, baseRateValue: 100, bonusRateValue: 0 };
          const t2 = tiers[1] || { upTo: null, baseRateValue: 0, bonusRateValue: 0 };
          
          return {
            name: inv.name, initialBalance: inv.balance,
            indexer: asset.investmentPolicy?.indexer || 'CDI',
            rateType: asset.investmentPolicy?.rateType || 'PERCENT_INDEXER',
            dayCountConvention: asset.investmentPolicy?.dayCountConvention || 'BUSINESS_DAYS_252',
            taxDisplayMode: asset.investmentPolicy?.taxDisplayMode || 'NET',
            baseRateValue: t1.baseRateValue,
            bonusRateValue: t1.bonusRateValue,
            hasTier2: tiers.length > 1,
            tier2Limit: t1.upTo ? Number(t1.upTo) : 0,
            tier2BaseRate: t2.baseRateValue,
            tier2BonusRate: t2.bonusRateValue,
          };
        })() : undefined}
      />
    </>
  );
}
