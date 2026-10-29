import React, { useState, useMemo } from 'react';
import { Target, TrendingUp, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { calculateGoalProjection } from '../../lib/finance';

interface GoalsHeroCardProps {
  currentNetWorth: number;
  transactions: any[];
  monthlyYield: number;
  target?: number;
  privacy: boolean;
}

const FMT = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const FMT0 = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

export const GoalsHeroCard: React.FC<GoalsHeroCardProps> = ({
  currentNetWorth,
  transactions,
  monthlyYield,
  target = 100000,
  privacy,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const { saldoBase, fluxoRecorrenteLiquido, monthsToGoal } = useMemo(() => {
    return calculateGoalProjection(currentNetWorth, transactions, monthlyYield, target);
  }, [currentNetWorth, transactions, monthlyYield, target]);

  const percent = Math.min(100, Math.max(0, (saldoBase / target) * 100));

  return (
    <section className="bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-app)] border border-[var(--border-card)] rounded-[32px] p-6 shadow-2xl relative overflow-hidden mt-4">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 blur-3xl rounded-full pointer-events-none" />

      <div className="flex justify-between items-start mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--accent)]/10 rounded-2xl border border-[var(--accent)]/20">
            <Target className="text-[var(--accent)]" size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Meta Ativa</p>
            <h3 className="text-lg font-bold">Liberdade Financeira</h3>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-mono font-bold text-[var(--accent)]">{percent.toFixed(1)}%</span>
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between text-[11px] font-bold tracking-wider mb-2">
          <span className="text-[var(--text-primary)]">{privacy ? '••••••' : FMT(saldoBase)}</span>
          <span className="text-[var(--text-muted)]">Meta: {FMT0(target)}</span>
        </div>
        <div className="h-3 w-full bg-[var(--bg-app)]/50 rounded-full overflow-hidden mb-6 border border-[var(--border-card)]/50">
          <div className="h-full bg-[var(--accent)] shadow-[0_0_15px_rgba(34,197,94,0.6)] transition-all duration-700 ease-out" style={{ width: `${percent}%` }} />
        </div>

        <div className="bg-[var(--bg-app)]/80 backdrop-blur-md rounded-2xl p-5 border border-[var(--border-card)]/50">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mb-1">Previsão</p>
              <h2 className="text-4xl font-mono font-bold flex items-baseline gap-1">
                {monthsToGoal === 0 ? 'Atingida!' : monthsToGoal === Infinity ? '∞' : monthsToGoal}
                {monthsToGoal > 0 && monthsToGoal !== Infinity && <span className="text-sm text-[var(--text-muted)] font-sans">meses</span>}
              </h2>
            </div>
            <div className="bg-[var(--accent)]/10 px-3 py-1.5 rounded-xl border border-[var(--accent)]/20 text-right">
               <p className="text-[9px] text-[var(--text-muted)] uppercase font-bold">Fluxo Mensal</p>
               <p className="text-sm font-mono font-bold text-[var(--accent)]">{privacy ? '•••' : '+' + FMT(fluxoRecorrenteLiquido)}</p>
            </div>
          </div>

          {monthsToGoal === Infinity && (
            <div className="mt-4 flex items-start gap-2 text-[10px] bg-red-500/10 border border-red-500/20 rounded-xl p-2.5">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <p className="text-red-300 font-medium">Fluxo atual insuficiente. A meta não será atingida sem aportes extras.</p>
            </div>
          )}
        </div>
      </div>

      <button onClick={() => setShowDetails(!showDetails)} className="w-full mt-5 flex items-center justify-center gap-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest hover:text-[var(--accent)] transition-colors">
        {showDetails ? 'Ocultar cálculo' : 'Entender o cálculo'}
        {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showDetails && (
        <div className="mt-3 p-4 bg-[var(--bg-app)] rounded-2xl border border-[var(--border-card)] text-[10px] font-mono space-y-1.5 animate-in fade-in">
           <p className="text-[var(--text-muted)] font-sans font-bold uppercase tracking-widest mb-2">1. Saldo Base</p>
           <div className="flex justify-between text-[var(--text-secondary)]"><span>Patrimônio Atual</span><span>{FMT(currentNetWorth)}</span></div>
           <p className="text-[9px] text-[var(--text-muted)] italic mb-3 font-sans">O saldo base é ajustado pelas transações únicas (entradas e saídas) registradas no mês.</p>
           
           <p className="text-[var(--text-muted)] font-sans font-bold uppercase tracking-widest mb-2 mt-3 pt-2 border-t border-[var(--border-card)]">2. Fluxo Recorrente</p>
           <div className="flex justify-between text-[var(--text-secondary)]"><span>+ Rendimentos Mês</span><span className="text-[var(--trend-up)]">{FMT(monthlyYield)}</span></div>
           <div className="flex justify-between text-[var(--text-secondary)]"><span>+ Entradas fixas</span><span className="text-[var(--trend-up)]">Incluídas</span></div>
           <div className="flex justify-between text-[var(--text-secondary)]"><span>- Saídas fixas</span><span className="text-[var(--trend-down)]">Incluídas</span></div>
           <div className="flex justify-between pt-1 border-t border-[var(--border-card)] font-bold text-[11px] mt-2">
             <span>Fluxo Líquido</span><span className="text-[var(--accent)]">{FMT(fluxoRecorrenteLiquido)}</span>
           </div>
           <p className="text-[9px] text-[var(--text-muted)] italic mt-3 font-sans">A projeção aplica juros compostos sobre o saldo crescente e soma o fluxo mês a mês, respeitando a duração de cada lançamento.</p>
        </div>
      )}
    </section>
  );
};
