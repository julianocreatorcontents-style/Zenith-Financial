import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Save,
  Sparkles,
  Loader2,
  FileUp,
  X,
  ShieldCheck,
  BarChart as BarChartIcon,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import Modal from '../ui/Modal';
import {
  db,
  doc,
  collection,
  writeBatch,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
} from '../../firebase';
import { extractAssets, getAiErrorMessage } from '../../lib/ai';
import { calculateRealProfitability } from '../../lib/finance';

export interface AssetModalProps {
  asset: any;
  onClose: () => void;
  privacyMode: boolean;
  onDelete: (id: string) => void;
  onSave: (id: string, data: any) => void;
  language?: string;
}

export function AssetModal({
  asset,
  onClose,
  privacyMode,
  onDelete,
  onSave,
  language,
}: AssetModalProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ ...asset });

  const rawStartDate = asset.investmentStartDate ?? asset.createdAt;
  const initialDateStr = (() => {
    try {
      const d = rawStartDate?.toDate ? rawStartDate.toDate() : rawStartDate ? new Date(rawStartDate) : new Date();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  })();
  const [startDateStr, setStartDateStr] = useState(initialDateStr);

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert(t('Por favor, insira um nome para o ativo.', 'Please enter a name for the asset.'));
      return;
    }
    if (formData.value < 0) {
      alert(t('O valor não pode ser negativo.', 'The value cannot be negative.'));
      return;
    }
    const {
      id,
      change,
      currentValue,
      accumulatedYield,
      dailyYield,
      daysInvested,
      yieldPercent,
      yieldStartDate,
      originalValue,
      ...updateData
    } = formData;

    if (startDateStr) {
      updateData.investmentStartDate = new Date(startDateStr + 'T12:00:00');
    }
    if (updateData.valorInvestido === undefined && updateData.value !== undefined) {
      updateData.valorInvestido = updateData.value;
    }

    onSave(asset.id, updateData);
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={isEditing ? t("Editar Ativo", "Edit Asset") : asset.name}
      subtitle={isEditing ? undefined : asset.type}
      ariaLabel={asset.name}
      headerAction={
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-app)] hover:text-[var(--accent)]"
          aria-label={isEditing ? t("Cancelar edição", "Cancel editing") : t("Editar ativo", "Edit asset")}
        >
          {isEditing ? <ArrowLeft size={20} /> : <Edit2 size={20} />}
        </button>
      }
    >
      <div className="space-y-6">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Nome", "Name")}</label>
              <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Aporte Original (R$)", "Original Deposit (R$)")}</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
                <input
                  type="text"
                  value={(formData.valorInvestido ?? formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    const num = parseInt(val || '0') / 100;
                    setFormData({...formData, valorInvestido: num, value: num});
                  }}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Data do Aporte / Registro", "Deposit / Registration Date")}</label>
              <input
                type="date"
                value={startDateStr}
                onChange={e => {
                  setStartDateStr(e.target.value);
                  setFormData({...formData, investmentStartDate: e.target.value ? new Date(e.target.value + 'T12:00:00') : new Date()});
                }}
                className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none">
                <option value="liquidity">{t("Liquidez", "Liquidity")}</option>
                <option value="investment">{t("Investimento", "Investment")}</option>
                <option value="physical">{t("Bem Físico", "Physical Asset")}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Detalhes", "Details")}</label>
              <textarea value={formData.detail} onChange={e => setFormData({...formData, detail: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none h-24" />
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button onClick={() => onDelete(asset.id)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--trend-down)]/10 py-4 text-xs font-bold uppercase tracking-widest text-[var(--trend-down)] transition-colors hover:bg-[var(--trend-down)]/20">
                <Trash2 size={16} /> {t("Excluir", "Delete")}
              </button>
              <button onClick={handleSave} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-xs font-bold uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)]/80">
                <Save size={16} /> {t("Salvar", "Save")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-3xl font-mono tracking-tighter text-[var(--text-primary)] sm:text-4xl">
                {privacyMode ? '••••••' : (asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              {asset.change && <p className="text-xs font-bold text-[var(--accent)]">{asset.change} {t("no período", "in period")}</p>}
            </div>

            {((asset.accumulatedYield && asset.accumulatedYield > 0) || (asset.dailyYield && asset.dailyYield > 0) || asset.daysInvested !== undefined) && (
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--bg-app)] p-3 border border-[var(--border-card)] text-left">
                <div>
                  <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t("Aporte Original", "Initial Deposit")}</span>
                  <span className="text-xs font-mono font-bold text-[var(--text-primary)]">
                    {privacyMode ? '••••••' : ((asset.originalValue ?? asset.valorInvestido ?? asset.value) ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t("Rendimento Acumulado", "Accumulated Yield")}</span>
                  <span className="text-xs font-mono font-bold text-[var(--accent)]">
                    {privacyMode ? '••••••' : (asset.accumulatedYield ? `+${asset.accumulatedYield.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'R$ 0,00')}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t("Rendimento Diário", "Daily Yield")}</span>
                  <span className="text-xs font-mono font-bold text-[var(--accent)]">
                    {privacyMode ? '••••••' : (asset.dailyYield ? `+${asset.dailyYield.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia` : 'R$ 0,00/dia')}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t("Tempo Investido", "Days Invested")}</span>
                  <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">
                    {asset.daysInvested ?? 0} {t("dias", "days")}
                  </span>
                </div>
              </div>
            )}

            <div className="h-px bg-[var(--border-card)]" />
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{asset.detail}</p>
            <button onClick={() => setIsEditing(true)} className="w-full rounded-2xl bg-[var(--text-primary)] py-4 text-[10px] font-black uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)] sm:py-5">
              {t("Editar Ativo", "Edit Asset")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProcessingOverlay({ language, stage, progress }: { language: string, stage: string, progress: number }) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-[var(--bg-card)]/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center"
    >
      <div className="relative w-24 h-24 mb-8">
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            filter: ["drop-shadow(0 0 5px var(--accent))", "drop-shadow(0 0 20px var(--accent))", "drop-shadow(0 0 5px var(--accent))"]
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 flex items-center justify-center text-[var(--accent)]"
        >
          <Sparkles size={48} />
        </motion.div>
        
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute -inset-2 border-2 border-dashed border-[var(--accent)]/30 rounded-full"
        />
      </div>

      <div className="space-y-4 w-full max-w-[240px]">
        <motion.h4 
          key={stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.3em]"
        >
          {stage}
        </motion.h4>
        
        <div className="h-1 w-full bg-[var(--bg-app)] rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
          />
        </div>

        <p className="text-[10px] text-[var(--text-muted)] font-medium">
          {t("Extraindo dados com Agente 03...", "Extracting data with Agent 03...")}
        </p>
      </div>
    </motion.div>
  );
}

export interface AddAssetModalProps {
  onClose: () => void;
  onAdd: (data: any) => void;
  language?: string;
  investorProfile: string;
  user: any;
  getApiKey: () => string;
  onApiKeyError: (err: any) => void;
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
    type: 'liquidity',
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
    if (!file) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    setExtractionError(null);
    setIsExtracting(true);
    setExtractionStage(t("Lendo arquivo...", "Reading file..."));
    setExtractionProgress(0.1);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const isSpreadsheet = ['xlsx', 'xls', 'csv', 'tsv'].includes(extension || '');
      const isImageOrPdf = ['png', 'jpg', 'jpeg', 'pdf'].includes(extension || '');
      
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        setExtractionStage(t("Extraindo metadados...", "Extracting metadata..."));
        setExtractionProgress(0.4);

        let documentInput: { data?: string; text?: string; mimeType?: string };

        if (isSpreadsheet) {
          const { read, utils } = await import('xlsx');
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = read(data, { type: 'array' });
          let content = "";
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

        setExtractionStage(t("Consultando IA Zenith...", "Consulting Zenith AI..."));
        setExtractionProgress(0.8);

        const result = await extractAssets(apiKey, {
          ...documentInput,
          investorProfile
        });

        setExtractionStage(t("Sincronizando Carteira...", "Syncing Wallet..."));
        setExtractionProgress(0.9);

        if (result.ativos && result.ativos.length > 0) {
          const batch = writeBatch(db);
          result.ativos.forEach((ativo: any) => {
            const docRef = doc(collection(db, 'assets'));
            batch.set(docRef, {
              ...ativo,
              uid: user.uid,
              createdAt: serverTimestamp(),
              detail: result.insight || `Extraído automaticamente de: ${file.name}`
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
          alert(t("Nenhum ativo detectado no documento.", "No assets detected in the document."));
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
      console.error("Erro na extração:", error);
      setIsExtracting(false);
      setExtractionError(getAiErrorMessage(error, language));
      onApiKeyError(error);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
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
      title={t("Novo Ativo", "New Asset")}
      closeLabel={t("Fechar", "Close")}
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
              <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest">{t("Extraindo dados com IA...", "Extracting data with AI...")}</p>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-app)] text-[var(--text-muted)]">
                <FileUp size={20} />
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{t("Extração Automática", "Automatic Extraction")}</p>
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{t("Arraste seu extrato ou comprovante aqui para preencher os dados automaticamente.", "Drag your statement or receipt here to fill in data automatically.")}</p>
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
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Nome", "Name")}</label>
            <input placeholder={t("Ex: Carteira 99Pay, Tesouro Selic...", "Ex: 99Pay, Treasury...")} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none" />
            {formData.name.toLowerCase().includes('99pay') && (
              <p className="mt-1 text-[10px] font-bold text-[var(--accent)] flex items-center gap-1">
                <Sparkles size={12} /> {t("Preset 99Pay detectado: 137% CDI até R$ 5k + 80% excedente (Rendimento Diário Automático)", "99Pay detected: 137% CDI up to 5k + 80% remainder (Daily Yield)")}
              </p>
            )}
            {formData.name.toLowerCase().includes('mercado pago') && (
              <p className="mt-1 text-[10px] font-bold text-[var(--accent)] flex items-center gap-1">
                <Sparkles size={12} /> {t("Preset Mercado Pago detectado: 105% CDI até R$ 20k (Rendimento Diário Automático)", "Mercado Pago detected: 105% CDI up to 20k (Daily Yield)")}
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Valor / Aporte Original (R$)", "Value / Original Deposit (R$)")}</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
              <input
                type="text"
                value={(formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setFormData({...formData, value: parseInt(val || '0') / 100});
                }}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Data do Aporte / Registro", "Deposit / Registration Date")}</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={e => setFormData({...formData, startDate: e.target.value})}
              className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Tipo", "Type")}</label>
            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none">
              <option value="liquidity">{t("Liquidez", "Liquidity")}</option>
              <option value="investment">{t("Investimento", "Investment")}</option>
              <option value="physical">{t("Bem Físico", "Physical Asset")}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t("Detalhes", "Details")}</label>
            <textarea placeholder={t("Descrição curta...", "Short description...")} value={formData.detail} onChange={e => setFormData({...formData, detail: e.target.value})} className="mt-1 h-24 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none" />
          </div>
          <button onClick={handleAdd} className="mt-2 w-full rounded-2xl bg-[var(--accent)] py-4 text-[10px] font-black uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)]/80">
            {t("Adicionar Ativo", "Add Asset")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export interface AssetDeepDiveModalProps {
  asset: any;
  onClose: () => void;
  language?: string;
}

export function AssetDeepDiveModal({ asset, onClose, language }: AssetDeepDiveModalProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const realProfitability = calculateRealProfitability(12.5, asset.taxaInflacao || 4.5);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-[#121212] border-t border-[var(--border-card)] rounded-t-[40px] p-8 pb-12 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="w-12 h-1.5 bg-[var(--border-card)] rounded-full mx-auto mb-8" />
        
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{asset.name}</h2>
            <p className="text-white/40 text-sm">{asset.emissor || 'Zenith Core'}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          {((asset.accumulatedYield && asset.accumulatedYield > 0) || (asset.dailyYield && asset.dailyYield > 0) || asset.originalValue) && (
            <div className="grid grid-cols-2 gap-3 rounded-3xl bg-white/5 border border-white/10 p-5">
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t("Aporte Original", "Initial Deposit")}</p>
                <p className="text-lg font-mono font-bold text-white">
                  {((asset.originalValue ?? asset.valorInvestido ?? asset.value) ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t("Saldo Atual", "Current Balance")}</p>
                <p className="text-lg font-mono font-bold text-[var(--accent)]">
                  {(asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t("Rendimento Acumulado", "Accumulated Yield")}</p>
                <p className="text-sm font-mono font-bold text-[var(--accent)]">
                  +{((asset.accumulatedYield ?? 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({asset.yieldPercent ? `+${asset.yieldPercent.toFixed(2)}%` : '+0.00%'})
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">{t("Rendimento Diário", "Daily Yield")}</p>
                <p className="text-sm font-mono font-bold text-white">
                  +{(asset.dailyYield ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia
                </p>
              </div>
            </div>
          )}

          <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 p-6 rounded-[32px] flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest mb-1">{t("Rentabilidade Real", "Real Profitability")}</p>
              <h4 className="text-2xl font-mono font-bold text-white">{(realProfitability * 100).toFixed(2)}% <span className="text-sm">a.a</span></h4>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)]">
              <ShieldCheck size={24} />
            </div>
          </div>

          <div className="h-48 w-full bg-white/5 rounded-[32px] border border-white/10 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[{v:10}, {v:15}, {v:12}, {v:20}, {v:18}, {v:25}]}>
                  <Area type="monotone" dataKey="v" stroke="var(--accent)" fill="var(--accent)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col items-center gap-2 z-10">
              <BarChartIcon size={32} className="text-[var(--accent)]" />
              <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{t("Gráfico de Evolução", "Evolution Chart")}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--accent)]" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Insights Zenith IA</span>
            </div>
            <div className="bg-white/5 p-6 rounded-[32px] border border-white/10">
              <p className="text-sm text-white/70 leading-relaxed">
                {t(
                  `Com base no seu perfil ${asset.subcategoria === 'Renda Fixa' ? 'Conservador' : 'Estratégico'}, este ativo mantém seu poder de compra acima da inflação estimada em ${asset.taxaInflacao || 4.5}%. Recomendamos manter a posição para o longo prazo.`,
                  `Based on your ${asset.subcategoria === 'Renda Fixa' ? 'Conservative' : 'Strategic'} profile, this asset maintains your purchasing power above the estimated inflation of ${asset.taxaInflacao || 4.5}%. We recommend holding the position for the long term.`
                )}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
