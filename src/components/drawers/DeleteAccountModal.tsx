import React, { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface DeleteAccountModalProps {
  language?: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteAccountModal({
  language,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteAccountModalProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const CONFIRMATION_WORD = t('EXCLUIR', 'DELETE');
  const [typed, setTyped] = useState('');

  const isConfirmed = typed === CONFIRMATION_WORD;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm mx-4 mb-4 sm:mb-0 bg-[var(--bg-card)] border border-[var(--destructive)]/30 rounded-[32px] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="w-12 h-12 bg-[var(--destructive)]/10 rounded-2xl flex items-center justify-center shrink-0">
            <AlertTriangle size={24} className="text-[var(--destructive)]" />
          </div>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            aria-label={t('Fechar', 'Close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h2 className="text-base font-black text-[var(--destructive)] uppercase tracking-tight">
            {t('Excluir minha conta', 'Delete my account')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {t(
              'Esta ação é permanente e irreversível. Todos os seus dados financeiros — ativos, transações, configurações e histórico — serão apagados definitivamente.',
              'This action is permanent and irreversible. All your financial data — assets, transactions, settings and history — will be permanently deleted.'
            )}
          </p>
        </div>

        {/* Confirmation input */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            {t(`Digite "${CONFIRMATION_WORD}" para confirmar`, `Type "${CONFIRMATION_WORD}" to confirm`)}
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={isDeleting}
            placeholder={CONFIRMATION_WORD}
            className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] focus:border-[var(--destructive)] rounded-xl p-3 text-[var(--text-primary)] text-sm font-mono outline-none transition-colors disabled:opacity-50"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-2xl border border-[var(--border-card)] text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest hover:bg-[var(--bg-app)] transition-all disabled:opacity-50"
          >
            {t('Cancelar', 'Cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmed || isDeleting}
            className="flex-1 py-3 rounded-2xl bg-[var(--destructive)] text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t('Excluindo...', 'Deleting...')}
              </>
            ) : (
              t('Excluir Conta', 'Delete Account')
            )}
          </button>
        </div>

        {/* Legal note */}
        <p className="text-[9px] text-[var(--text-muted)] text-center leading-relaxed">
          {t(
            'De acordo com a LGPD (Art. 18), você tem o direito de solicitar a exclusão dos seus dados pessoais.',
            'Under LGPD (Art. 18) and GDPR, you have the right to request deletion of your personal data.'
          )}
        </p>
      </div>
    </div>
  );
}

export default DeleteAccountModal;
