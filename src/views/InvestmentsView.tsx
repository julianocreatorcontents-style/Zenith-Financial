import React, { useState } from 'react';
import { Landmark, Sparkles } from 'lucide-react';
import { assetToInvestment } from '../lib/adapters/assetToInvestment';
import { TaxAlertService } from '../domain/tax/TaxAlertService';

export interface InvestmentsViewProps {
  assets: any[];
  investorProfile: string;
  onAssetClick: (asset: any) => void;
  onSeed?: () => void;
  language?: string;
}

export function InvestmentsView({
  assets,
  investorProfile,
  onAssetClick,
  onSeed,
  language,
}: InvestmentsViewProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [activeTab, setActiveTab] = useState<'Ativos' | 'Subcategorias' | 'Estratégias'>('Ativos');

  const filteredAssets = assets.filter((a: any) => a.type === 'investment');

  return (
    <div className="space-y-6 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-medium text-[var(--text-primary)]">{t("Investimentos", "Investments")}</h2>
          <p className="text-[var(--text-muted)] text-xs">{t(`Perfil: ${investorProfile}`, `Profile: ${investorProfile}`)}</p>
        </div>
        <div className="flex bg-[var(--bg-card)] p-1 rounded-xl border border-[var(--border-card)]">
          {['Ativos', 'Subcategorias', 'Estratégias'].map((tab: any) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)]'}`}
            >
              {t(tab, tab)}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'Ativos' && (
        <div className="grid grid-cols-1 gap-3">
          {filteredAssets.map((asset: any, idx: number) => {
            const inv = assetToInvestment(asset);
            const alerts = inv ? TaxAlertService.getAlertsForInvestment(inv) : [];
            const primaryAlert = alerts[0];

            return (
              <button 
                key={`asset-item-${asset.id}-${idx}`}
                onClick={() => onAssetClick(asset)}
                className="bg-[var(--bg-card)] border border-[var(--border-card)] p-4 rounded-[24px] flex items-center justify-between hover:border-[var(--accent)] transition-all group text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-app)] flex items-center justify-center text-[var(--accent)] group-hover:scale-110 transition-transform">
                    <Landmark size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">{asset.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">{asset.emissor || 'Zenith Core'}</p>
                      {primaryAlert && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full border border-[var(--accent)]/20">
                          {primaryAlert.type === 'IOF_ZERO' ? '🛡️ IOF' : '📉 IR'} · {primaryAlert.daysRemaining}d
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-bold text-[var(--text-primary)]">{(asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  <p className="text-[10px] text-[var(--accent)] font-bold">+1.2%</p>
                </div>
              </button>
            );
          })}
          {filteredAssets.length === 0 && (
            <div className="py-20 text-center border border-dashed border-[var(--border-card)] rounded-[40px] flex flex-col items-center gap-4">
              <p className="text-[var(--text-muted)] text-sm">{t("Nenhum investimento encontrado.", "No investments found.")}</p>
              {onSeed && (
                <button 
                  onClick={onSeed}
                  className="px-6 py-3 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
                >
                  {t("Gerar Carteira de Exemplo", "Generate Sample Portfolio")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Subcategorias' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-3 flex justify-between items-center shadow-lg">
            <span className="text-[10px] font-bold text-black uppercase tracking-widest">{t("Subcategoria", "Subcategory")}</span>
            <div className="flex gap-8">
              <span className="text-[10px] font-bold text-black uppercase tracking-widest">%</span>
              <span className="text-[10px] font-bold text-black uppercase tracking-widest">{t("Valor", "Value")}</span>
            </div>
          </div>
          <div className="space-y-2">
            {['Renda Fixa', 'Ações', 'FIIs', 'Cripto'].map((cat, idx) => {
              const catAssets = filteredAssets.filter((a: any) => a.subcategoria === cat);
              const total = catAssets.reduce((acc: number, a: any) => acc + (a.value ?? 0), 0);
              if (total === 0 && cat !== 'Renda Fixa') return null;
              return (
                <div key={`subcat-${cat}-${idx}`} className="bg-[var(--bg-card)] border-l-4 border-[var(--accent)] p-4 rounded-r-xl flex justify-between items-center border-y border-r border-[var(--border-card)]">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{cat}</span>
                  <div className="flex gap-8 items-center">
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">25%</span>
                    <span className="text-sm font-mono font-bold text-[var(--text-primary)]">{(total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'Estratégias' && (
        <div className="grid grid-cols-2 gap-4">
          {['Reserva', 'Aposentadoria', 'Viagem', 'Liberdade'].map((est, idx) => (
            <div key={`strat-${est}-${idx}`} className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] flex flex-col gap-4">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                <Sparkles size={20} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-[var(--text-primary)]">{est}</h4>
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">Estratégia</p>
              </div>
              <p className="text-lg font-mono font-bold text-[var(--text-primary)]">R$ 0,00</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default InvestmentsView;
