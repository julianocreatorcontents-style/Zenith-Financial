import React from 'react';
import { Sparkles, Settings as SettingsIcon, CreditCard, Landmark, Car } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { Asset } from '../../types/app';
import { HomeInvestmentCard, SummaryCard } from './MetricCards';

export type DrawerPage = 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash';
export type NavigationTab = 'Início' | 'Carteira' | 'Investimentos' | 'IA' | 'Armazenamento';

export interface AllocationItem {
  name: string;
  value: number;
  color: string;
}

export interface AssetAllocationChartProps {
  id?: string;
  allocationData: AllocationItem[];
  chartFilterValue: { type: 'category' | 'asset' | null; value: string | null };
  setChartFilterValue: React.Dispatch<React.SetStateAction<{ type: 'category' | 'asset' | null; value: string | null }>>;
  opacity?: number;
  tooltipsEnabled?: boolean;
  privacyMode: boolean;
  onNavigateTab: (tab: NavigationTab) => void;
  openDrawer: (page?: DrawerPage) => void;
  metrics: {
    investments?: number;
  };
  investorProfile: 'Conservador' | 'Sofisticado' | 'Arrojado';
  portfolioAllocationPercent: number;
  assets: Asset[];
  onSelectAsset: (asset: Asset) => void;
  t: (pt: string, en: string) => string;
}

export const AssetAllocationChart: React.FC<AssetAllocationChartProps> = ({
  id = 'CHART_ALOC_ATIV',
  allocationData,
  chartFilterValue,
  setChartFilterValue,
  opacity = 1,
  tooltipsEnabled = true,
  privacyMode,
  onNavigateTab,
  openDrawer,
  metrics,
  investorProfile,
  portfolioAllocationPercent,
  assets,
  onSelectAsset,
  t,
}) => {
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
                      prev.value === data.name ? { type: null, value: null } : { type: 'asset', value: data.name ?? null }
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
          saldoTotal={Number(metrics.investments ?? 0)}
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
              value={(asset.currentValue ?? asset.manualBalance ?? asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).replace('R$', 'R$ ')} 
              icon={asset.type === 'liquidity' ? <CreditCard size={14}/> : asset.type === 'investment' ? <Landmark size={14}/> : <Car size={14}/>} 
              onClick={() => onSelectAsset(asset)} 
              privacy={privacyMode}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default AssetAllocationChart;
