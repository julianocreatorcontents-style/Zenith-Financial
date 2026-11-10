import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, X } from 'lucide-react';
import Card from '../../ui/Card';
import type { DDA } from '../../../types/app';

export interface DDASuggestionProps {
  dda: DDA;
  onAccept: (dda: DDA) => void;
  onReject: (dda: DDA) => void;
  privacy: boolean;
  language: string;
}

export const DDASuggestion: React.FC<DDASuggestionProps> = ({ dda, onAccept, onReject, privacy, language }) => {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
    >
      <Card className="rounded-2xl p-4 flex items-center justify-between gap-4 overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest">{t("Sugestão DDA", "DDA Suggestion")}</p>
            <h4 className="text-sm font-medium text-[var(--text-primary)]">{dda.beneficiary}</h4>
            <p className="text-[10px] text-[var(--text-muted)]">
              {privacy ? '••••••' : (dda.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} •
              {t("Vencimento", "Due Date")}: {dda.dueDate?.toDate ? dda.dueDate.toDate().toLocaleDateString('pt-BR') : 'Hoje'} •
              CPF: {dda.cpf || t('Não informado', 'Not provided')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onReject(dda)}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
          >
            <X size={18} />
          </button>
          <button
            type="button"
            onClick={() => onAccept(dda)}
            className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-app)] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)]/80 transition-colors active:scale-95"
          >
            {t("Aceitar", "Accept")}
          </button>
        </div>
      </Card>
    </motion.div>
  );
};

export default DDASuggestion;
