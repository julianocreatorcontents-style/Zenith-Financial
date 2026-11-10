import React from 'react';
import { Palette, Globe, ShieldCheck, Sparkles } from 'lucide-react';
import type { MasterStates } from '../../types/app';

export interface GlobalSettingsSectionProps {
  masterStates: MasterStates;
  onUpdateMaster: (field: keyof MasterStates, value: MasterStates[keyof MasterStates]) => void;
  showThemes?: boolean;
  showLanguage?: boolean;
  showPrivacy?: boolean;
  showAiInsights?: boolean;
}

export const GlobalSettingsSection: React.FC<GlobalSettingsSectionProps> = ({
  masterStates,
  onUpdateMaster,
  showThemes = true,
  showLanguage = true,
  showPrivacy = true,
  showAiInsights = true,
}) => {
  return (
    <div className="space-y-3">
      {/* 🎨 Temas Visuais */}
      {showThemes && (
        <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex flex-col gap-3 border border-[var(--border-card)]">
          <div className="flex items-center gap-3">
            <Palette size={18} className="text-[var(--accent)]" />
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              Temas Visuais
            </p>
          </div>
          <div className="flex gap-1 bg-[var(--bg-app)] p-1 rounded-xl">
            {(['Claro', 'Escuro', 'Contraste'] as const).map(t_mode => (
              <button
                key={t_mode}
                onClick={() => onUpdateMaster('tema_global', t_mode)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${
                  masterStates.tema_global === t_mode
                    ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-lg shadow-[var(--accent)]/20'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t_mode}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🌐 Idioma */}
      {showLanguage && (
        <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex items-center justify-between border border-[var(--border-card)]">
          <div className="flex items-center gap-3">
            <Globe size={18} className="text-[var(--accent)]" />
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              Idioma
            </p>
          </div>
          <select
            value={masterStates.idioma}
            onChange={(e) => onUpdateMaster('idioma', e.target.value)}
            className="bg-[var(--bg-app)] border-none rounded-xl text-[10px] font-bold px-3 py-2 outline-none cursor-pointer text-[var(--text-primary)]"
          >
            <option>Português (Brasil)</option>
            <option>English (US)</option>
            <option>Español</option>
          </select>
        </div>
      )}

      {/* 🔒 Modo Privacidade */}
      {showPrivacy && (
        <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex items-center justify-between border border-[var(--border-card)]">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-[var(--accent)]" />
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              Privacidade
            </p>
          </div>
          <button
            onClick={() => onUpdateMaster('modo_privacidade', !masterStates.modo_privacidade)}
            className={`w-12 h-6 rounded-full transition-all relative ${
              masterStates.modo_privacidade ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-hover)]'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                masterStates.modo_privacidade ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* ✨ Insights IA Master Switch */}
      {showAiInsights && (
        <div className="bg-[var(--bg-card)] rounded-[24px] p-4 flex items-center justify-between border border-[var(--border-card)]">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-[var(--accent)]" />
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              Insights IA Global
            </p>
          </div>
          <button
            onClick={() => onUpdateMaster('insights_ia_ativo', !masterStates.insights_ia_ativo)}
            className={`w-12 h-6 rounded-full transition-all relative ${
              masterStates.insights_ia_ativo ? 'bg-[var(--accent)]' : 'bg-[var(--bg-card-hover)]'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                masterStates.insights_ia_ativo ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
};

export default GlobalSettingsSection;
