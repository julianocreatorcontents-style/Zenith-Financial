import React from 'react';
import { GalleryHorizontal, LayoutGrid, List, Check } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';

interface HomeLayoutSelectorProps {
  language?: string;
}

export type HomeLayoutType = 'lista' | 'grade' | 'carrossel';

export function HomeLayoutSelector({ language }: HomeLayoutSelectorProps) {
  const t = (pt: string, en: string) => (language === 'en-US' ? en : pt);
  const [homeLayout, setHomeLayout] = usePersistentState<HomeLayoutType>('zenith_home_layout', 'carrossel');

  const options: Array<{
    id: HomeLayoutType;
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }> = [
    {
      id: 'carrossel',
      label: t('Carrossel Dinâmico', 'Dynamic Carousel'),
      description: t(
        'Navegação horizontal fluida com foco nos indicadores principais.',
        'Smooth horizontal swipe focused on key indicators.'
      ),
      icon: GalleryHorizontal,
    },
    {
      id: 'grade',
      label: t('Grade em Colunas', 'Column Grid'),
      description: t(
        'Visualização lado a lado para rápida comparação das métricas.',
        'Side-by-side view for quick metric comparison.'
      ),
      icon: LayoutGrid,
    },
    {
      id: 'lista',
      label: t('Lista Vertical', 'Vertical List'),
      description: t(
        'Exibição compacta empilhada para máxima densidade de dados.',
        'Compact stacked view for maximum data density.'
      ),
      icon: List,
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
          {t('Layout dos Cards de Métricas', 'Metric Cards Layout')}
        </h3>
        <p className="text-[11px] text-[var(--text-muted)]">
          {t(
            'Escolha como deseja visualizar os indicadores da página inicial.',
            'Choose how you want to view the indicators on the home page.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {options.map(({ id, label, description, icon: Icon }) => {
          const isSelected = homeLayout === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setHomeLayout(id)}
              aria-pressed={isSelected}
              className={`w-full flex items-start gap-3.5 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? 'bg-[var(--accent)]/10 border-[var(--accent)] shadow-sm shadow-[var(--accent)]/20'
                  : 'bg-[var(--bg-app)] border-[var(--border-card)] hover:border-[var(--accent)]/40 text-[var(--text-secondary)]'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  isSelected
                    ? 'bg-[var(--accent)] text-[var(--bg-app)]'
                    : 'bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--text-muted)]'
                }`}
              >
                <Icon size={18} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {label}
                  </span>
                  {isSelected && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] bg-[var(--accent)]/15 px-2 py-0.5 rounded-full">
                      <Check size={11} /> {t('Ativo', 'Active')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                  {description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default HomeLayoutSelector;
