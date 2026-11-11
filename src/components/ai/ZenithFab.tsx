import React from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';

interface ZenithFabProps {
  onClick: () => void;
  isOpen?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function ZenithFab({
  onClick,
  isOpen = false,
  className = '',
  ariaLabel = 'Abrir Zenith IA Express',
}: ZenithFabProps) {
  const content = (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={isOpen}
      className={`fixed bottom-28 right-4 z-50 w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--bg-app)] flex items-center justify-center shadow-[0_8px_25px_rgba(0,255,163,0.35)] hover:scale-105 active:scale-95 transition-transform duration-200 pointer-events-auto ${className}`}
    >
      <Sparkles
        size={24}
        className={`transition-transform duration-300 ${isOpen ? 'rotate-90 scale-110' : 'animate-pulse'}`}
      />
    </button>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }

  return content;
}

export default ZenithFab;
