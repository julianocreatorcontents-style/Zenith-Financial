import { useMemo } from 'react';
import { YieldCalculator } from '../domain/yield/YieldCalculator';
import { IncomeTaxPolicy } from '../domain/tax/IncomeTaxPolicy';
import { IofPolicy } from '../domain/tax/IofPolicy';
import { assetToInvestment } from '../lib/adapters/assetToInvestment';
import type { RawAssetDoc } from '../lib/adapters/assetToInvestment';
import type { Investment } from '../domain/investment/Investment';
import type { YieldPolicy } from '../domain/yield/YieldPolicy';

interface YieldProjectionCardProps {
  assets?: RawAssetDoc[];
  cdiAnnualPercent?: number;
}

const DEMO: RawAssetDoc[] = [
  {
    id: 'demo-99pay',
    uid: 'demo',
    name: '99Pay',
    value: 5069.81,
    valorInvestido: 5000,
    createdAt: new Date('2026-01-15'),
    strategy: 'FIXED_INCOME_TIERED',
    investmentPolicy: {
      dayCountConvention: 'CALENDAR_DAYS_365',
      taxDisplayMode: 'GROSS',
      rateTiers: [
        { upTo: 5000, baseRateValue: 110, bonusRateValue: 29 },
        { upTo: null, baseRateValue: 80, bonusRateValue: 0 },
      ],
    },
  },
  {
    id: 'demo-mp-saldo',
    uid: 'demo',
    name: 'Mercado Pago · Saldo',
    value: 8985.72,
    valorInvestido: 8985.72,
    createdAt: new Date('2026-02-16'),
    strategy: 'FIXED_INCOME_TIERED',
    investmentPolicy: {
      dayCountConvention: 'BUSINESS_DAYS_252',
      taxDisplayMode: 'NET',
      rateTiers: [{ upTo: null, baseRateValue: 105, bonusRateValue: 0 }],
    },
  },
  {
    id: 'demo-mp-cofrinho',
    uid: 'demo',
    name: 'Mercado Pago · Cofrinho',
    value: 10078.64,
    valorInvestido: 10078.64,
    createdAt: new Date('2026-02-16'),
    strategy: 'FIXED_INCOME_TIERED',
    investmentPolicy: {
      dayCountConvention: 'BUSINESS_DAYS_252',
      taxDisplayMode: 'NET',
      rateTiers: [{ upTo: null, baseRateValue: 120, bonusRateValue: 0 }],
    },
  },
];

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getLogo = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('99pay')) return 'https://logo.clearbit.com/99pay.com.br';
  if (n.includes('mercado pago')) return 'https://logo.clearbit.com/mercadopago.com.br';
  return null;
};

function buildNetPolicy(policy: YieldPolicy, taxRate: number): YieldPolicy {
  return {
    ...policy,
    rateTiers: policy.rateTiers.map((t) => ({
      upTo: t.upTo,
      baseRateValue: t.baseRateValue * (1 - taxRate),
      bonusRateValue: t.bonusRateValue * (1 - taxRate),
    })),
  };
}

export function YieldProjectionCard({
  assets,
  cdiAnnualPercent = 13.65,
}: YieldProjectionCardProps) {
  const projections = useMemo(() => {
    const fromProps = (assets ?? [])
      .map(assetToInvestment)
      .filter((inv): inv is Investment => inv !== null);

    const source =
      fromProps.length > 0
        ? fromProps
        : DEMO.map(assetToInvestment).filter(
            (inv): inv is Investment => inv !== null,
          );

    const today = new Date();

    return source.map((inv) => {
      const days = inv.daysInvested(today);
      const grossDaily = YieldCalculator.dailyYieldTiered(
        inv.currentBalance,
        cdiAnnualPercent,
        inv.policy,
      );

      const daysInYear = inv.policy.dayCountConvention === 'CALENDAR_DAYS_365' ? 365 : 252;

      let irRate = 0;
      let iofRate = 0;
      let totalTax = 0;
      let futureIrRate = 0;
      
      if (inv.taxDisplayMode === 'NET' && days >= 1) {
        irRate = IncomeTaxPolicy.rateFor(days);
        iofRate = IofPolicy.rateFor(days);
        totalTax = Math.min(irRate + iofRate, 1);
        const futureDays = days + 365;
        futureIrRate = IncomeTaxPolicy.rateFor(futureDays);
      }

      const netDaily = totalTax > 0 ? grossDaily.multiply(1 - totalTax) : grossDaily;

      const p30Gross = YieldCalculator.projectTiered(
        inv.currentBalance, cdiAnnualPercent, inv.policy, 30
      );
      
      const p1YearGross = YieldCalculator.projectTiered(
        inv.currentBalance, cdiAnnualPercent, inv.policy, daysInYear
      );

      let p30Net = p30Gross;
      let p1YearNet = p1YearGross;
      
      if (totalTax > 0) {
        const netPolicyCurrent = buildNetPolicy(inv.policy, totalTax);
        p30Net = YieldCalculator.projectTiered(inv.currentBalance, cdiAnnualPercent, netPolicyCurrent, 30);
      }
      
      if (futureIrRate > 0) {
        const netPolicyFuture = buildNetPolicy(inv.policy, Math.min(futureIrRate, 1));
        p1YearNet = YieldCalculator.projectTiered(inv.currentBalance, cdiAnnualPercent, netPolicyFuture, daysInYear);
      }

      const showBoth = inv.taxDisplayMode === 'NET' && totalTax > 0;

      return {
        id: inv.id,
        name: inv.name,
        balance: inv.currentBalance.toBRL(),
        dailyBruto: grossDaily.toBRL(),
        dailyLiquido: netDaily.toBRL(),
        p30Gross: p30Gross.toBRL(),
        p30Net: p30Net.toBRL(),
        p1YearGross: p1YearGross.toBRL(),
        p1YearNet: p1YearNet.toBRL(),
        showBoth,
        irRate,
        iofRate,
        futureIrRate,
        days,
      };
    });
  }, [assets, cdiAnnualPercent]);

  if (projections.length === 0) {
    return (
      <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-5">
        <p className="text-sm text-[var(--text-muted)]">
          Nenhum investimento com política configurada.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Rendimento projetado
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-mono">
          CDI {cdiAnnualPercent.toFixed(2)}%
        </span>
      </div>

      <div className="space-y-3">
        {projections.map((p) => (
          <div
            key={p.id}
            className="bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3"
          >
            <div className="flex justify-between items-baseline mb-3">
              <div className="flex items-center gap-2">
                {getLogo(p.name) && (
                  <img src={getLogo(p.name)!} alt={p.name} className="w-5 h-5 rounded-full bg-white object-contain" />
                )}
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {p.name}
                </span>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {formatBRL(p.balance)}
              </span>
            </div>

            {p.showBoth ? (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    Bruto / dia
                  </span>
                  <div className="text-sm font-mono text-[var(--text-primary)]">
                    +{formatBRL(p.dailyBruto)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    Líquido / dia
                  </span>
                  <div className="text-base font-bold text-[var(--accent)] font-mono">
                    +{formatBRL(p.dailyLiquido)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-baseline mb-3">
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  Rende / dia
                </span>
                <span className="text-base font-bold text-[var(--accent)] font-mono">
                  +{formatBRL(p.dailyBruto)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-card)]">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  30 dias
                </span>
                {p.showBoth && (
                  <div className="text-[9px] text-[var(--text-muted)] font-mono">
                    bruto {formatBRL(p.p30Gross)}
                  </div>
                )}
                <div className="text-xs font-mono text-[var(--text-primary)]">
                  {formatBRL(p.showBoth ? p.p30Net : p.p30Gross)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  1 ano
                </span>
                {p.showBoth && (
                  <div className="text-[9px] text-[var(--text-muted)] font-mono">
                    bruto {formatBRL(p.p1YearGross)}
                  </div>
                )}
                <div className="text-xs font-mono text-[var(--text-primary)]">
                  {formatBRL(p.showBoth ? p.p1YearNet : p.p1YearGross)}
                </div>
              </div>
            </div>

            <p className="text-[9px] text-[var(--text-muted)] mt-2 italic">
              {p.showBoth
                ? `IR atual ${(p.irRate * 100).toFixed(1)}% · IR em 1 ano ${(p.futureIrRate * 100).toFixed(1)}%`
                : `Bruto · IR retido apenas no resgate · ${p.days} dias`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
