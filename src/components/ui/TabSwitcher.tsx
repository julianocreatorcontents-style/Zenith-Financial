export interface TabOption<T extends string = string> {
  id: T;
  label: string;
}

export interface TabSwitcherProps<T extends string = string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const TabSwitcher = <T extends string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: TabSwitcherProps<T>) => {
  const paddingClass = size === 'sm' ? 'px-2.5 py-1.5 text-[9px]' : 'px-3 py-2 text-[10px]';

  return (
    <div
      role="tablist"
      className={`flex gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl w-full sm:w-auto ${className}`.trim()}
    >
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.id)}
            className={`flex-1 sm:flex-none ${paddingClass} rounded-xl font-bold uppercase tracking-widest transition-all active:scale-95 ${
              isActive
                ? 'bg-[var(--accent)] text-[var(--bg-app)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default TabSwitcher;
