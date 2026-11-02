import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown, Calendar as CalendarIcon, Edit3, Save } from 'lucide-react';

const FMT = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const WEEK_DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

interface FinancialCalendarModalProps {
  assets: any[];
  transactions: any[];
  onClose: () => void;
  onUpdateAsset: (id: string, data: any) => Promise<void>;
  onUpdateTransaction: (tx: any, data: any) => Promise<void>;
}

export const FinancialCalendarModal: React.FC<FinancialCalendarModalProps> = ({
  assets, transactions, onClose, onUpdateAsset, onUpdateTransaction
}) => {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [editingData, setEditingData] = useState<any>(null);

  const currentYear = 2026;
  const currentMonth = 10; // Novembro
  const daysInMonth = 30;
  const startDayOfWeek = 0; // 1 de Novembro de 2026 é domingo

  const dayData = useMemo(() => {
    if (selectedDay === null) return null;

    const isWeekend = (day: number) => {
      const d = new Date(currentYear, currentMonth, day).getDay();
      return d === 0 || d === 6;
    };

    let totalYield = 0;
    const assetSnapshots: Record<string, { balance: number, yield: number }> = {};
    const dayTxList: any[] = [];

    const baseBalances: Record<string, number> = {};
    assets.forEach(a => { 
      baseBalances[a.id] = a.manualBalance || a.currentValue || a.value || 0; 
      assetSnapshots[a.id] = { balance: baseBalances[a.id], yield: 0 };
    });

    for (let d = 1; d <= selectedDay; d++) {
      const weekend = isWeekend(d);

      assets.forEach(a => {
        const daily = Number(a.manualDailyYield ?? a.dailyYield ?? 0);
        const wEnd = Number(a.manualWeekendYield ?? 0);
        const isMP = (a.name || '').toLowerCase().includes('mercado pago');
        
        let gain = 0;
        if (weekend) {
          if (!isMP && wEnd > 0) gain = wEnd;
        } else {
          gain = daily;
        }

        assetSnapshots[a.id].balance += gain;
        assetSnapshots[a.id].yield += gain;
        totalYield += gain;
      });

      const txs = transactions.filter(t => {
        const txDate = t.date?.toDate ? t.date.toDate() : new Date(t.date);
        return txDate.getDate() === d && txDate.getMonth() === currentMonth;
      });

      txs.forEach(tx => {
        if (d === selectedDay) dayTxList.push(tx);
        const val = Number(tx.value) || 0;
        
        if (tx.assetId && assetSnapshots[tx.assetId]) {
          if (tx.type === 'in') {
            assetSnapshots[tx.assetId].balance += val;
          } else {
            assetSnapshots[tx.assetId].balance -= val;
          }
        }
      });
    }

    const totalBalance = Object.values(assetSnapshots).reduce((acc, a) => acc + a.balance, 0);

    return { totalBalance, totalYield, assetSnapshots, dayTxList };
  }, [selectedDay, assets, transactions]);

  const handleSelectItem = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedItemId(val);
    
    if (val.startsWith('asset-')) {
      const id = val.replace('asset-', '');
      const asset = assets.find(a => a.id === id);
      if (asset) setEditingData({ ...asset, isAsset: true });
    } else if (val.startsWith('tx-')) {
      const id = val.replace('tx-', '');
      const tx = dayData?.dayTxList.find((t: any) => t.id === id);
      if (tx) setEditingData({ ...tx, isAsset: false });
    } else {
      setEditingData(null);
    }
  };

  const handleSave = async () => {
    if (!editingData) return;
    if (editingData.isAsset) {
      await onUpdateAsset(editingData.id, {
        manualBalance: Number(editingData.manualBalance || editingData.currentValue || editingData.value),
        manualDailyYield: Number(editingData.manualDailyYield || editingData.dailyYield),
        manualWeekendYield: editingData.manualWeekendYield ? Number(editingData.manualWeekendYield) : null
      });
    } else {
      await onUpdateTransaction(editingData, {
        label: editingData.label,
        value: Number(editingData.value),
        type: editingData.type
      });
    }
    setSelectedItemId('');
    setEditingData(null);
  };

  const calendarCells = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[var(--bg-card)] w-full max-w-2xl rounded-[32px] p-6 shadow-2xl border border-[var(--border-card)] animate-in slide-in-from-bottom-8 max-h-[90vh] flex flex-col overflow-y-auto">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold">Calendário Financeiro</h3>
            <p className="text-xs text-[var(--text-muted)]">Novembro de 2026</p>
          </div>
          <button onClick={onClose} className="p-2 bg-[var(--bg-app)] rounded-full text-[var(--text-muted)] hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEK_DAYS.map(w => (
            <div key={w} className="text-center text-[9px] font-bold text-[var(--text-muted)] uppercase py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 mb-6">
          {calendarCells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} />;
            const isSelected = selectedDay === day;
            const hasTx = transactions.some(t => {
              const txDate = t.date?.toDate ? t.date.toDate() : new Date(t.date);
              return txDate.getDate() === day && txDate.getMonth() === currentMonth;
            });

            return (
              <button
                key={day}
                onClick={() => { setSelectedDay(day); setSelectedItemId(''); setEditingData(null); }}
                className={
                  'aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ' +
                  (isSelected ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-lg scale-105' : 'bg-[var(--bg-app)] border border-[var(--border-card)] hover:border-[var(--accent)]')
                }
              >
                <span className="text-sm font-mono font-bold">{day}</span>
                {hasTx && !isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-0.5" />}
              </button>
            );
          })}
        </div>

        {selectedDay && dayData && (
          <div className="animate-in fade-in space-y-4">
            
            <div className="bg-gradient-to-br from-[var(--accent)]/20 to-[var(--bg-app)] border-2 border-[var(--accent)]/40 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] mb-1">Resumo Global até {selectedDay}/11</p>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1">Patrimônio Total</p>
                  <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">{FMT(dayData.totalBalance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)] mb-1">Rend. Acumulado</p>
                  <p className="text-lg font-mono font-bold text-[var(--trend-up)]">+{FMT(dayData.totalYield)}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 block">
                Visualizar / Editar
              </label>
              <select 
                value={selectedItemId} 
                onChange={handleSelectItem}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-sm font-medium focus:border-[var(--accent)] outline-none cursor-pointer"
              >
                <option value="" disabled>Selecione um item...</option>
                <optgroup label="Ativos (Saldos)">
                  {assets.map(a => (
                    <option key={a.id} value={`asset-${a.id}`}>{a.name}</option>
                  ))}
                </optgroup>
                {dayData.dayTxList.length > 0 && (
                  <optgroup label="Lançamentos do Dia">
                    {dayData.dayTxList.map((t: any) => (
                      <option key={t.id} value={`tx-${t.id}`}>
                        {t.type === 'in' ? '[+]' : '[-]'} {t.label} - {FMT(t.value)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {editingData && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-4 border-b border-[var(--border-card)] pb-2">
                  <Edit3 size={16} className="text-[var(--accent)]" />
                  <h4 className="text-sm font-bold">{editingData.name || editingData.label}</h4>
                </div>

                {editingData.isAsset ? (
                  <div className="space-y-4">
                    <div className="bg-[var(--bg-app)] p-3 rounded-xl flex justify-between items-center">
                      <div>
                        <p className="text-[9px] uppercase text-[var(--text-muted)]">Saldo em {selectedDay}/11</p>
                        <p className="text-sm font-mono font-bold">{FMT(dayData.assetSnapshots[editingData.id]?.balance || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase text-[var(--text-muted)]">Rend. no Mês</p>
                        <p className="text-sm font-mono font-bold text-[var(--trend-up)]">+{FMT(dayData.assetSnapshots[editingData.id]?.yield || 0)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] uppercase text-[var(--text-muted)] block mb-1">Saldo Base</label>
                        <input type="number" value={editingData.manualBalance || editingData.currentValue || editingData.value} onChange={e => setEditingData({...editingData, manualBalance: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase text-[var(--text-muted)] block mb-1">Rend. Dia Útil</label>
                        <input type="number" value={editingData.manualDailyYield || editingData.dailyYield} onChange={e => setEditingData({...editingData, manualDailyYield: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-sm font-mono" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] uppercase text-[var(--text-muted)] block mb-1">Descrição</label>
                      <input type="text" value={editingData.label} onChange={e => setEditingData({...editingData, label: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] uppercase text-[var(--text-muted)] block mb-1">Valor</label>
                        <input type="number" value={editingData.value} onChange={e => setEditingData({...editingData, value: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase text-[var(--text-muted)] block mb-1">Tipo</label>
                        <select value={editingData.type} onChange={e => setEditingData({...editingData, type: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-sm">
                          <option value="in">Entrada</option>
                          <option value="out">Saída</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-4">
                  <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-app)] rounded-xl font-bold text-xs hover:opacity-90">
                    <Save size={14} /> Salvar Alterações
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
