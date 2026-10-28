import React from 'react';

interface AssetDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any | null;
  language?: string;
}

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function AssetDetailsModal({ isOpen, onClose, data, language = 'pt-BR' }: AssetDetailsModalProps) {
  if (!isOpen || !data) return null;

  const isEn = language === 'en-US';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] w-full max-w-md rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{data.name}</h2>
            <span className="text-xs text-[var(--accent)] font-bold">{data.rateStr}</span>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕</button>
        </div>

        <div className="space-y-6">
          <div className="bg-[var(--bg-app)] rounded-2xl p-4 border border-[var(--border-card)]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Saldo Atual</span>
              <span className="text-lg font-bold font-mono text-[var(--text-primary)]">{formatBRL(data.balance)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Rende por dia</span>
              <span className="text-lg font-bold font-mono text-[var(--accent)]">+{formatBRL(data.showBoth ? data.dailyLiquido : data.dailyBruto)}</span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Projeções de Rendimento</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 border-b border-[var(--border-card)]">
                <span className="text-sm text-[var(--text-primary)]">Fim do mês</span>
                <div className="text-right">
                  <div className="text-sm font-bold text-[var(--accent)] font-mono">+{formatBRL(data.profitMonth)}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">Saldo: {formatBRL(data.pMonthNet)}</div>
                </div>
              </div>

              <div className="flex justify-between items-center p-3">
                <span className="text-sm text-[var(--text-primary)]">1 ano</span>
                <div className="text-right">
                  <div className="text-sm font-bold text-[var(--accent)] font-mono">+{formatBRL(data.profitYear)}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">Saldo: {formatBRL(data.p1YearNet)}</div>
                </div>
              </div>
            </div>
          </div>

          {data.taxAlerts && data.taxAlerts.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Impostos e Alertas</h3>
              <div className="space-y-2">
                {data.taxAlerts.map((alert: any, idx: number) => (
                  <div key={idx} className="rounded-xl bg-[var(--bg-app)] border border-[var(--border-card)] p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{alert.type === 'IOF_ZERO' ? '🛡️' : '📉'}</span>
                      <span className="text-xs font-bold text-[var(--text-primary)]">{alert.title[isEn ? 'en' : 'pt']}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] leading-tight">{alert.description[isEn ? 'en' : 'pt']}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center pt-4 border-t border-[var(--border-card)]">
            <p className="text-[10px] text-[var(--text-muted)] italic">
              {data.showBoth ? `Valores Líquidos` : `Valores Brutos`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
