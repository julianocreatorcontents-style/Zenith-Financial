import React, { useState } from 'react';
import { ArrowLeft, Edit2, Trash2, Save } from 'lucide-react';
import Modal from '../../ui/Modal';
import type { Asset } from '../../../types/app';

export interface AssetModalProps {
  asset: Asset;
  onClose: () => void;
  privacyMode: boolean;
  onDelete: (id: string) => void;
  onSave: (id: string, data: Partial<Asset>) => void;
  language?: string;
}

export function EditAssetModal({
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
      const d = (rawStartDate as { toDate?: () => Date })?.toDate
        ? (rawStartDate as { toDate: () => Date }).toDate()
        : rawStartDate ? new Date(rawStartDate as string | number | Date) : new Date();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  })();
  const [startDateStr, setStartDateStr] = useState(initialDateStr);

  const handleSave = () => {
    if (!formData.name?.trim()) {
      alert(t('Por favor, insira um nome para o ativo.', 'Please enter a name for the asset.'));
      return;
    }
    if ((formData.value ?? 0) < 0) {
      alert(t('O valor não pode ser negativo.', 'The value cannot be negative.'));
      return;
    }
    const {
      id: _id,
      change: _change,
      currentValue: _currentValue,
      baseBalance: _baseBalance,
      accumulatedYield: _accumulatedYield,
      yieldSinceAnchor: _yieldSinceAnchor,
      dailyYield: _dailyYield,
      calculatedDailyYield: _calculatedDailyYield,
      daysInvested: _daysInvested,
      yieldPercent: _yieldPercent,
      yieldStartDate: _yieldStartDate,
      originalValue: _originalValue,
      monthEndValue: _monthEndValue,
      monthYieldRemaining: _monthYieldRemaining,
      ...updateData
    } = formData as Record<string, unknown>;

    if (startDateStr) {
      updateData.investmentStartDate = new Date(startDateStr + 'T12:00:00');
    }

    onSave(asset.id, updateData as Partial<Asset>);
  };

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={isEditing ? t('Editar Ativo', 'Edit Asset') : asset.name}
      subtitle={isEditing ? undefined : asset.type}
      ariaLabel={asset.name}
      headerAction={
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-app)] hover:text-[var(--accent)]"
          aria-label={isEditing ? t('Cancelar edição', 'Cancel editing') : t('Editar ativo', 'Edit asset')}
        >
          {isEditing ? <ArrowLeft size={20} /> : <Edit2 size={20} />}
        </button>
      }
    >
      <div className="space-y-6">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Nome', 'Name')}</label>
              <input
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Aporte Original (R$)', 'Original Deposit (R$)')}</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs font-bold">R$</span>
                <input
                  type="text"
                  value={(formData.valorInvestido ?? formData.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    const num = parseInt(val || '0', 10) / 100;
                    setFormData({ ...formData, valorInvestido: num, value: num });
                  }}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 pl-10 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">{t('Data do Aporte / Registro', 'Deposit / Registration Date')}</label>
              <input
                type="date"
                value={startDateStr}
                onChange={e => {
                  setStartDateStr(e.target.value);
                  setFormData({ ...formData, investmentStartDate: e.target.value ? new Date(e.target.value + 'T12:00:00') : new Date() });
                }}
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
                value={formData.detail || ''}
                onChange={e => setFormData({ ...formData, detail: e.target.value })}
                className="mt-1 w-full bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-3 text-[var(--text-primary)] text-base sm:text-sm focus:border-[var(--accent)] outline-none h-24"
              />
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => onDelete(asset.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--trend-down)]/10 py-4 text-xs font-bold uppercase tracking-widest text-[var(--trend-down)] transition-colors hover:bg-[var(--trend-down)]/20"
              >
                <Trash2 size={16} /> {t('Excluir', 'Delete')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-xs font-bold uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)]/80"
              >
                <Save size={16} /> {t('Salvar', 'Save')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-3xl font-mono tracking-tighter text-[var(--text-primary)] sm:text-4xl">
                {privacyMode ? '••••••' : (asset.currentValue ?? asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              {asset.change && <p className="text-xs font-bold text-[var(--accent)]">{asset.change} {t('no período', 'in period')}</p>}
            </div>

            {((asset.accumulatedYield && asset.accumulatedYield > 0) || (asset.dailyYield && asset.dailyYield > 0) || asset.daysInvested !== undefined) && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--bg-app)] p-3 border border-[var(--border-card)] text-left">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t('Saldo na Data Âncora', 'Anchor Balance')}</span>
                    <span className="text-xs font-mono font-bold text-[var(--text-primary)]">
                      {privacyMode ? '••••••' : (asset.baseBalance ?? asset.valorInvestido ?? asset.value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    {startDateStr && (
                      <span className="text-[9px] text-[var(--text-muted)] block mt-0.5">
                        {new Date(startDateStr + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t('Rendimento Somado', 'Yield Since Anchor')}</span>
                    <span className="text-xs font-mono font-bold text-[var(--accent)]">
                      {privacyMode ? '••••••' : (asset.yieldSinceAnchor ? `+${asset.yieldSinceAnchor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'R$ 0,00')}
                    </span>
                    <span className="text-[9px] text-[var(--accent)] block mt-0.5">
                      {asset.daysInvested ?? 0} {t('dias decorridos', 'days elapsed')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t('Rendimento Diário', 'Daily Yield')}</span>
                    <span className="text-xs font-mono font-bold text-[var(--accent)]">
                      {privacyMode ? '••••••' : (asset.dailyYield ? `+${asset.dailyYield.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia` : 'R$ 0,00/dia')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">{t('Projeção Fim do Mês', 'Month-End Projection')}</span>
                    <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">
                      {privacyMode ? '••••••' : (asset.monthEndValue ? (asset.monthEndValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00')}
                    </span>
                    {asset.monthYieldRemaining && asset.monthYieldRemaining > 0 ? (
                      <span className="text-[9px] text-[var(--text-muted)] block mt-0.5">
                        +{asset.monthYieldRemaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} {t('restantes', 'remaining')}
                      </span>
                    ) : null}
                  </div>
                </div>

                {asset.valorInvestido && asset.baseBalance && asset.valorInvestido < asset.baseBalance && (
                  <div className="flex justify-between items-center px-3 py-1.5 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20 text-[10px]">
                    <span className="text-[var(--text-muted)]">{t('Aporte Inicial:', 'Initial Deposit:')} <strong className="text-[var(--text-primary)] font-mono">{asset.valorInvestido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
                    <span className="text-[var(--accent)] font-bold">{t('Rendimento Total:', 'Total Yield:')} +{(asset.accumulatedYield ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                )}
              </div>
            )}

            <div className="h-px bg-[var(--border-card)]" />
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{asset.detail}</p>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="w-full rounded-2xl bg-[var(--text-primary)] py-4 text-[10px] font-black uppercase tracking-widest text-[var(--bg-app)] transition-colors hover:bg-[var(--accent)] sm:py-5"
            >
              {t('Editar Ativo', 'Edit Asset')}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export const AssetModal = EditAssetModal;
export default EditAssetModal;
