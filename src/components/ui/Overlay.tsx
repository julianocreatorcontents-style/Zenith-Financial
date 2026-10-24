import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

export const OVERLAY_Z_INDEX = {
  modal: 100,
  sheet: 110,
  drawer: 120,
  toast: 130,
} as const;

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
  labelledBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  backdropClassName?: string;
  className?: string;
  zIndex?: number;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const overlayStack: symbol[] = [];
let bodyLockCount = 0;
let previousBodyOverflow = '';
let previousBodyPaddingRight = '';

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  bodyLockCount += 1;
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  }
}

function getFocusable(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0
  );
}

export default function Overlay({
  open,
  onClose,
  children,
  label,
  labelledBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  backdropClassName = '',
  className = '',
  zIndex = OVERLAY_Z_INDEX.modal,
}: OverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  useEffect(() => {
    if (!open) return;

    const overlayId = Symbol('overlay');
    overlayStack.push(overlayId);
    lockBodyScroll();

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      layerRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== overlayId) return;

      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable(layerRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        layerRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || activeElement === layerRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);

      const stackIndex = overlayStack.indexOf(overlayId);
      if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);

      unlockBodyScroll();

      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={layerRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={`fixed inset-0 outline-none ${className}`}
          style={{ zIndex }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <div
            aria-hidden="true"
            className={`absolute inset-0 bg-[var(--bg-app)]/80 backdrop-blur-md ${backdropClassName}`}
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <div className="relative flex h-[100dvh] w-full">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
