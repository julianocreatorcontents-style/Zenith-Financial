import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Edit3, Save } from 'lucide-react';
import { parseTransactionAmount, parseTransactionDate } from '../../lib/finance';

const FMT = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const WEEK_DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addDays = (value: Date, amount: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
};

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
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const shortMonth = String(currentMonth + 1).padStart(2, '0');

  const changeMonth = (offset: number) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    setSelectedDay(null);
    setSelectedItemId('');
    setEditingData(null);
  };

  const dayData = useMemo(() => {
    if (selectedDay === null) return null;

    const targetDay = startOfDay(new Date(currentYear, currentMonth, selectedDay));
    const today = startOfDay(new Date());
    const monthStart = new Date(currentYear, currentMonth, 1);

    let totalYield = 0;
    const assetSnapshots: Record<string, { balance: number, yield: number }> = {};
    const dayTxList: any[] = [];

    const txDate = (tx: any) => parseTransactionDate(tx?.date ?? tx?.createdAt);

    const isBusinessDays = (asset: any) => {
      const convention = asset?.investmentPolicy?.dayCountConvention;
      if (convention === 'BUSINESS_DAYS_252') return true;
      if (convention === 'CALENDAR_DAYS_365') return false;
      return String(asset?.name || '').toLowerCase().includes('mercado pago');
    };

    const yieldForDay = (asset: any, day: Date) => {
      const daily = Number(asset?.dailyYield ?? asset?.manualDailyYield ?? 0);
      const weekend = Number(asset?.manualWeekendYield ?? 0);
      const dayOfWeek = day.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (isBusinessDays(asset)) return isWeekend ? 0 : daily;
      return isWeekend && Number.isFinite(weekend) && weekend > 0 ? weekend : daily;
    };

    const flowForAsset = (tx: any) => {
      const value = parseTransactionAmount(tx?.value);
      const type = String(tx?.type ?? '').toLowerCase().trim();
      if (['in', 'entrada', 'receita', 'credito', 'yield', 'rendimento'].includes(type)) return value;
      if (['out', 'saida', 'saída', 'despesa', 'debito'].includes(type)) return -value;
      return 0;
    };

    transactions.forEach(tx => {
      const date = txDate(tx);
      if (date && date.getFullYear() === currentYear && date.getMonth() === currentMonth && date.getDate() === selectedDay) {
        dayTxList.push(tx);
      }
    });

    assets.forEach(asset => {
      const hasManualBalance =
        asset?.manualBalance !== undefined &&
        asset?.manualBalance !== null &&
        asset?.manualBalance !== '' &&
        Number.isFinite(Number(asset.manualBalance));
      const snapshotRaw = hasManualBalance
        ? (parseTransactionDate(asset.manualBalanceDate) ??
           parseTransactionDate(asset.investmentStartDate) ??
           parseTransactionDate(asset.createdAt))
        : null;
      const snapshot = startOfDay(snapshotRaw ?? today);
      const base = hasManualBalance ? Number(asset.manualBalance) : Number(asset?.currentValue ?? asset?.value ?? 0);
      const hasProjectedYield = Number(asset?.dailyYield ?? asset?.manualDailyYield ?? 0) > 0;

      let balance = base;
      let monthYield = 0;

      if (targetDay > snapshot) {
        for (let day = addDays(snapshot, 1); day <= targetDay; day = addDays(day, 1)) {
          const gain = yieldForDay(asset, day);
          balance += gain;
          if (day >= monthStart) monthYield += gain;
        }

        transactions.forEach(tx => {
          if (!tx?.assetId || tx.assetId !== asset.id) return;
          const date = txDate(tx);
          if (!date) return;
          const day = startOfDay(date);
          if (day <= snapshot || day > targetDay) return;
          const type = String(tx?.type ?? '').toLowerCase().trim();
          if ((type === 'yield' || type === 'rendimento') && hasProjectedYield) return;
          balance += flowForAsset(tx);
        });
      }

      assetSnapshots[asset.id] = { balance, yield: monthYield };
      totalYield += monthYield;
    });

    const totalBalance = Object.values(assetSnapshots).reduce((acc, a) => acc + a.balance, 0);

    return { totalBalance, totalYield, assetSnapshots, dayTxList };
  }, [selectedDay, assets, transactions, currentYear, currentMonth]);

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

  const toNumber = (value: any, fallback = 0) => {
    if (value === '' || value === null || value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const handleSave = async () => {
    if (!editingData) return;
    if (editingData.isAsset) {
      const fallbackBalance = toNumber(editingData.currentValue, toNumber(editingData.value));
      await onUpdateAsset(editingData.id, {
        manualBalance: toNumber(editingData.manualBalance, fallbackBalance),
        manualBalanceDate: selectedDay !== null
          ? new Date(currentYear, currentMonth, selectedDay, 12, 0, 0)
          : new Date(),
        manualDailyYield: toNumber(editingData.manualDailyYield, toNumber(editingData.dailyYield)),
        manualWeekendYield: editingData.manualWeekendYield === '' || editingData.manualWeekendYield === null || editingData.manualWeekendYield === undefined
          ? null
          : toNumber(editingData.manualWeekendYield)
      });
    } else {
      await onUpdateTransaction(editingData, {
        label: editingData.label,
        value: parseTransactionAmount(editingData.value),
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
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => changeMonth(-1)}
                className="rounded-full bg-[var(--bg-app)] p-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
                aria-label="Mês anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <p className="text-xs capitalize text-[var(--text-muted)]">{monthLabel}</p>
              <button
                onClick={() => changeMonth(1)}
                className="rounded-full bg-[var(--bg-app)] p-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
                aria-label="Próximo mês"
              >
                <ChevronRight size={14} />
              </button>
            </div>
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
              const txDate = parseTransactionDate(t.date ?? t.createdAt);
              if (!txDate) return false;
              return txDate.getDate() === day && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] mb-1">Resumo Global até {selectedDay}/{shortMonth}</p>
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
                        {t.type === 'out' ? '[-]' : '[+]'} {t.label} - {FMT(t.value)}
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
                        <p className="text-[9px] uppercase text-[var(--text-muted)]">Saldo em {selectedDay}/{shortMonth}</p>
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
                        <input type="number" value={editingData.manualBalance ?? editingData.currentValue ?? editingData.value ?? ''} onChange={e => setEditingData({...editingData, manualBalance: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase text-[var(--text-muted)] block mb-1">Rend. Dia Útil</label>
                        <input type="number" value={editingData.manualDailyYield ?? editingData.dailyYield ?? ''} onChange={e => setEditingData({...editingData, manualDailyYield: e.target.value})} className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-lg p-2 text-sm font-mono" />
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
                          <option value="yield">Rendimento</option>
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
