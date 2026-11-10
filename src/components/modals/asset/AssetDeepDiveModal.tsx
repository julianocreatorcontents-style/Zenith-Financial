import React from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, ShieldCheck } from 'lucide-react';
import { calculateRealProfitability } from '../../../lib/finance';
import { resolveAssetPolicy } from '../../../lib/adapters/assetYieldService';
import type { Asset } from '../../../types/app';

export interface AssetDeepDiveModalProps {
  asset: Asset;
  onClose: () => void;
  language?: string;
}

export function AssetDeepDiveModal({ asset, onClose, language }: AssetDeepDiveModalProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const extraData = asset as unknown as Record<string, unknown>;
  const currentValue = Number(asset.currentValue ?? asset.value ?? 0) || 0;
  const dailyYield = Number(asset.dailyYield ?? 0) || 0;
  const businessDays = resolveAssetPolicy(asset)?.policy.dayCountConvention === 'BUSINESS_DAYS_252';
  const annualDays = businessDays ? 252 : 365;
  const nominalRate = currentValue > 0 ? (dailyYield * annualDays * 100) / currentValue : 0;
  const inflationRate = Number(extraData.taxaInflacao ?? 4.5) || 4.5;
  const realProfitability = calculateRealProfitability(nominalRate, inflationRate);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-[#121212] border-t border-[var(--border-card)] rounded-t-[40px] p-8 pb-12 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="w-12 h-1.5 bg-[var(--border-card)] rounded-full mx-auto mb-8" />
        
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{asset.name}</h2>
            <p className="text-white/40 text-sm">{(extraData.emissor as string) || 'Zenith Core'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          {((asset.accumulatedYield && asset.accumulatedYield > 0) || (asset.dailyYield && asset.dailyYield > 0) || asset.originalValue) && (
            <div className="grid grid-cols-2 gap-3 rounded-3xl bg-white/5 border border-white/10 p-5">
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t('Aporte Original', 'Initial Deposit')}</p>
                <p className="text-lg font-mono font-bold text-white">
                  {((asset.originalValue ?? asset.valorInvestido ?? asset.value) ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t('Saldo Atual', 'Current Balance')}</p>
                <p className="text-lg font-mono font-bold text-[var(--accent)]">
                  {(asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t('Rendimento Acumulado', 'Accumulated Yield')}</p>
                <p className="text-sm font-mono font-bold text-[var(--accent)]">
                  +{((asset.accumulatedYield ?? 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({asset.yieldPercent ? `+${asset.yieldPercent.toFixed(2)}%` : '+0.00%'})
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t('Rendimento Diário', 'Daily Yield')}</p>
                <p className="text-sm font-mono font-bold text-white">
                  +{(asset.dailyYield ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia
                </p>
              </div>
            </div>
          )}

          <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 p-6 rounded-[32px] flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest mb-1">{t('Rentabilidade Real', 'Real Profitability')}</p>
              <h4 className="text-2xl font-mono font-bold text-white">{(realProfitability * 100).toFixed(2)}% <span className="text-sm">a.a</span></h4>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)]">
              <ShieldCheck size={24} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--accent)]" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Insights Zenith IA</span>
            </div>
            <div className="bg-white/5 p-6 rounded-[32px] border border-white/10">
              <p className="text-sm text-white/70 leading-relaxed">
                {t(
                  `Com base no seu perfil ${extraData.subcategoria === 'Renda Fixa' ? 'Conservador' : 'Estratégico'}, este ativo mantém seu poder de compra acima da inflação estimada em ${extraData.taxaInflacao || 4.5}%. Recomendamos manter a posição para o longo prazo.`,
                  `Based on your ${extraData.subcategoria === 'Renda Fixa' ? 'Conservative' : 'Strategic'} profile, this asset maintains your purchasing power above the estimated inflation of ${extraData.taxaInflacao || 4.5}%. We recommend holding the position for the long term.`
                )}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default AssetDeepDiveModal;
