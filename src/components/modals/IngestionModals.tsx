import React, { useState, useEffect } from 'react';
import { QrCode, FileText, Table, Edit3, Sparkles, Zap } from 'lucide-react';
import Modal from '../ui/Modal';

export function Shimmer({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-[var(--bg-card-hover)] rounded-xl ${className}`} />
  );
}

export interface IngestionHubProps {
  isOpen: boolean;
  onClose: () => void;
  onProcess: (optionId: string) => void;
  language?: string;
}

export function IngestionHub({ isOpen, onClose, onProcess, language }: IngestionHubProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);

  const options = [
    { id: 'scanner', icon: <QrCode size={20} />, label: t('Scanner QR/Boleto', 'QR/Boleto Scanner'), color: '#00FFA3' },
    { id: 'upload', icon: <FileText size={20} />, label: t('Upload de Documentos', 'Document Upload'), color: '#007AFF' },
    { id: 'spreadsheet', icon: <Table size={20} />, label: t('Importar Planilha', 'Import Spreadsheet'), color: '#FF9500' },
    { id: 'manual', icon: <Edit3 size={20} />, label: t('Lançamento Manual', 'Manual Entry'), color: '#FF2D55' },
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      variant="sheet"
      showHandle
      title={t('Hub de Ingestão', 'Ingestion Hub')}
      closeLabel={t('Fechar', 'Close')}
    >
      <div className="grid grid-cols-2 gap-3 pb-1">
        {options.map((opt, idx) => (
          <button
            key={`ingest-item-${opt.id}-${idx}`}
            onClick={() => onProcess(opt.id)}
            className="group flex flex-col items-center justify-center rounded-2xl border border-[var(--border-card)] bg-[var(--bg-app)] p-3 transition-all hover:bg-[var(--bg-card-hover)] sm:p-5"
          >
            <div
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110 sm:h-12 sm:w-12"
              style={{ backgroundColor: `${opt.color}20`, color: opt.color }}
            >
              {opt.icon}
            </div>
            <span className="text-center text-[11px] font-bold leading-tight tracking-tight text-[var(--text-secondary)] sm:text-xs">
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export interface ReviewModalProps {
  transaction: any;
  onConfirm: (data: any) => void;
  onCancel: () => void;
  language?: string;
  isProcessing?: boolean;
}

export function ReviewModal({
  transaction,
  onConfirm,
  onCancel,
  language,
  isProcessing,
}: ReviewModalProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({ ...transaction });

  useEffect(() => {
    if (transaction) setFormData({ ...transaction });
  }, [transaction]);

  if (!transaction && !isProcessing) return null;

  const handleConfirm = () => {
    onConfirm(formData);
  };

  return (
    <Modal
      open={Boolean(transaction || isProcessing)}
      onClose={onCancel}
      variant="center"
      icon={isProcessing ? <Sparkles size={26} /> : <Zap size={26} />}
      eyebrow={isProcessing ? t('Analisando Documento', 'Analyzing Document') : t('IA Detectou', 'AI Detected')}
      title={isProcessing ? t('Processando IA...', 'Processing AI...') : t('Revisar Lançamento', 'Review Entry')}
      closeOnBackdrop={!isProcessing}
      closeOnEscape={!isProcessing}
      showClose={!isProcessing}
      closeLabel={t('Fechar', 'Close')}
    >
      {isProcessing ? (
        <div className="space-y-6 py-2">
          <div className="relative mx-auto h-20 w-20 rounded-3xl bg-[var(--accent)]/10 flex items-center justify-center">
            <Sparkles size={40} className="text-[var(--accent)] animate-pulse" />
            <div className="absolute inset-0 border-4 border-[var(--accent)] border-t-transparent rounded-3xl animate-spin" />
          </div>
          <div className="space-y-3">
            <Shimmer className="h-12 w-full" />
            <Shimmer className="h-12 w-3/4 mx-auto" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4 rounded-3xl border border-[var(--border-card)] bg-[var(--bg-app)] p-4 sm:p-6">
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Título', 'Title')}</span>
              <span className="text-sm font-medium text-[var(--text-primary)] text-right">{transaction.label}</span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Data', 'Date')}</span>
              <span className="text-sm font-medium text-[var(--text-primary)] text-right">
                {transaction.date?.toDate
                  ? transaction.date.toDate().toLocaleDateString('pt-BR')
                  : transaction.date
                    ? new Date(transaction.date).toLocaleDateString('pt-BR')
                    : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Valor', 'Value')}</span>
              <span className="text-base font-mono font-bold text-[var(--accent)] sm:text-lg">R$ {transaction.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('Categoria', 'Category')}</span>
              <select
                className="max-w-[60%] bg-transparent text-base font-medium text-[var(--text-primary)] outline-none border-b border-[var(--border-card)] focus:border-[var(--accent)] transition-colors cursor-pointer sm:text-sm"
                value={formData.categoria_primaria || formData.category}
                onChange={(e) => {
                  const newCat = e.target.value;
                  setFormData({ ...formData, categoria_primaria: newCat, category: newCat });
                }}
              >
                <option value="Moradia">Moradia</option>
                <option value="Alimentação">Alimentação</option>
                <option value="Energia">Energia</option>
                <option value="Água">Água</option>
                <option value="Transporte">Transporte</option>
                <option value="Lazer">Lazer</option>
                <option value="Investimentos">Investimentos</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={onCancel}
              className="rounded-2xl bg-[var(--bg-app)] py-4 text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]/60 transition-colors hover:bg-[var(--bg-card-hover)]"
            >
              {t('Descartar', 'Discard')}
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-2xl bg-[var(--accent)] py-4 text-xs font-black uppercase tracking-widest text-[var(--bg-app)] shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all hover:scale-[1.02]"
            >
              {t('Confirmar', 'Confirm')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
