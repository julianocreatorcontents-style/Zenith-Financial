import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <Loader2 className="animate-spin text-[var(--accent)]" size={28} />
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {label ?? 'Carregando...'}
      </p>
    </div>
  );
}
