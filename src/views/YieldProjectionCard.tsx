import { useMemo, useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, AreaChart, Area, YAxis, XAxis, CartesianGrid } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { YieldCalculator } from '../domain/yield/YieldCalculator';
import { IncomeTaxPolicy } from '../domain/tax/IncomeTaxPolicy';
import { IofPolicy } from '../domain/tax/IofPolicy';
import { assetToInvestment } from '../lib/adapters/assetToInvestment';
import type { RawAssetDoc } from '../lib/adapters/assetToInvestment';
import type { Investment } from '../domain/investment/Investment';
import type { YieldPolicy } from '../domain/yield/YieldPolicy';
import { InvestmentPolicyModal } from '../components/InvestmentPolicyModal';
import type { InvestmentPolicyData } from '../components/InvestmentPolicyModal';
import type { VisualSettings } from '../components/CardSettingsPanel';

interface YieldProjectionCardProps {
  assets?: RawAssetDoc[];
  cdiAnnualPercent?: number;
  rateSource?: 'bcb' | 'cache' | 'default';
  language?: string;
  onUpdateAsset?: (id: string, data: any) => Promise<void>;
  onCreateAsset?: (data: any) => Promise<void>;
  forceOpenCreateModal?: boolean;
  onCloseCreateModal?: () => void;
  visualSettings?: VisualSettings;
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

export function YieldProjectionCard({ assets, cdiAnnualPercent = 13.65, rateSource = 'default', language = 'pt-BR', onUpdateAsset, onCreateAsset, forceOpenCreateModal, onCloseCreateModal, visualSettings }: YieldProjectionCardProps) {
  const isEn = language === 'en-US';
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  const settings = visualSettings || {
    isCustomEnabled: true,
    chartHeight: 'h-64',
    lineThickness: 0.5,
    showAxes: true,
    showProjections: true,
    accentColor: '#00FFA3',
    fontFamily: 'monospace',
    cardBgOpacity: 0.8,
    textColor: '#FFFFFF',
    textSizeScale: 1.0,
    textOpacity: 1.0,
  };

  const isCustom = settings.isCustomEnabled !== false;
  const cardBg = isCustom ? 'rgba(10, 26, 18, ' + settings.cardBgOpacity + ')' : 'var(--bg-card)';
  const textPrimary = isCustom ? settings.textColor : 'var(--text-primary)';
  const textMuted = isCustom ? 'rgba(255,255,255,0.4)' : 'var(--text-muted)';
  const accent = isCustom ? settings.accentColor : '#00FFA3';
  const fontFam = isCustom ? settings.fontFamily : 'inherit';

  const txtStyle = (baseSize: number, baseOpacity: number) => ({
    color: isCustom ? settings.textColor : 'inherit',
    fontSize: (baseSize * settings.textSizeScale) + 'px',
    opacity: isCustom ? settings.textOpacity * baseOpacity : baseOpacity,
  });

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
    const newPolicy = {
      indexer: data.indexer, rateType: data.rateType, dayCountConvention: data.dayCountConvention, taxDisplayMode: data.taxDisplayMode,
      rateTiers: [
        { upTo: data.hasTier2 ? data.tier2Limit : null, baseRateValue: data.baseRateValue, bonusRateValue: data.bonusRateValue },
        ...(data.hasTier2 ? [{ upTo: null, baseRateValue: data.tier2BaseRate, bonusRateValue: data.tier2BonusRate }] : [])
      ]
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
    const monthLabel = 'Até ' + labelMonth.getDate() + ' ' + monthAbbr.toLowerCase();

    return source.map((inv) => {
      const days = inv.daysInvested(today);
      const grossDaily = YieldCalculator.dailyYieldTiered(inv.currentBalance, cdiAnnualPercent, inv.policy);
      const daysInYear = inv.policy.dayCountConvention === 'CALENDAR_DAYS_365' ? 365 : 252;
      const daysToProjectConvention = inv.policy.dayCountConvention === 'BUSINESS_DAYS_252' ? Math.max(1, Math.round((daysToProject * 252) / 365)) : daysToProject;

      let irRate = 0; let totalTax = 0; let futureIrRate = 0;
      const taxDays = inv.daysInvested(today);
      if (inv.taxDisplayMode === 'NET') {
        irRate = IncomeTaxPolicy.rateFor(Math.max(taxDays, 1));
        totalTax = Math.min(irRate + (taxDays >= 1 ? IofPolicy.rateFor(taxDays) : 0), 1);
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
      if (inv.policy.rateType === 'FIXED') rateStr = effectiveRate.toFixed(2) + '% a.a.';
      else if (inv.policy.rateType === 'SPREAD') rateStr = 'CDI + ' + effectiveRate.toFixed(2) + '%';
      else {
        rateStr = effectiveRate + '% do CDI';
        if (inv.policy.rateTiers.length > 1) rateStr += ' (até ' + formatBRL(tier1?.upTo?.toBRL() || 0) + ')';
      }

      return {
        id: inv.id, name: inv.name, balance: inv.currentBalance.toBRL(), baseBalance: inv.principal.toBRL(), rateStr,
        dailyBruto: grossDaily.toBRL(), dailyLiquido: netDaily.toBRL(),
        pMonthNet: pMonthNet.toBRL(), p1YearNet: p1YearNet.toBRL(), pMonthGross: pMonthGross.toBRL(), p1YearGross: p1YearGross.toBRL(),
        profitMonth: profitMonth.toBRL(), profitYear: profitYear.toBRL(),
        showBoth: inv.taxDisplayMode === 'NET', monthLabel, todayDate: today.getDate(), monthEndDate: labelMonth.getDate()
      };
    });
  }, [normalizedAssets, cdiAnnualPercent]);

  const portfolioTotals = useMemo(() => {
    let totalDaily = 0;
    let totalMonthly = 0;
    let totalYearly = 0;
    let totalBalance = 0;

    projections.forEach(p => {
      const daily = p.showBoth ? p.dailyLiquido : p.dailyBruto;
      totalDaily += daily;
      totalMonthly += p.profitMonth;
      totalYearly += p.profitYear;
      totalBalance += p.balance;
    });

    const investments = normalizedAssets.map(assetToInvestment).filter(inv => inv !== null);
    const curve = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const days = Math.round(month * 30.4166);
      let projectedTotal = 0;

      investments.forEach(inv => {
        const projected = YieldCalculator.projectTiered(inv.currentBalance, cdiAnnualPercent, inv.policy, days);
        projectedTotal += projected.toBRL();
      });

      return { name: 'M' + month, value: projectedTotal - totalBalance };
    });

    return { totalDaily, totalMonthly, totalYearly, curve };
  }, [projections, normalizedAssets, cdiAnnualPercent]);

  useEffect(() => {
    if (!hasInitialized.current && projections.length > 0) {
      setExpandedId(projections[0].id);
      hasInitialized.current = true;
    }
  }, [projections.length]);

  if (projections.length === 0 && !onCreateAsset) return null;

  const dynamicStyles = {
    '--accent': isCustom ? settings.accentColor : 'var(--accent)',
    fontFamily: isCustom ? (settings.fontFamily === 'monospace' ? 'monospace' : settings.fontFamily === 'serif' ? 'serif' : 'sans-serif') : 'inherit',
  } as React.CSSProperties;

  return (
    <>
      <div className="space-y-3" style={dynamicStyles}>
        <div className="flex justify-between items-center mb-2 px-1">
          <h3 style={{ color: textPrimary }} className="text-sm font-bold">Rendimento projetado</h3>
          {onCreateAsset && <button type="button" onClick={() => { setModalMode('create'); setSelectedAssetId(null); setModalOpen(true); }} style={{ color: textPrimary }} className="hover:text-[var(--accent)] font-bold text-lg">+</button>}
        </div>

        {/* HERO CARD (SOMA TOTAL) */}
        <div style={{ backgroundColor: cardBg }} className={'relative overflow-hidden rounded-[24px] border mb-4 ' + (isCustom ? 'border-[var(--accent)]/30 shadow-[0_10px_40px_-10px_rgba(0,255,163,0.2)]' : 'border-[var(--border-card)] shadow-sm')}>
          {isCustom && <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--accent)] opacity-[0.07] blur-[60px] rounded-full pointer-events-none"></div>}
          
          <div className="relative z-10 p-5">
            <h2 style={{ color: textPrimary }} className="text-sm font-bold mb-4">Total da Carteira</h2>
            
            <div className="grid grid-cols-3 gap-2 mb-6">
              <div>
                <span style={{ color: textMuted }} className="text-[9px] uppercase tracking-widest block mb-1">Diário</span>
                <span style={{ color: accent }} className="text-lg font-bold font-mono">+{formatBRL(portfolioTotals.totalDaily)}</span>
              </div>
              <div>
                <span style={{ color: textMuted }} className="text-[9px] uppercase tracking-widest block mb-1">Mensal</span>
                <span style={{ color: accent }} className="text-lg font-bold font-mono">+{formatBRL(portfolioTotals.totalMonthly)}</span>
              </div>
              <div>
                <span style={{ color: textMuted }} className="text-[9px] uppercase tracking-widest block mb-1">Anual</span>
                <span style={{ color: accent }} className="text-lg font-bold font-mono">+{formatBRL(portfolioTotals.totalYearly)}</span>
              </div>
            </div>

            <div className="h-20 w-full" style={{ marginBottom: '-10px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={portfolioTotals.curve} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" hide />
                  <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={settings.lineThickness} fill="url(#heroGrad)" isAnimationActive={false} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {projections.map((p) => {
          const displayBalance = p.showBoth ? p.pMonthNet : p.pMonthGross;
          const displayDaily = p.showBoth ? p.dailyLiquido : p.dailyBruto;
          const isExpanded = expandedId === p.id;

          const totalDays = p.monthEndDate - p.todayDate;
          const chartData = Array.from({ length: 15 }, (_, i) => {
            const dayOffset = Math.round((i / 14) * totalDays);
            return {
              day: p.todayDate + dayOffset,
              value: p.balance + (displayBalance - p.balance) * (i / 14),
            };
          });

          const yMin = Math.floor((p.balance - 5) / 10) * 10;
          const yMax = Math.ceil((displayBalance + 5) / 10) * 10;
          const yTicks: number[] = [];
          for (let v = yMin; v <= yMax; v += 10) yTicks.push(v);

          return (
            <div 
              key={p.id} 
              style={{ backgroundColor: cardBg }}
              className={'relative overflow-hidden rounded-[24px] border transition-all duration-300 ' + (isExpanded ? 'border-[var(--accent)]/60 shadow-[0_10px_40px_-10px_rgba(0,255,163,0.4)]' : 'border-[var(--accent)]/20 shadow-[0_10px_40px_-10px_rgba(0,255,163,0.1)]')}
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--accent)] opacity-[0.07] blur-[60px] rounded-full pointer-events-none"></div>

              <div className="relative z-10 p-5">
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1.5 shadow-lg overflow-hidden">
                      {getLogo(p.name) ? <img src={getLogo(p.name)!} alt={p.name} className="w-full h-full object-contain rounded-full" /> : <span className="text-xs">🏦</span>}
                    </div>
                    <div>
                      <span style={{ ...txtStyle(16, 1), color: textPrimary }} className="font-bold tracking-tight block leading-tight">{p.name}</span>
                      <span style={{ ...txtStyle(11, 0.6), color: textMuted }} className="font-mono tracking-wider">{formatBRL(p.baseBalance)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                      <span style={{ ...txtStyle(11, 0.6), color: textMuted }} className="font-bold tracking-wide">{p.rateStr}</span>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setModalMode('edit'); setSelectedAssetId(p.id); setModalOpen(true); }} className="hover:text-[var(--accent)] p-1" style={{ color: textMuted }}>⚙️</button>
                  </div>
                </div>

                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse"></span>
                    <span style={{ ...txtStyle(10, 0.5), color: textMuted }} className="uppercase tracking-[0.15em] font-bold">{p.showBoth ? 'Líquido / dia' : 'Rende / dia'}</span>
                  </div>
                  <div style={{ color: accent, fontSize: (isCustom ? (36 * settings.textSizeScale) + 'px' : '36px'), opacity: isCustom ? settings.textOpacity : 1 }} className="font-bold tracking-tighter leading-none">
                    +{formatBRL(displayDaily)}
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-white/5 pt-3">
                  <div>
                    <span style={{ ...txtStyle(9, 0.4), color: textMuted }} className="uppercase tracking-widest block mb-0.5">Hoje</span>
                    <span style={{ ...txtStyle(11, 0.6), color: textMuted }} className="font-medium font-mono">{formatBRL(p.balance)}</span>
                  </div>
                  <div className="text-right">
                    <span style={{ ...txtStyle(9, 0.4), color: textMuted }} className="uppercase tracking-widest block mb-0.5">{p.monthLabel}</span>
                    <span style={{ ...txtStyle(11, 0.6), color: textMuted }} className="font-medium font-mono">{formatBRL(displayBalance)}</span>
                  </div>
                </div>

                <button onClick={() => setExpandedId(isExpanded ? null : p.id)} className="w-full flex items-center justify-center mt-4 pt-3 border-t border-white/5 hover:text-[var(--accent)] transition-colors" style={{ color: textMuted }}>
                  <ChevronDown className={'w-4 h-4 transition-transform duration-300 ' + (isExpanded ? 'rotate-180' : '')} />
                </button>

                <div className={'overflow-hidden transition-all duration-500 ease-in-out ' + (isExpanded ? 'max-h-[800px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0')}>
                  <div className="pt-3 border-t border-white/5 space-y-3">
                    <div className={'rounded-xl border border-white/10 p-1 relative ' + settings.chartHeight} style={{ backgroundColor: accent + '10' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 5, bottom: 0 }}>
                          <defs>
                            <linearGradient id={'acc-' + p.id} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={accent} stopOpacity={0} />
                            </linearGradient>
                          </defs>

                          {settings.showAxes && (
                            <>
                              <CartesianGrid strokeDasharray="2 4" stroke={isCustom ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)"} vertical={false} />
                              <XAxis dataKey="day" tick={{ fill: isCustom ? 'rgba(255,255,255,0.2)' : '#64748b', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={20} />
                              <YAxis orientation="right" ticks={yTicks} domain={[yMin, yMax]} tick={{ fill: isCustom ? 'rgba(255,255,255,0.2)' : '#64748b', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(val) => (val / 1000).toFixed(2) + 'k'} width={40} />
                            </>
                          )}

                          <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={settings.lineThickness} fill={'url(#acc-' + p.id + ')'} isAnimationActive={false} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {settings.showProjections && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`rounded-lg p-2.5 ${isCustom ? 'bg-white/5 border-white/10 backdrop-blur-sm' : 'bg-[var(--bg-app)] border-[var(--border-card)]'} border`}>
                          <span style={{ ...txtStyle(8, 0.4), color: textMuted }} className="uppercase tracking-widest block mb-1">Lucro no mês</span>
                          <span style={{ ...txtStyle(11, 0.6), color: textMuted }} className="font-medium font-mono">+{formatBRL(p.profitMonth)}</span>
                        </div>
                        <div className={`rounded-lg p-2.5 ${isCustom ? 'bg-white/5 border-white/10 backdrop-blur-sm' : 'bg-[var(--bg-app)] border-[var(--border-card)]'} border`}>
                          <span style={{ ...txtStyle(8, 0.4), color: textMuted }} className="uppercase tracking-widest block mb-1">Projeção 1 ano</span>
                          <span style={{ ...txtStyle(11, 0.6), color: textMuted }} className="font-medium font-mono">+{formatBRL(p.profitYear)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <InvestmentPolicyModal isOpen={modalOpen} mode={modalMode} onClose={handleClose} onSave={handleSave} initialData={modalMode === 'edit' && selectedAssetId ? (() => {
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
          baseRateValue: t1.baseRateValue, bonusRateValue: t1.bonusRateValue,
          hasTier2: tiers.length > 1, tier2Limit: t1.upTo ? Number(t1.upTo) : 0,
          tier2BaseRate: t2.baseRateValue, tier2BonusRate: t2.bonusRateValue,
        };
      })() : undefined} />
    </>
  );
}
