import React, { useState } from 'react';
import { motion } from 'motion/react';
import type { FinancialGoalTargets } from '../../lib/finance';
import { resolveGoalTargets } from '../../lib/finance';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const formatBRL = (value: number) => BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);

export interface GoalItem {
  name: string;
  current: number;
  target: number;
  percent: number;
  color: string;
}

export interface GoalsProgressChartProps {
  id?: string;
  goals: GoalItem[];
  resolvedGoalTargets: FinancialGoalTargets;
  onSaveGoalTargets?: (goals: FinancialGoalTargets) => Promise<void> | void;
  opacity?: number;
  t: (pt: string, en: string) => string;
}

export const GoalsProgressChart: React.FC<GoalsProgressChartProps> = ({
  id = 'CHART_METAS_PROG',
  goals,
  resolvedGoalTargets,
  onSaveGoalTargets,
  opacity = 1,
  t,
}) => {
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState({
    emergencyReserve: String(resolvedGoalTargets.emergencyReserve),
    financialFreedom: String(resolvedGoalTargets.financialFreedom),
  });

  const startEditingGoals = () => {
    setGoalDraft({
      emergencyReserve: String(resolvedGoalTargets.emergencyReserve),
      financialFreedom: String(resolvedGoalTargets.financialFreedom),
    });
    setIsEditingGoals(true);
  };

  const handleSaveGoals = async () => {
    const next = resolveGoalTargets({
      emergencyReserve: Number(goalDraft.emergencyReserve),
      financialFreedom: Number(goalDraft.financialFreedom),
    });
    await onSaveGoalTargets?.(next);
    setIsEditingGoals(false);
  };

  return (
    <section key={id} className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[32px] p-6">
      <div className="flex justify-between items-center mb-6">
        <span className="text-xs font-medium text-[var(--text-muted)]">{t("Metas Financeiras", "Financial Goals")}</span>
        <button
          onClick={() => (isEditingGoals ? setIsEditingGoals(false) : startEditingGoals())}
          className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest"
        >
          {isEditingGoals ? t("Cancelar", "Cancel") : t("Editar Metas", "Edit Goals")}
        </button>
      </div>
      {isEditingGoals && (
        <div className="space-y-3 mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {t("Reserva de Emergência (R$)", "Emergency Reserve (R$)")}
            <input
              type="number"
              min="1"
              step="100"
              value={goalDraft.emergencyReserve}
              onChange={(e) => setGoalDraft(prev => ({ ...prev, emergencyReserve: e.target.value }))}
              className="mt-2 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {t("Liberdade Financeira (R$)", "Financial Freedom (R$)")}
            <input
              type="number"
              min="1"
              step="1000"
              value={goalDraft.financialFreedom}
              onChange={(e) => setGoalDraft(prev => ({ ...prev, financialFreedom: e.target.value }))}
              className="mt-2 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            onClick={handleSaveGoals}
            className="w-full py-3 bg-[var(--accent)] text-[var(--bg-app)] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors"
          >
            {t("Salvar Metas", "Save Goals")}
          </button>
        </div>
      )}
      <div className="space-y-6">
        {goals.map((goal, idx) => (
          <div key={`goal-${goal.name}-${idx}`} className="space-y-2">
            <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest">
              <span className="text-[var(--text-primary)]">{goal.name}</span>
              <span style={{ color: goal.color }}>{goal.percent}% · {formatBRL(goal.target)}</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${goal.percent}%` }}
                className="h-full"
                style={{ backgroundColor: goal.color, opacity: opacity }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default GoalsProgressChart;
