import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp } from 'lucide-react';

export interface HomeInvestmentCardProps {
  saldoTotal: number;
  perfilAtual: string;
  privacyMode: boolean;
  allocatedPercent: number | string;
  onClick?: () => void;
}

export const HomeInvestmentCard: React.FC<HomeInvestmentCardProps> = ({
  saldoTotal,
  perfilAtual,
  privacyMode,
  allocatedPercent,
  onClick
}) => {
  const allocation = Math.max(0, Math.min(100, Number(allocatedPercent) || 0));
  
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-6 rounded-[32px] flex flex-col gap-4 relative overflow-hidden group cursor-pointer"
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">Meus Investimentos</p>
          <h4 className="text-2xl font-mono font-bold text-[var(--text-primary)] tracking-tighter mt-1">
            {privacyMode ? '••••••' : (saldoTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h4>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
          <TrendingUp size={20} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Foco: {perfilAtual}</span>
          <span className="text-[10px] text-[var(--accent)] font-bold">{allocation}% do patrimônio</span>
        </div>
        <div className="h-2 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${allocation}%` }}
            className="h-full bg-[var(--accent)]"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default HomeInvestmentCard;
