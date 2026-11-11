import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const formatBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

export type DrawerPage = 'menu' | 'profile' | 'notifications' | 'settings' | 'ai_key' | 'trash';

export interface CashFlowPoint {
  name: string;
  value: number;
  isPredicted?: boolean;
}

export interface CashFlowChartProps {
  id?: string;
  cashFlowData: CashFlowPoint[];
  mainColor?: string;
  opacity?: number;
  tooltipsEnabled?: boolean;
  showValues?: boolean;
  privacyMode?: boolean;
  openDrawer: (page?: DrawerPage) => void;
  t: (pt: string, en: string) => string;
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  id = 'CHART_FLUXO_CAIXA',
  cashFlowData,
  mainColor = 'var(--accent)',
  opacity = 1,
  tooltipsEnabled = true,
  showValues = true,
  privacyMode = false,
  openDrawer,
  t,
}) => {
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
              hide={!showValues}
              tickFormatter={(value) => (privacyMode ? '••••' : formatBRL(Number(value)))}
            />
            {tooltipsEnabled && (
              <Tooltip formatter={(value) => (privacyMode ? '••••' : formatBRL(Number(value)))} />
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
};

export default CashFlowChart;
