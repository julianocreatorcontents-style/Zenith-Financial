import React, { useState } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';

const FMT = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

interface YieldReconciliationModalProps {
  assets: any[];
  onClose: () => void;
  onSave: (updatedAssets: any[]) => void;
}

export const YieldReconciliationModal: React.FC<YieldReconciliationModalProps> = ({ assets, onClose, onSave }) => {
  // Estado local para os inputs (inicializa com o manual se existir, senão com o calculado)
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    assets.forEach(a => {
      const manual = a.manualDailyYield;
      const calculated = a.dailyYield || 0;
      initial[a.id] = (manual !== undefined && manual !== null ? manual : calculated).toString().replace('.', ',');
    });
    return initial;
  });

  const handleChange = (id: string, value: string) => {
    setInputs(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = () => {
    const updated = assets.map(a => {
      const rawValue = inputs[a.id].replace(',', '.');
      const parsedValue = parseFloat(rawValue);
      return {
        ...a,
        manualDailyYield: isNaN(parsedValue) ? null : parsedValue
      };
    });
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[var(--bg-card)] w-full max-w-2xl rounded-[32px] p-6 shadow-2xl border border-[var(--border-card)] animate-in slide-in-from-bottom-8 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold">Conciliação de Rendimentos</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Compare o cálculo do app com o seu extrato oficial. Se houver diferença, digite o valor correto ao lado.
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-[var(--bg-app)] rounded-full text-[var(--text-muted)] hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Lista de Ativos */}
        <div className="overflow-y-auto pr-2 mb-4 space-y-2 flex-1">
          {assets.map(a => {
            const calculated = a.dailyYield || 0;
            const manual = a.manualDailyYield;
            const hasDiff = manual !== undefined && manual !== null && manual !== calculated;

            return (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Calculado pelo App: <span className="text-[var(--text-primary)] font-mono">{FMT(calculated)}</span></p>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm font-mono">R$</span>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      value={inputs[a.id] || ''}
                      onChange={(e) => handleChange(a.id, e.target.value)}
                      className={`w-32 bg-[var(--bg-card)] border rounded-lg py-2 pl-9 pr-2 text-sm font-mono focus:outline-none transition-colors ${hasDiff ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-card)] text-[var(--text-primary)]'}`}
                    />
                  </div>
                  {hasDiff && (
                    <div title="Valor manual ativo" className="text-[var(--accent)]">
                      <Check size={16} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-4 border-t border-[var(--border-card)]">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[var(--accent)] text-[var(--bg-app)] hover:bg-[var(--accent)]/80 transition-colors">
            Salvar Conciliação
          </button>
        </div>

      </div>
    </div>
  );
};
