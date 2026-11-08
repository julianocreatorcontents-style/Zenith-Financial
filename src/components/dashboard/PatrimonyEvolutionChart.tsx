import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { NetWorthProjectionPoint } from '../../lib/adapters/netWorthProjection';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const formatBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

export interface EvolutionChartPoint {
  name: string;
  value: number | null;
  date?: string;
  predicted?: number;
  projected?: boolean;
  valueNet?: number;
  contributedTotal?: number;
}

export interface PatrimonyEvolutionChartProps {
  id?: string;
  evolutionView: 'historico' | 'projecao';
  projectionTaxMode: 'liquido' | 'bruto';
  computedProjectionData: NetWorthProjectionPoint[];
  chartData: EvolutionChartPoint[];
  visualType?: 'Candles' | 'Linha' | 'Área' | 'Barra' | 'Coluna' | string;
  mainColor?: string;
  opacity?: number;
  isGradient?: boolean;
  tooltipsEnabled?: boolean;
  predictiveEnabled?: boolean;
  showValues?: boolean;
  privacyMode: boolean;
  t: (pt: string, en: string) => string;
}

export const PatrimonyEvolutionChart: React.FC<PatrimonyEvolutionChartProps> = ({
  id = 'CHART_EVOL_PATRIMONIO',
  evolutionView,
  projectionTaxMode,
  computedProjectionData,
  chartData,
  visualType = 'Área',
  mainColor = 'var(--accent)',
  opacity = 1,
  isGradient = true,
  tooltipsEnabled = true,
  predictiveEnabled = false,
  showValues = true,
  privacyMode,
  t,
}) => {
  const isProjection = evolutionView === 'projecao';
  const evolutionData = (isProjection ? computedProjectionData : chartData) as unknown as Array<Record<string, unknown>>;
  const activeDataKey = isProjection && projectionTaxMode === 'liquido' ? 'valueNet' : 'value';
  const comparisonDataKey = isProjection
    ? (projectionTaxMode === 'liquido' ? 'value' : 'valueNet')
    : null;

  return (
    <div key={id} className="h-48 w-full mt-2 overflow-hidden relative">
      <ResponsiveContainer width="100%" height="100%">
        {visualType === 'Linha' || visualType === 'Área' ? (
          <AreaChart 
            data={evolutionData} 
            margin={{ top: 10, right: 0, left: 10, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border-card)" strokeDasharray="3 3" opacity={0.3} />
            <defs>
              <linearGradient id={`color-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={mainColor} stopOpacity={isGradient ? 0.3 * opacity : 0} />
                <stop offset="95%" stopColor={mainColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" hide />
            <YAxis 
              orientation="right" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'var(--text-primary)', fontSize: 8, opacity: 0.6 }} 
              hide={!showValues}
              tickFormatter={(value) => formatBRL(Number(value))}
            />
            {tooltipsEnabled && (
              <Tooltip 
                cursor={{ stroke: mainColor, strokeWidth: 1, strokeDasharray: '5 5' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as EvolutionChartPoint & NetWorthProjectionPoint;
                    const pointValue = isProjection && projectionTaxMode === 'liquido'
                      ? (data.valueNet ?? data.value ?? 0)
                      : (data.value ?? data.predicted ?? 0);
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
                        <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1">{data.date}</p>
                        <p className="text-base font-mono font-bold text-[var(--text-primary)]">
                          {privacyMode ? '••••••' : pointValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        {isProjection && data.projected && (
                          <div className="mt-2 space-y-1">
                            {projectionTaxMode === 'liquido' && data.valueNet !== undefined && data.value !== data.valueNet && (
                              <p className="text-[9px] text-[var(--text-muted)] font-mono">
                                {t('Bruto:', 'Gross:')} {privacyMode ? '••••••' : Number(data.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            )}
                            {projectionTaxMode === 'bruto' && data.valueNet !== undefined && data.value !== data.valueNet && (
                              <p className="text-[9px] text-[var(--text-muted)] font-mono">
                                {t('Líquido est.:', 'Est. net:')} {privacyMode ? '••••••' : Number(data.valueNet).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            )}
                            <p className="text-[8px] text-[var(--accent)] font-bold italic">
                              ✨ {projectionTaxMode === 'liquido'
                                ? t('Projeção líquida (com IR regressivo e IOF)', 'Net projection (with regressive IR & IOF)')
                                : t('Projeção bruta pelas taxas dos investimentos', 'Gross projection based on investment rates')}
                            </p>
                            {typeof data.contributedTotal === 'number' && data.contributedTotal > 0 && (
                              <p className="text-[9px] text-[var(--text-muted)] font-mono">
                                {t('Aportes acumulados:', 'Cumulative contributions:')} {privacyMode ? '••••••' : Number(data.contributedTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            )}
                          </div>
                        )}
                        {!isProjection && predictiveEnabled && data.predicted != null && (
                          <p className="mt-2 text-[8px] text-[var(--accent)] font-bold italic">
                            ✨ {t('Projeção baseada na tendência recente', 'Projection based on recent trend')}
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
            )}
            {comparisonDataKey && (
              <Area 
                type="monotone" 
                dataKey={comparisonDataKey} 
                stroke={mainColor} 
                strokeWidth={1.5}
                strokeDasharray="3 3"
                fill="transparent" 
                dot={false}
                isAnimationActive={false}
                opacity={0.4}
              />
            )}
            <Area 
              type="monotone" 
              dataKey={activeDataKey} 
              stroke={mainColor} 
              strokeWidth={visualType === 'Linha' ? 2 : 3}
              fillOpacity={visualType === 'Linha' ? 0 : opacity} 
              fill={`url(#color-${id})`} 
              activeDot={{ r: 5, fill: mainColor, stroke: 'var(--bg-app)', strokeWidth: 2 }}
              dot={false}
            />
            {predictiveEnabled && !isProjection && (
              <Area 
                type="monotone" 
                dataKey="predicted" 
                stroke={mainColor} 
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="transparent"
                dot={false}
              />
            )}
          </AreaChart>
        ) : (
          <BarChart data={evolutionData}>
            <XAxis dataKey="name" hide />
            <Tooltip />
            <Bar dataKey={activeDataKey} fill={mainColor} fillOpacity={opacity} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default PatrimonyEvolutionChart;
