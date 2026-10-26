import React, { useState } from 'react';
import Modal from '../ui/Modal';

export interface AddTransactionModalProps {
  onClose: () => void;
  onAdd: (data: any) => void;
  initialData?: any;
  language?: string;
}

export function AddTransactionModal({
  onClose,
  onAdd,
  initialData,
  language = 'pt-BR',
}: AddTransactionModalProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({
    label: initialData?.label || '',
    value: initialData?.value || 0,
    type: initialData?.type || 'out' as 'in' | 'out' | 'yield',
    categoria_primaria: initialData?.categoria_primaria || initialData?.category || 'Outros',
    date: initialData?.date ? (initialData.date.toDate ? initialData.date.toDate().toISOString().split('T')[0] : initialData.date) : new Date().toISOString().split('T')[0]
  });
  const [displayValue, setDisplayValue] = useState(initialData?.value ? (initialData.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '');

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numericValue = parseInt(rawValue || '0') / 100;
    setFormData({ ...formData, value: numericValue });
    setDisplayValue((numericValue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.label || formData.value <= 0) {
      alert(t('Preencha todos os campos corretamente.', 'Fill in all fields correctly.'));
      return;
    }
    onAdd(formData);
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={initialData ? t('Editar Transação', 'Edit Transaction') : t('Nova Transação', 'New Transaction')}
      closeLabel={t('Fechar', 'Close')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Descrição", "Description")}</label>
          <input
            type="text"
            required
            placeholder={t("Ex: Recebimento Pix", "Ex: Pix Receipt")}
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors sm:p-4"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Valor", "Value")}</label>
          <input
            type="text"
            required
            placeholder="R$ 0,00"
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors font-mono sm:p-4"
            value={displayValue}
            onChange={handleValueChange}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Data", "Date")}</label>
          <input
            type="date"
            required
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors sm:p-4"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[
              { id: 'in', label: t('Entrada', 'Income'), color: 'var(--trend-up)' },
              { id: 'out', label: t('Saída', 'Expense'), color: 'var(--trend-down)' },
              { id: 'yield', label: t('Rendimento', 'Yield'), color: 'var(--trend-yield)' }
            ].map((t_type, idx) => (
              <button
                key={`tx-type-opt-${t_type.id}-${idx}`}
                type="button"
                onClick={() => setFormData({ ...formData, type: t_type.id as any })}
                className={`rounded-xl border py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all sm:py-3 ${formData.type === t_type.id ? 'bg-[var(--text-primary)]/5 border-[var(--text-primary)]/20 text-[var(--text-primary)]' : 'bg-transparent border-[var(--border-card)] text-[var(--text-muted)]'}`}
                style={{ borderColor: formData.type === t_type.id ? t_type.color : undefined }}
              >
                {t_type.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Categoria", "Category")}</label>
          <select
            className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none transition-colors sm:p-4"
            value={formData.categoria_primaria}
            onChange={(e) => setFormData({ ...formData, categoria_primaria: e.target.value })}
          >
            <option value="Moradia">{t("Moradia", "Housing")}</option>
            <option value="Alimentação">{t("Alimentação", "Food")}</option>
            <option value="Energia">{t("Energia", "Energy")}</option>
            <option value="Água">{t("Água", "Water")}</option>
            <option value="Transporte">{t("Transporte", "Transport")}</option>
            <option value="Lazer">{t("Lazer", "Leisure")}</option>
            <option value="Investimentos">{t("Investimentos", "Investments")}</option>
            <option value="Outros">{t("Outros", "Others")}</option>
          </select>
        </div>

        <button
          type="submit"
          className="mt-4 w-full rounded-2xl bg-[var(--accent)] py-4 text-sm font-bold uppercase tracking-widest text-[var(--bg-app)] transition-all hover:bg-[var(--accent)]/80"
        >
          {initialData ? t('Salvar Alterações', 'Save Changes') : t('Confirmar Transação', 'Confirm Transaction')}
        </button>
      </form>
    </Modal>
  );
}

export default AddTransactionModal;
