import {
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 'dialog' | 'drawer-right' | 'sheet-bottom' */
  variant?: 'dialog' | 'drawer-right';
  size?: 'sm' | 'md' | 'lg';
}

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'dialog',
  size = 'md',
}: OverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    if (dialog) {
      const focusable = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && dialog) {
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass =
    variant === 'drawer-right'
      ? 'w-full max-w-md'
      : { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  const containerClass =
    variant === 'drawer-right'
      ? 'fixed inset-y-0 right-0 z-50 flex animate-slide-in-right'
      : 'fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in';

  return (
    <div className={containerClass} role="presentation">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative ${sizeClass} bg-surface shadow-drawer rounded-card flex flex-col max-h-full ${
          variant === 'drawer-right' ? 'h-full w-full' : 'w-full max-h-[90vh]'
        }`}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="text-sm text-ink-secondary mt-1">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  /** Typed confirmation — user must type this exact string to enable confirm */
  confirmationText?: string;
  impactSummary?: string;
}

import { useState } from 'react';

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive,
  confirmationText,
  impactSummary,
}: ConfirmationDialogProps) {
  const [typed, setTyped] = useState('');

  const canConfirm = confirmationText ? typed === confirmationText : true;

  return (
    <Overlay
      open={open}
      onClose={onCancel}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink">{description}</p>
      {impactSummary && (
        <div className="mt-4 rounded-control bg-surface-subtle p-4">
          <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
            Impact
          </p>
          <p className="text-sm text-ink mt-1">{impactSummary}</p>
        </div>
      )}
      {confirmationText && (
        <div className="mt-4">
          <p className="text-sm text-ink mb-2">
            Type <strong className="font-semibold">{confirmationText}</strong> to confirm:
          </p>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full rounded-control border border-border px-3 py-2.5 text-ink focus:border-focus focus:ring-2 focus:ring-focus/20"
            aria-label={`Type ${confirmationText} to confirm`}
            autoComplete="off"
          />
        </div>
      )}
    </Overlay>
  );
}

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 animate-slide-up rounded-card shadow-elevated border border-border bg-surface p-4 max-w-sm"
    >
      <div className="flex items-start gap-3">
        <p className="text-sm text-ink flex-1">{message}</p>
        <IconButton label="Dismiss" size="sm" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}
