import React from 'react';
import { BarChart as BarChartIcon } from 'lucide-react';

export interface ChartFilterCardProps {
  chartFilter?: { period: string; month: string; day: string };
  onChartFilterChange?: (filter: { period: string; month: string; day: string }) => void;
}

export const ChartFilterCard: React.FC<ChartFilterCardProps> = ({
  chartFilter,
  onChartFilterChange,
}) => {
  return (
    <div className="bg-[var(--bg-card)] rounded-[24px] p-4 space-y-3 border border-[var(--border-card)]">
      <div className="flex items-center gap-3">
        <BarChartIcon size={18} className="text-[var(--accent)]" />
        <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
          Filtro do Gráfico
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
            Período
          </label>
          <select
            value={chartFilter?.period || 'Meses'}
            onChange={(e) =>
              onChartFilterChange?.({
                period: e.target.value,
                month: chartFilter?.month || 'Atual',
                day: chartFilter?.day || 'Todos'
              })
            }
            className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer"
          >
            <option value="Semanas">Semanas</option>
            <option value="Meses">Meses</option>
            <option value="Anos">Anos</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
            Mês
          </label>
          <select
            value={chartFilter?.month || 'Atual'}
            onChange={(e) =>
              onChartFilterChange?.({
                period: chartFilter?.period || 'Meses',
                month: e.target.value,
                day: chartFilter?.day || 'Todos'
              })
            }
            className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer"
          >
            <option value="Atual">Atual</option>
            <option value="Janeiro">Janeiro</option>
            <option value="Fevereiro">Fevereiro</option>
            <option value="Março">Março</option>
            <option value="Abril">Abril</option>
            <option value="Maio">Maio</option>
            <option value="Junho">Junho</option>
            <option value="Julho">Julho</option>
            <option value="Agosto">Agosto</option>
            <option value="Setembro">Setembro</option>
            <option value="Outubro">Outubro</option>
            <option value="Novembro">Novembro</option>
            <option value="Dezembro">Dezembro</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
            Dia
          </label>
          <select
            value={chartFilter?.day || 'Todos'}
            onChange={(e) =>
              onChartFilterChange?.({
                period: chartFilter?.period || 'Meses',
                month: chartFilter?.month || 'Atual',
                day: e.target.value
              })
            }
            disabled={(chartFilter?.period || 'Meses') !== 'Meses'}
            className={`w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer ${
              (chartFilter?.period || 'Meses') !== 'Meses' ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          >
            <option value="Todos">Todos</option>
            <option>01-10</option>
            <option>11-20</option>
            <option>21-31</option>
          </select>
        </div>
      </div>
      <p className="text-[8px] text-[var(--text-muted)] leading-relaxed">
        O dia filtra apenas o período Mensal. Semanas e Anos usam o mês como âncora.
      </p>
    </div>
  );
};

export default ChartFilterCard;
