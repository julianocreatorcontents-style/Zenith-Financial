export type GlobalTheme = 'Escuro' | 'Claro' | 'Contraste' | 'dark' | 'light' | 'high-contrast';

const THEME_MAP: Record<string, 'dark' | 'light' | 'high-contrast'> = {
  escuro: 'dark',
  dark: 'dark',
  claro: 'light',
  light: 'light',
  contraste: 'high-contrast',
  'high-contrast': 'high-contrast',
};

export function normalizeTheme(theme: string | undefined): 'dark' | 'light' | 'high-contrast' {
  if (!theme) return 'dark';
  return THEME_MAP[theme.toLowerCase()] || 'dark';
}

export function applyTheme(themeName: string | undefined): 'dark' | 'light' | 'high-contrast' {
  const resolved = normalizeTheme(themeName);
  if (typeof document !== 'undefined' && document.documentElement) {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'high-contrast');
    root.classList.add(resolved);
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-mantine-color-scheme', resolved === 'light' ? 'light' : 'dark');

    if (resolved === 'light') {
      root.style.setProperty('--bg-app', '#F5F5F5');
      root.style.setProperty('--bg-card', '#FFFFFF');
      root.style.setProperty('--bg-card-hover', '#FAFAFA');
      root.style.setProperty('--text-primary', '#000000');
      root.style.setProperty('--text-secondary', '#666666');
      root.style.setProperty('--text-muted', '#888888');
      root.style.setProperty('--border-card', '#E5E5E5');
      root.style.setProperty('--accent', '#00C881');
      root.style.setProperty('--trend-up', '#00C881');
      root.style.setProperty('--trend-down', '#D00000');
      root.style.setProperty('--trend-yield', '#7B2CBF');
    } else if (resolved === 'high-contrast') {
      root.style.setProperty('--bg-app', '#000000');
      root.style.setProperty('--bg-card', '#000000');
      root.style.setProperty('--bg-card-hover', '#111111');
      root.style.setProperty('--text-primary', '#FFFFFF');
      root.style.setProperty('--text-secondary', '#FFFF00');
      root.style.setProperty('--text-muted', '#FFFF00');
      root.style.setProperty('--border-card', '#FFFFFF');
      root.style.setProperty('--accent', '#00FF00');
      root.style.setProperty('--trend-up', '#00FF00');
      root.style.setProperty('--trend-down', '#FF0000');
      root.style.setProperty('--trend-yield', '#FF00FF');
    } else {
      // Escuro / dark (default)
      root.style.removeProperty('--bg-app');
      root.style.removeProperty('--bg-card');
      root.style.removeProperty('--bg-card-hover');
      root.style.removeProperty('--text-primary');
      root.style.removeProperty('--text-secondary');
      root.style.removeProperty('--text-muted');
      root.style.removeProperty('--border-card');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--trend-up');
      root.style.removeProperty('--trend-down');
      root.style.removeProperty('--trend-yield');
    }
  }
  return resolved;
}
