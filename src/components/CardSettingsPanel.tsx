import { useState } from 'react';

export interface VisualSettings {
  isCustomEnabled: boolean;
  chartHeight: 'h-32' | 'h-48' | 'h-64' | 'h-80';
  lineThickness: 0.5 | 1 | 1.5 | 2;
  showAxes: boolean;
  showProjections: boolean;
  accentColor: string;
  fontFamily: string;
  cardBgOpacity: number;
  textColor: string;
  textSizeScale: number;
  textOpacity: number;
}

interface Props {
  settings: VisualSettings;
  onChange: (newSettings: VisualSettings) => void;
}

export function CardSettingsPanel({ settings, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-[#0a1a12] border border-[#00FFA3]/30 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[#00FFA3] text-sm font-bold uppercase tracking-widest">Customizacao Visual</h3>
            <p className="text-[10px] text-white/40 mt-1">Ativa o tema customizado nos cards.</p>
          </div>
          <button
            onClick={() => onChange({ ...settings, isCustomEnabled: !settings.isCustomEnabled })}
            className={`w-12 h-6 rounded-full transition-colors relative ${settings.isCustomEnabled ? 'bg-[#00FFA3]' : 'bg-white/20'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.isCustomEnabled ? 'left-6.5' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      <div className={`transition-opacity duration-300 ${settings.isCustomEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
        <div className="bg-[#0a1a12] border border-[#00FFA3]/30 rounded-2xl p-4 shadow-lg">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Cor de Destaque</label>
              <div className="flex items-center gap-2 bg-[#050505] border border-white/10 rounded-lg p-1.5">
                <input type="color" value={settings.accentColor} onChange={(e) => onChange({ ...settings, accentColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                <span className="text-xs text-white font-mono uppercase">{settings.accentColor}</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Cor do Texto</label>
              <div className="flex items-center gap-2 bg-[#050505] border border-white/10 rounded-lg p-1.5">
                <input type="color" value={settings.textColor} onChange={(e) => onChange({ ...settings, textColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                <span className="text-xs text-white font-mono uppercase">{settings.textColor}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Altura do Grafico</label>
              <select value={settings.chartHeight} onChange={(e) => onChange({ ...settings, chartHeight: e.target.value as any })} className="w-full bg-[#050505] border border-white/10 rounded-lg p-2 text-xs text-white outline-none">
                <option value="h-32">Compacto</option>
                <option value="h-48">Medio</option>
                <option value="h-64">Grande</option>
                <option value="h-80">Gigante</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Linha do Grafico</label>
              <select value={settings.lineThickness} onChange={(e) => onChange({ ...settings, lineThickness: Number(e.target.value) as any })} className="w-full bg-[#050505] border border-white/10 rounded-lg p-2 text-xs text-white outline-none">
                <option value={0.5}>Ultra Fina</option>
                <option value={1}>Fina</option>
                <option value={1.5}>Media</option>
                <option value={2}>Grossa</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Fonte</label>
              <select value={settings.fontFamily} onChange={(e) => onChange({ ...settings, fontFamily: e.target.value })} className="w-full bg-[#050505] border border-white/10 rounded-lg p-2 text-xs text-white outline-none">
                <option value="sans-serif">Sans-serif</option>
                <option value="monospace">Monospace</option>
                <option value="serif">Serif</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Tamanho (Escala)</label>
              <input type="range" min="0.8" max="1.5" step="0.1" value={settings.textSizeScale} onChange={(e) => onChange({ ...settings, textSizeScale: Number(e.target.value) })} className="w-full accent-[#00FFA3]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Opacidade Fundo ({Math.round(settings.cardBgOpacity * 100)}%)</label>
              <input type="range" min="0.1" max="1" step="0.1" value={settings.cardBgOpacity} onChange={(e) => onChange({ ...settings, cardBgOpacity: Number(e.target.value) })} className="w-full accent-[#00FFA3]" />
            </div>
            <div>
              <label className="block text-[10px] text-white/50 mb-1 uppercase">Opacidade Texto ({Math.round(settings.textOpacity * 100)}%)</label>
              <input type="range" min="0.1" max="1" step="0.1" value={settings.textOpacity} onChange={(e) => onChange({ ...settings, textOpacity: Number(e.target.value) })} className="w-full accent-[#00FFA3]" />
            </div>
          </div>
          <div className="flex gap-4 mt-4 pt-4 border-t border-white/10">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.showAxes} onChange={(e) => onChange({ ...settings, showAxes: e.target.checked })} className="accent-[#00FFA3]" />
              <span className="text-[10px] text-white/70 uppercase">Eixos X/Y</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.showProjections} onChange={(e) => onChange({ ...settings, showProjections: e.target.checked })} className="accent-[#00FFA3]" />
              <span className="text-[10px] text-white/70 uppercase">Projecoes</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
