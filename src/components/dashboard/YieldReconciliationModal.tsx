import React, { useState } from 'react';
import { parseTransactionAmount } from '../../lib/finance';
import Modal from '../ui/Modal';

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
    <Modal
      open={true}
      onClose={onClose}
      title="Extrato Oficial"
      subtitle="Digite os rendimentos exatos. O app aplicará a regra do fim de semana automaticamente."
      className="max-w-2xl w-full"
      footer={
        <div className="flex gap-3 pt-4 border-t border-[var(--border-card)] w-full">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-white transition-colors active:scale-95">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[var(--accent)] text-[var(--bg-app)] hover:bg-[var(--accent)]/80 transition-colors active:scale-95">
            Salvar Extrato
          </button>
        </div>
      }
    >
      <div className="overflow-y-auto pr-2 mb-4 space-y-2 max-h-[60vh]">
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
    </Modal>
  );
};
