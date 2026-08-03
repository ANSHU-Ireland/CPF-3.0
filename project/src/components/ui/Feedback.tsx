import type { ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { isApiError } from '@/lib/api';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const toneConfig: Record<AlertTone, { icon: typeof Info; bg: string; border: string; text: string }> = {
  info: { icon: Info, bg: 'bg-status-info/5', border: 'border-status-info/30', text: 'text-status-info' },
  success: { icon: CheckCircle, bg: 'bg-status-success/5', border: 'border-status-success/30', text: 'text-status-success' },
  warning: { icon: AlertTriangle, bg: 'bg-status-warning/5', border: 'border-status-warning/30', text: 'text-status-warning' },
  danger: { icon: XCircle, bg: 'bg-status-danger/5', border: 'border-status-danger/30', text: 'text-status-danger' },
};

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  action?: { label: string; onClick: () => void };
}

export function Alert({ tone = 'info', title, children, action }: AlertProps) {
  const { icon: Icon, bg, border, text } = toneConfig[tone];
  return (
    <div className={`${bg} ${border} border rounded-card p-4 flex gap-3`} role="alert">
      <Icon className={`h-5 w-5 ${text} flex-shrink-0 mt-0.5`} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${text}`}>{title}</p>
        {children && <div className="text-sm text-ink mt-1">{children}</div>}
        {action && (
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export interface InlineNoticeProps {
  tone?: AlertTone;
  children: ReactNode;
}

export function InlineNotice({ tone = 'info', children }: InlineNoticeProps) {
  const { bg, border, text } = toneConfig[tone];
  return (
    <p className={`${bg} ${border} ${text} border rounded-control px-3 py-2 text-sm flex items-center gap-2`}>
      {children}
    </p>
  );
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-subtle text-ink-secondary border-border',
  success: 'bg-status-success/10 text-status-success border-status-success/30',
  warning: 'bg-status-warning/10 text-status-warning border-status-warning/30',
  danger: 'bg-status-danger/10 text-status-danger border-status-danger/30',
  info: 'bg-status-info/10 text-status-info border-status-info/30',
};

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
}

export function StatusBadge({ tone = 'neutral', children, dot }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function DefinitionTooltip({ term, definition }: { term: string; definition: string }) {
  return (
    <span className="relative inline-block group">
      <span
        tabIndex={0}
        className="underline decoration-dotted decoration-ink-secondary/50 underline-offset-2 cursor-help"
        role="button"
        aria-label={`${term}: ${definition}`}
      >
        {term}
      </span>
      <span
        role="tooltip"
        className="absolute left-0 top-full mt-1 z-10 w-64 max-w-[80vw] rounded-control border border-border bg-surface shadow-elevated p-3 text-sm text-ink opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity"
      >
        {definition}
      </span>
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      {icon && <div className="text-ink-secondary mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm text-ink-secondary mt-2 max-w-md">{description}</p>
      {action && (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  let title = 'Something went wrong';
  let message = 'An unexpected error occurred. Please try again.';
  let requestId: string | undefined;
  let retryable = true;

  if (isApiError(error)) {
    requestId = error.requestId;
    retryable = error.retryable;
    switch (error.status) {
      case 401:
        title = 'Session expired';
        message = 'Your session has expired. Please sign in again to continue.';
        retryable = false;
        break;
      case 403:
        title = 'Access denied';
        message = "You don't have permission to view this. If you believe this is an error, contact your administrator.";
        retryable = false;
        break;
      case 404:
        title = 'Not found';
        message = 'The record you are looking for could not be found or may have expired.';
        retryable = false;
        break;
      case 409:
        title = 'Conflicting state';
        message = 'This record has changed since you last viewed it. Refresh to see the current state.';
        break;
      case 422:
        title = 'Validation or plan limit';
        message = error.details
          ? error.details.map((d) => d.message).join(' ')
          : error.message;
        break;
      case 429:
        title = 'Rate or budget limit';
        message = 'Too many requests. Please wait a moment before trying again.';
        break;
      default:
        if (error.status === 0) {
          title = 'Connection problem';
          message = 'The CPF service could not be reached. Check your connection and try again.';
        } else {
          message = error.message;
        }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4" role="alert">
      <div className="h-12 w-12 rounded-full bg-status-danger/10 flex items-center justify-center mb-4">
        <XCircle className="h-6 w-6 text-status-danger" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm text-ink-secondary mt-2 max-w-md">{message}</p>
      {requestId && (
        <p className="text-xs text-ink-secondary mt-3 font-mono">
          Request ID: {requestId}
        </p>
      )}
      {retryable && onRetry && (
        <Button className="mt-6" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16" aria-live="polite" aria-busy>
      <div className="flex items-center gap-3 text-ink-secondary">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`cpf-skeleton h-4 ${className}`} aria-hidden />;
}

export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className={`flex-1 ${i === 0 ? 'h-6' : ''}`} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  );
}
