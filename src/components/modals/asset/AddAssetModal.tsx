import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, FileUp } from 'lucide-react';
import Modal from '../../ui/Modal';
import {
  db,
  doc,
  collection,
  writeBatch,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
} from '../../../firebase';
import { extractAssets, getAiErrorMessage } from '../../../lib/ai';
import { ProcessingOverlay } from './ProcessingOverlay';
import type { Asset } from '../../../types/app';
import type { ZenithUser } from '../../../hooks/useZenithData';

export interface AddAssetModalProps {
  onClose: () => void;
  onAdd: (data: Partial<Asset>) => void;
  language?: string;
  investorProfile: string;
  user: ZenithUser | null;
  getApiKey: () => string;
  onApiKeyError: (err: unknown) => void;
}

export function AddAssetModal({
  onClose,
  onAdd,
  language = 'pt-BR',
  investorProfile,
  user,
  getApiKey,
  onApiKeyError,
}: AddAssetModalProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [formData, setFormData] = useState({
    name: '',
    value: 0,
    type: 'liquidity' as Asset['type'],
    detail: '',
    startDate: new Date().toISOString().split('T')[0],
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStage, setExtractionStage] = useState('');
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleAdd = () => {
    if (!formData.name.trim()) {
      alert(t('Por favor, insira um nome para o ativo.', 'Please enter a name for the asset.'));
      return;
    }
    if (formData.value < 0) {
      alert(t('O valor não pode ser negativo.', 'The value cannot be negative.'));
      return;
    }
    onAdd({
      name: formData.name,
      value: formData.value,
      valorInvestido: formData.value,
      type: formData.type,
      detail: formData.detail,
      investmentStartDate: formData.startDate ? new Date(formData.startDate + 'T12:00:00') : new Date(),
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file || !user) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    setExtractionError(null);
    setIsExtracting(true);
    setExtractionStage(t('Lendo arquivo...', 'Reading file...'));
    setExtractionProgress(0.1);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const isSpreadsheet = ['xlsx', 'xls', 'csv', 'tsv'].includes(extension || '');
      const isImageOrPdf = ['png', 'jpg', 'jpeg', 'pdf'].includes(extension || '');
      
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        setExtractionStage(t('Extraindo metadados...', 'Extracting metadata...'));
        setExtractionProgress(0.4);

        let documentInput: { data?: string; text?: string; mimeType?: string };

        if (isSpreadsheet) {
          const { read, utils } = await import('xlsx');
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = read(data, { type: 'array' });
          let content = '';
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            content += `Sheet: ${sheetName}\n${utils.sheet_to_csv(worksheet)}\n`;
          });
          documentInput = { text: `Document content (Spreadsheet converted to CSV):\n${content}` };
        } else if (isImageOrPdf) {
          const base64Data = e.target?.result?.toString().split(',')[1];
          if (!base64Data) {
            setIsExtracting(false);
            return;
          }
          documentInput = { data: base64Data, mimeType: file.type || 'application/octet-stream' };
        } else {
          documentInput = { text: `Document content (Text):\n${e.target?.result?.toString()}` };
        }

        setExtractionStage(t('Consultando IA Zenith...', 'Consulting Zenith AI...'));
        setExtractionProgress(0.8);

        const result = await extractAssets(apiKey, {
          ...documentInput,
          investorProfile,
        });

        setExtractionStage(t('Sincronizando Carteira...', 'Syncing Wallet...'));
        setExtractionProgress(0.9);

        if (result.ativos && result.ativos.length > 0) {
          const batch = writeBatch(db);
          result.ativos.forEach((ativo) => {
            const docRef = doc(collection(db, 'assets'));
            batch.set(docRef, {
              ...ativo,
              uid: user.uid,
              createdAt: serverTimestamp(),
              detail: result.insight || `Extraído automaticamente de: ${file.name}`,
            });
          });
          
          await batch.commit().catch(err => handleFirestoreError(err, OperationType.WRITE, 'assets'));
          
          setExtractionProgress(1.0);
          setTimeout(() => {
            setIsExtracting(false);
            onClose();
          }, 800);
        } else {
          setIsExtracting(false);
          alert(t('Nenhum ativo detectado no documento.', 'No assets detected in the document.'));
        }
      };

      if (isSpreadsheet) {
        reader.readAsArrayBuffer(file);
      } else if (isImageOrPdf) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    } catch (error) {
      console.error('Erro na extração:', error);
      setIsExtracting(false);
      setExtractionError(getAiErrorMessage(error, language));
      onApiKeyError(error);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={t('Novo Ativo', 'New Asset')}
      closeLabel={t('Fechar', 'Close')}
    >
      <div className="space-y-5">
        <AnimatePresence>
          {isExtracting && (
            <ProcessingOverlay
              language={language}
              stage={extractionStage}
              progress={extractionProgress}
            />
          )}
        </AnimatePresence>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-4 text-center transition-all sm:p-6 ${dragActive ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-card)] hover:border-[var(--text-muted)]'}`}
        >
          {isExtracting ? (
            <>
              <Loader2 size={32} className="text-[var(--accent)] animate-spin" />
              <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest">{t('Extraindo dados com IA...', 'Extracting data with AI...')}</p>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-app)] text-[var(--text-muted)]">
                <FileUp size={20} />
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{t('Extração Automática', 'Automatic Extraction')}</p>
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{t('Arraste seu extrato ou comprovante aqui para preencher os dados automaticamente.', 'Drag your statement or receipt here to fill in data automatically.')}</p>
              </div>
              <input
                type="file"
                className="absolute inset-0 cursor-pointer opacity-0"
                accept="image/*,application/pdf,.csv,.xlsx,.tsv"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
              />
            </>
          )}
        </div>

        {extractionError && (
          <p className="text-[10px] font-medium leading-relaxed text-[var(--trend-down)]">{extractionError}</p>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Nome', 'Name')}</label>
            <input
              placeholder={t('Ex: Carteira 99Pay, Tesouro Selic...', 'Ex: 99Pay, Treasury...')}
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none"
            />
            {formData.name.toLowerCase().includes('99pay') && (
              <p className="mt-1 text-[10px] font-bold text-[var(--accent)] flex items-center gap-1">
                <Sparkles size={12} /> {t('Preset 99Pay detectado: 137% CDI até R$ 5k + 80% excedente (Rendimento Diário Automático)', '99Pay detected: 137% CDI up to 5k + 80% remainder (Daily Yield)')}
              </p>
            )}
            {formData.name.toLowerCase().includes('mercado pago') && (
              <p className="mt-1 text-[10px] font-bold text-[var(--accent)] flex items-center gap-1">
                <Sparkles size={12} /> {t('Preset Mercado Pago detectado: 105% CDI até R$ 20k (Rendimento Diário Automático)', 'Mercado Pago detected: 105% CDI up to 20k (Daily Yield)')}
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Valor / Aporte Original (R$)', 'Value / Original Deposit (R$)')}</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
              <input
                type="text"
                value={(formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setFormData({ ...formData, value: parseInt(val || '0', 10) / 100 });
                }}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Data do Aporte / Registro', 'Deposit / Registration Date')}</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={e => setFormData({ ...formData, startDate: e.target.value })}
              className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Tipo', 'Type')}</label>
            <select
              value={formData.type || 'liquidity'}
              onChange={e => setFormData({ ...formData, type: e.target.value as Asset['type'] })}
              className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none"
            >
              <option value="liquidity">{t('Liquidez', 'Liquidity')}</option>
              <option value="investment">{t('Investimento', 'Investment')}</option>
              <option value="physical">{t('Bem Físico', 'Physical Asset')}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Detalhes', 'Details')}</label>
            <textarea
              placeholder={t('Descrição curta...', 'Short description...')}
              value={formData.detail}
              onChange={e => setFormData({ ...formData, detail: e.target.value })}
              className="mt-1 h-24 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="mt-2 w-full rounded-2xl bg-[var(--accent)] py-4 text-[10px] font-black uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)]/80"
          >
            {t('Adicionar Ativo', 'Add Asset')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AddAssetModal;
