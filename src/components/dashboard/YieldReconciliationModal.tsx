import React, { useState } from 'react';
import { X } from 'lucide-react';
import { parseTransactionAmount } from '../../lib/finance';

const FMT = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

interface YieldReconciliationModalProps {
  assets: any[];
  onClose: () => void;
  onSave: (updatedAssets: any[]) => void;
}

export const YieldReconciliationModal: React.FC<YieldReconciliationModalProps> = ({ assets, onClose, onSave }) => {
  const [inputs, setInputs] = useState<Record<string, { weekday: string; weekend: string }>>(() => {
    const initial: Record<string, { weekday: string; weekend: string }> = {};
    assets.forEach(a => {
      initial[a.id] = {
        weekday: a.manualDailyYield !== undefined && a.manualDailyYield !== null ? a.manualDailyYield.toString().replace('.', ',') : '',
        weekend: a.manualWeekendYield !== undefined && a.manualWeekendYield !== null ? a.manualWeekendYield.toString().replace('.', ',') : ''
      };
    });
    return initial;
  });

  const handleChange = (id: string, field: 'weekday' | 'weekend', value: string) => {
    setInputs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const parseOptional = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = parseTransactionAmount(trimmed);
    return parsed > 0 ? parsed : null;
  };

  const handleSave = () => {
    const updated = assets.map(a => ({
      ...a,
      manualDailyYield: parseOptional(inputs[a.id]?.weekday ?? ''),
      manualWeekendYield: parseOptional(inputs[a.id]?.weekend ?? ''),
    }));
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[var(--bg-card)] w-full max-w-2xl rounded-[32px] p-6 shadow-2xl border border-[var(--border-card)] animate-in slide-in-from-bottom-8 max-h-[90vh] flex flex-col">
        
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold">Extrato Oficial</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Digite os rendimentos exatos. O app aplicará a regra do fim de semana automaticamente.
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-[var(--bg-app)] rounded-full text-[var(--text-muted)] hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto pr-2 mb-4 space-y-2 flex-1">
          {assets.map(a => {
            const isMercadoPago = (a.name || '').toLowerCase().includes('mercado pago');
            const hasManual = a.manualDailyYield !== undefined && a.manualDailyYield !== null;
            
            return (
              <div key={a.id} className="flex flex-col p-3 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl gap-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      Calculado: {FMT(Number(a.calculatedDailyYield ?? a.dailyYield ?? 0))}
                    </p>
                  </div>
                  {hasManual && (
                    <span className="text-[9px] bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full uppercase font-bold">
                      Manual
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] uppercase text-[var(--text-muted)] mb-1 block">Dia Útil</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm font-mono">R$</span>
                      <input 
                        type="text" inputMode="decimal"
                        placeholder={FMT(Number(a.calculatedDailyYield ?? a.dailyYield ?? 0)).replace('R$ ', '')}
                        value={inputs[a.id]?.weekday || ''}
                        onChange={(e) => handleChange(a.id, 'weekday', e.target.value)}
                        className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg py-2 pl-9 pr-2 text-sm font-mono focus:border-[var(--accent)] outline-none"
                      />
                    </div>
                  </div>
                  
                  {!isMercadoPago && (
                    <div>
                      <label className="text-[9px] uppercase text-[var(--text-muted)] mb-1 block">Fim de Semana</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm font-mono">R$</span>
                        <input 
                          type="text" inputMode="decimal"
                          placeholder="0,00"
                          value={inputs[a.id]?.weekend || ''}
                          onChange={(e) => handleChange(a.id, 'weekend', e.target.value)}
                          className="w-full bg-[var(--bg-card)] border border-[var(--border-card)] rounded-lg py-2 pl-9 pr-2 text-sm font-mono focus:border-[var(--accent)] outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 pt-4 border-t border-[var(--border-card)]">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[var(--accent)] text-[var(--bg-app)] hover:bg-[var(--accent)]/80 transition-colors">
            Salvar Extrato
          </button>
        </div>

      </div>
    </div>
  );
};
