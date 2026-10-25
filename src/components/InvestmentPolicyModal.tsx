import { useState, useEffect } from 'react';

export interface InvestmentPolicyData {
  name: string;
  indexer: 'CDI' | 'SELIC' | 'PRE';
  rateType: 'PERCENT_INDEXER' | 'SPREAD' | 'FIXED';
  dayCountConvention: 'BUSINESS_DAYS_252' | 'CALENDAR_DAYS_365';
  taxDisplayMode: 'GROSS' | 'NET';
  baseRateValue: number;
  bonusRateValue: number;
  hasTier2: boolean;
  tier2Limit: number;
  tier2BaseRate: number;
  tier2BonusRate: number;
  initialBalance?: number;
}

interface Props {
  isOpen: boolean;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSave: (data: InvestmentPolicyData) => Promise<void>;
  initialData?: InvestmentPolicyData;
}

const PRESETS: Record<string, InvestmentPolicyData> = {
  '99Pay': { 
    name: '99Pay', indexer: 'CDI', rateType: 'PERCENT_INDEXER', dayCountConvention: 'CALENDAR_DAYS_365', taxDisplayMode: 'NET', 
    baseRateValue: 110, bonusRateValue: 27, hasTier2: true, tier2Limit: 5000, tier2BaseRate: 80, tier2BonusRate: 0, initialBalance: 0 
  },
  'MP Saldo': { 
    name: 'Mercado Pago · Saldo', indexer: 'CDI', rateType: 'PERCENT_INDEXER', dayCountConvention: 'BUSINESS_DAYS_252', taxDisplayMode: 'NET', 
    baseRateValue: 105, bonusRateValue: 0, hasTier2: true, tier2Limit: 20000, tier2BaseRate: 100, tier2BonusRate: 0, initialBalance: 0 
  },
  'MP Cofrinho': { 
    name: 'Mercado Pago · Cofrinho', indexer: 'CDI', rateType: 'PERCENT_INDEXER', dayCountConvention: 'BUSINESS_DAYS_252', taxDisplayMode: 'NET', 
    baseRateValue: 115, bonusRateValue: 0, hasTier2: true, tier2Limit: 5000, tier2BaseRate: 100, tier2BonusRate: 0, initialBalance: 0 
  },
  'MP Meli+': { 
    name: 'Mercado Pago · Cofrinho Meli+', indexer: 'CDI', rateType: 'PERCENT_INDEXER', dayCountConvention: 'BUSINESS_DAYS_252', taxDisplayMode: 'NET', 
    baseRateValue: 120, bonusRateValue: 0, hasTier2: true, tier2Limit: 10000, tier2BaseRate: 100, tier2BonusRate: 0, initialBalance: 0 
  },
};

const DEFAULT_FORM: InvestmentPolicyData = {
  name: '', indexer: 'CDI', rateType: 'PERCENT_INDEXER', dayCountConvention: 'BUSINESS_DAYS_252', taxDisplayMode: 'NET', 
  baseRateValue: 100, bonusRateValue: 0, hasTier2: false, tier2Limit: 0, tier2BaseRate: 0, tier2BonusRate: 0, initialBalance: 0
};

function parseBRL(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
}

export function InvestmentPolicyModal({ isOpen, mode = 'edit', onClose, onSave, initialData }: Props) {
  const [form, setForm] = useState<InvestmentPolicyData>(DEFAULT_FORM);
  const [balanceStr, setBalanceStr] = useState('');
  const [limitStr, setLimitStr] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const data = initialData ?? DEFAULT_FORM;
      setForm(data);
      setBalanceStr(data.initialBalance ? data.initialBalance.toString().replace('.', ',') : '');
      setLimitStr(data.tier2Limit ? data.tier2Limit.toString().replace('.', ',') : '');
      setIsSaving(false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (field: keyof InvestmentPolicyData, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ ...form, initialBalance: parseBRL(balanceStr), tier2Limit: parseBRL(limitStr) });
    } catch (error: any) {
      alert("Erro: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] w-full max-w-md rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{mode === 'create' ? 'Novo Investimento' : 'Editar Investimento'}</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕</button>
        </div>

        <div className="space-y-4">
          {mode === 'create' && (
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Preenchimento Rápido</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(PRESETS).map((key) => (
                  <button key={key} type="button" onClick={() => { setForm(PRESETS[key]); setBalanceStr(''); setLimitStr(PRESETS[key].tier2Limit.toString()); }} className="px-3 py-1.5 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg text-xs font-medium hover:border-[var(--accent)]">{key}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Nome do Ativo</label>
            <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]" />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Saldo Atual (R$)</label>
            <input type="text" value={balanceStr} onChange={(e) => setBalanceStr(e.target.value)} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]" placeholder="Ex: 5073,23" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Taxa Base (% CDI)</label>
              <input type="number" step="0.01" value={form.baseRateValue} onChange={(e) => handleChange('baseRateValue', Number(e.target.value))} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Bônus (%)</label>
              <input type="number" step="0.01" value={form.bonusRateValue} onChange={(e) => handleChange('bonusRateValue', Number(e.target.value))} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]" />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <input type="checkbox" id="tier2" checked={form.hasTier2} onChange={(e) => handleChange('hasTier2', e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
            <label htmlFor="tier2" className="text-sm text-[var(--text-primary)]">Possui faixa de excedente (ex: acima do limite)</label>
          </div>

          {form.hasTier2 && (
            <div className="p-4 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Limite da Faixa 1 (R$)</label>
                <input type="text" value={limitStr} onChange={(e) => setLimitStr(e.target.value)} className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]" placeholder="Ex: 5000,00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Taxa Excedente (% CDI)</label>
                  <input type="number" step="0.01" value={form.tier2BaseRate} onChange={(e) => handleChange('tier2BaseRate', Number(e.target.value))} className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Bônus Excedente (%)</label>
                  <input type="number" step="0.01" value={form.tier2BonusRate} onChange={(e) => handleChange('tier2BonusRate', Number(e.target.value))} className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]" />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Dias no Ano</label>
              <select value={form.dayCountConvention} onChange={(e) => handleChange('dayCountConvention', e.target.value)} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]">
                <option value="BUSINESS_DAYS_252">252 (Úteis)</option>
                <option value="CALENDAR_DAYS_365">365 (Corridos)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Exibição</label>
              <select value={form.taxDisplayMode} onChange={(e) => handleChange('taxDisplayMode', e.target.value)} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-sm outline-none focus:border-[var(--accent)]">
                <option value="GROSS">Bruto</option>
                <option value="NET">Líquido (Desconta IR)</option>
              </select>
            </div>
          </div>

          <button type="button" onClick={handleSave} disabled={isSaving} className="w-full mt-6 bg-[var(--accent)] text-black font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-50">
            {isSaving ? 'Salvando...' : 'Salvar Investimento'}
          </button>
        </div>
      </div>
    </div>
  );
}
