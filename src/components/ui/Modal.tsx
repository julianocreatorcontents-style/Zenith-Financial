import { useId } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import Overlay, { OVERLAY_Z_INDEX } from './Overlay';

type ModalVariant = 'center' | 'sheet';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  headerAction?: ReactNode;
  footer?: ReactNode;
  variant?: ModalVariant;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showClose?: boolean;
  showHandle?: boolean;
  ariaLabel?: string;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  zIndex?: number;
};

const joinClasses = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export default function Modal({
  open,
  onClose,
  children,
  title,
  subtitle,
  eyebrow,
  icon,
  headerAction,
  footer,
  variant = 'center',
  closeOnBackdrop = true,
  closeOnEscape = true,
  showClose = true,
  showHandle = false,
  ariaLabel,
  closeLabel = 'Fechar',
  className,
  bodyClassName,
  zIndex = variant === 'sheet' ? OVERLAY_Z_INDEX.sheet : OVERLAY_Z_INDEX.modal,
}: ModalProps) {
  const titleId = useId();

  const hasHeader = Boolean(title || subtitle || eyebrow || icon || headerAction || showClose);

  return (
    <Overlay
      open={open}
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      labelledBy={title ? titleId : undefined}
      label={title ? undefined : ariaLabel}
      zIndex={zIndex}
    >
      <div
        className={joinClasses(
          'flex h-full w-full justify-center',
          variant === 'center'
            ? 'items-end p-0 sm:items-center sm:p-6'
            : 'items-end p-0'
        )}
      >
        <motion.div
          initial={{
            opacity: 0,
            y: variant === 'sheet' ? '100%' : 24,
            scale: variant === 'sheet' ? 1 : 0.98,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 30, stiffness: 340 }}
          className={joinClasses(
            'relative mx-auto flex w-full max-w-md flex-col overflow-hidden border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xl',
            variant === 'center'
              ? 'max-h-[100dvh] rounded-t-3xl sm:max-h-[90dvh] sm:rounded-3xl'
              : 'max-h-[100dvh] rounded-t-3xl',
            className
          )}
        >
          {showHandle && (
            <div className="flex shrink-0 justify-center pt-[calc(0.75rem+env(safe-area-inset-top))]">
              <div className="h-1.5 w-12 rounded-full bg-[var(--border-card)]" />
            </div>
          )}

          {hasHeader && (
            <div
              className={joinClasses(
                'flex shrink-0 items-start gap-3 border-b border-[var(--border-card)] px-4 pb-4 sm:px-6 sm:pb-5',
                showHandle
                  ? 'pt-3'
                  : 'pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-6'
              )}
            >
              {icon && (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] sm:h-14 sm:w-14">
                  {icon}
                </div>
              )}

              <div className="min-w-0 flex-1">
                {eyebrow && (
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--accent)]">
                    {eyebrow}
                  </p>
                )}
                {title && (
                  <h2
                    id={titleId}
                    className="truncate text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl"
                  >
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="mt-1 truncate text-xs text-[var(--text-muted)] sm:text-sm">{subtitle}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {headerAction}
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    className="rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)]"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            className={joinClasses(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6 sm:pt-5',
              bodyClassName
            )}
          >
            {children}
          </div>

          {footer && (
            <div className="shrink-0 border-t border-[var(--border-card)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </Overlay>
  );
}
