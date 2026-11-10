import type { ReactNode } from 'react';

export interface ChartTooltipPayloadItem {
  value?: string | number;
  name?: string | number;
  payload?: Record<string, unknown>;
  color?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string | number;
  title?: ReactNode;
  formatter?: (value: string | number | undefined, name?: string | number) => ReactNode;
  children?: ReactNode;
}

export function ChartTooltip({ active, payload, label, title, formatter, children }: ChartTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  if (children) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
        {children}
      </div>
    );
  }

  const primaryItem = payload[0];

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-card)] p-3 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90 min-w-[120px]">
      {(title || label) && (
        <p className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1">
          {title ?? label}
        </p>
      )}
      <p className="text-base font-mono font-bold text-[var(--text-primary)]">
        {formatter && primaryItem.value !== undefined
          ? formatter(primaryItem.value, primaryItem.name)
          : String(primaryItem.value ?? '')}
      </p>
    </div>
  );
}

export default ChartTooltip;
