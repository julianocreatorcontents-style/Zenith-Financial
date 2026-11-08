import React from 'react';
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import type { ChartSlot } from '../../types/app';

export interface DashboardSlotConfigItemProps {
  id: string;
  item: ChartSlot;
  isMetric: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleVisibility: () => void;
  onUpdateConfig: (updates: Partial<ChartSlot>) => void;
}

export const DashboardSlotConfigItem: React.FC<DashboardSlotConfigItemProps> = ({
  id,
  item,
  isMetric,
  isExpanded,
  onToggleExpand,
  onToggleVisibility,
  onUpdateConfig,
}) => {
  const isDisabled = !item.visible;

  return (
    <Reorder.Item
      key={id}
      value={id}
      className={`bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] transition-all ${
        isExpanded ? 'border-[var(--accent)]/30 bg-[var(--bg-card-hover)]' : ''
      }`}
    >
      <div className={`flex items-center justify-between p-3 ${isDisabled ? 'opacity-40' : ''}`}>
        <div className="flex items-center gap-3 flex-1">
          <div className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
            <GripVertical size={16} />
          </div>
          <div
            className="flex-1 cursor-pointer"
            onClick={() => !isDisabled && onToggleExpand()}
          >
            <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
              {item.label}
              {isMetric && (
                <span className="text-[8px] bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded uppercase tracking-tighter">
                  Métrica
                </span>
              )}
              {!isDisabled && (isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </p>
          </div>
        </div>
        <button
          onClick={onToggleVisibility}
          className={`w-10 h-5 rounded-full transition-all relative ${
            item.visible ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-hover)]'
          }`}
        >
          <div
            className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
              item.visible ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && !isDisabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-5 pt-2 border-t border-[var(--border-card)] space-y-5"
          >
            {/* Estilo & Visual */}
            <div className="space-y-3">
              <p className="text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest">
                Estilo & Visual
              </p>
              {!isMetric && (
                <div className="grid grid-cols-5 gap-1">
                  {(['Candles', 'Linha', 'Área', 'Barra', 'Coluna'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => onUpdateConfig({ visualType: type })}
                      className={`py-1.5 rounded-lg text-[8px] font-bold transition-all ${
                        item.visualType === type
                          ? 'bg-[var(--accent)] text-[var(--bg-app)]'
                          : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={item.color || '#00FFA3'}
                  onChange={(e) => onUpdateConfig({ color: e.target.value })}
                  className="w-6 h-6 rounded bg-transparent border-none cursor-pointer"
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={item.opacity ?? 100}
                  onChange={(e) => onUpdateConfig({ opacity: parseInt(e.target.value, 10) })}
                  className="flex-1 h-1 bg-[var(--bg-card-hover)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
                />
                <span className="text-[9px] font-mono text-[var(--text-muted)]">{item.opacity ?? 100}%</span>
              </div>
            </div>

            {/* Tempo & Filtros */}
            <div className="space-y-3">
              <p className="text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest">
                Tempo & Filtros
              </p>
              <div className="flex gap-2">
                <div className="flex bg-[var(--bg-card)] rounded-xl p-1 flex-1">
                  {(['Ano', 'Mês', 'Dia'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => onUpdateConfig({ granularity: g })}
                      className={`flex-1 py-1 rounded-lg text-[8px] font-bold transition-all ${
                        item.granularity === g
                          ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]/50'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <select
                  value={item.timeframe || '30D'}
                  onChange={(e) => onUpdateConfig({ timeframe: e.target.value as ChartSlot['timeframe'] })}
                  className="bg-[var(--bg-card)] border-none rounded-xl text-[8px] font-bold px-2 outline-none cursor-pointer text-[var(--text-muted)]"
                >
                  {(['7D', '15D', '30D', '6M', '1A'] as const).map(tf => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* IA & Sync */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest">
                  IA & Sincronização
                </p>
                <button className="text-[var(--text-muted)] hover:text-[var(--accent)]">
                  <MoreVertical size={12} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateConfig({ predictiveInsights: !item.predictiveInsights })}
                  className={`flex items-center justify-center gap-2 p-2 rounded-xl border transition-all ${
                    item.predictiveInsights
                      ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5 text-[var(--accent)]'
                      : 'border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-muted)]'
                  }`}
                >
                  <Sparkles size={12} />
                  <span className="text-[8px] font-bold uppercase">IA Insights</span>
                </button>
                <button className="flex items-center justify-center gap-2 p-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] transition-all">
                  <RefreshCw size={12} />
                  <span className="text-[8px] font-bold uppercase">Sync</span>
                </button>
              </div>
            </div>

            {/* Projeção Patrimonial Dedicada */}
            {id === 'CHART_EVOL_PATRIMONIO' && (
              <div className="space-y-3 pt-3 border-t border-[var(--border-card)]">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[var(--accent)]" />
                  <p className="text-[9px] text-[var(--accent)] uppercase font-black tracking-widest">
                    Filtros da Projeção Patrimonial
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Ano Alvo</label>
                    <select
                      value={item.projectionTargetYear ?? new Date().getFullYear() + 1}
                      onChange={(e) => onUpdateConfig({ projectionTargetYear: Number(e.target.value) })}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer"
                    >
                      {[2026, 2027, 2028, 2029, 2030, 2031, 2032].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Mês Alvo</label>
                    <select
                      value={item.projectionTargetMonth ?? 11}
                      onChange={(e) => onUpdateConfig({ projectionTargetMonth: Number(e.target.value) })}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-2 text-[10px] text-[var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value={11}>Dezembro (Fim do ano)</option>
                      <option value={0}>Janeiro</option>
                      <option value={1}>Fevereiro</option>
                      <option value={2}>Março</option>
                      <option value={3}>Abril</option>
                      <option value={4}>Maio</option>
                      <option value={5}>Junho</option>
                      <option value={6}>Julho</option>
                      <option value={7}>Agosto</option>
                      <option value={8}>Setembro</option>
                      <option value={9}>Outubro</option>
                      <option value={10}>Novembro</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)]">
                  <div className="pr-2">
                    <p className="text-[9px] font-bold text-[var(--text-primary)]">Fluxo de Caixa Previsto</p>
                    <p className="text-[8px] text-[var(--text-muted)] leading-tight">
                      Soma entradas/saídas agendadas e média histórica recente ao rendimento dos investimentos
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({ projectionIncludeCashFlow: item.projectionIncludeCashFlow === false ? true : false })}
                    className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${item.projectionIncludeCashFlow !== false ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-hover)]'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${item.projectionIncludeCashFlow !== false ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                {/* Modo de Visualização */}
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Modo de Visualização</label>
                  <div className="flex rounded-xl border border-[var(--border-card)] bg-[var(--bg-app)] p-0.5">
                    <button
                      onClick={() => onUpdateConfig({ evolutionViewMode: 'historico' })}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${(item.evolutionViewMode ?? 'historico') === 'historico' ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      Histórico
                    </button>
                    <button
                      onClick={() => onUpdateConfig({ evolutionViewMode: 'projecao' })}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${item.evolutionViewMode === 'projecao' ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      Projeção
                    </button>
                  </div>
                </div>

                {/* Líquido / Bruto */}
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Exibição de Impostos</label>
                  <div className="flex rounded-xl border border-[var(--border-card)] bg-[var(--bg-app)] p-0.5">
                    <button
                      onClick={() => onUpdateConfig({ projectionTaxMode: 'liquido' })}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${(item.projectionTaxMode ?? 'liquido') === 'liquido' ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      Líquido
                    </button>
                    <button
                      onClick={() => onUpdateConfig({ projectionTaxMode: 'bruto' })}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${item.projectionTaxMode === 'bruto' ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      Bruto
                    </button>
                  </div>
                </div>

                {/* Aporte Mensal */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)]">
                  <div className="pr-2">
                    <p className="text-[9px] font-bold text-[var(--text-primary)]">Aporte Mensal Recorrente</p>
                    <p className="text-[8px] text-[var(--text-muted)] leading-tight">
                      Simula aportes fixos mensais na projeção patrimonial
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl px-2 py-1.5 shrink-0">
                    <span className="text-[9px] text-[var(--text-muted)]">R$</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={item.monthlyContribution || ''}
                      onChange={(e) => onUpdateConfig({ monthlyContribution: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="0"
                      className="w-20 bg-transparent text-[10px] font-mono font-bold text-[var(--text-primary)] text-right outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
};

export default DashboardSlotConfigItem;
