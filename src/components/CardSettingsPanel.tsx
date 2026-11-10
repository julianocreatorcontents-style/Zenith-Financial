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
  const currentAccent = settings.accentColor || '#00FFA3';
  const currentOpacity = typeof settings.cardBgOpacity === 'number' ? settings.cardBgOpacity : 0.8;

  return (
    <div className="space-y-4">
      {/* Switch Master de Customização */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[var(--accent)] text-sm font-bold uppercase tracking-widest">Customização Visual</h3>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Ativa as cores e opacidade customizadas nos cards.</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...settings, isCustomEnabled: !settings.isCustomEnabled })}
            className={`w-12 h-6 rounded-full transition-colors relative ${settings.isCustomEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-app)] border border-[var(--border-card)]'}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                settings.isCustomEnabled ? 'left-6.5' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Controles Ativos (Somente os que realmente produzem efeito no app) */}
      <div className={`transition-opacity duration-300 ${settings.isCustomEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-4 shadow-lg space-y-4">
          {/* Cor de Destaque */}
          <div>
            <label className="block text-[10px] text-[var(--text-secondary)] mb-1 uppercase font-bold tracking-widest">
              Cor de Destaque (Accent)
            </label>
            <div className="flex items-center gap-3 bg-[var(--bg-app)] border border-[var(--border-card)] rounded-xl p-2">
              <input
                type="color"
                value={currentAccent}
                onChange={(e) => onChange({ ...settings, accentColor: e.target.value })}
                className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border-0"
              />
              <span className="text-xs text-[var(--text-primary)] font-mono uppercase font-bold">{currentAccent}</span>
            </div>
          </div>

          {/* Opacidade de Fundo dos Cards */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-widest">
                Opacidade de Fundo dos Cards
              </label>
              <span className="text-xs font-mono text-[var(--text-primary)]">{Math.round(currentOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              value={currentOpacity}
              onChange={(e) => onChange({ ...settings, cardBgOpacity: Number(e.target.value) })}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
