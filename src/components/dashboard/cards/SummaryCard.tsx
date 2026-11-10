import React from 'react';
import { MoreVertical } from 'lucide-react';

export interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  onClick?: () => void;
  privacy?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, onClick, privacy }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border-card)] p-4 rounded-[24px] flex flex-col items-start gap-2 active:scale-95 transition-transform hover:border-[var(--text-muted)] relative overflow-hidden group w-full"
    >
      <div className="flex justify-between w-full items-start">
        <div className="text-[var(--text-secondary)]">{icon}</div>
        <MoreVertical size={12} className="text-[var(--text-muted)]" />
      </div>
      <div className="text-left z-10">
        <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-tight mb-0.5">{label}</p>
        <p className="text-[14px] font-mono font-bold text-[var(--text-primary)] tracking-tighter">
          {privacy ? '•••' : value}
        </p>
      </div>
    </button>
  );
};

export default SummaryCard;
