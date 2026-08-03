import { Save, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

type SaveStatusState = 'idle' | 'saving' | 'saved' | 'error';

export function SaveStatus({ state, lastSavedAt }: { state: SaveStatusState; lastSavedAt?: string | null }) {
  const config: Record<SaveStatusState, { icon: typeof Save; text: string; className: string }> = {
    idle: { icon: Save, text: 'Not yet saved', className: 'text-ink-secondary' },
    saving: { icon: Save, text: 'Saving…', className: 'text-status-info' },
    saved: { icon: Save, text: 'Saved', className: 'text-status-success' },
    error: { icon: AlertTriangle, text: 'Save failed', className: 'text-status-danger' },
  };
  const { icon: Icon, text, className } = config[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      {state === 'saving' ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden />
      )}
      {text}
      {state === 'saved' && lastSavedAt && (
        <time className="text-xs text-ink-secondary ml-1">at {lastSavedAt}</time>
      )}
    </span>
  );
}

export function ConnectionStatus({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm ${online ? 'text-status-success' : 'text-status-danger'}`}
      role="status"
      aria-live="polite"
    >
      {online ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
      {online ? 'Connected' : 'Connection lost — your work is safe, retry on reconnect'}
    </span>
  );
}

export function SessionExpiryWarning({
  minutesRemaining,
  onExtend,
  onDismiss,
}: {
  minutesRemaining: number;
  onExtend: () => void;
  onDismiss: () => void;
}) {
  if (minutesRemaining > 10) return null;
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-card border border-status-warning/30 bg-status-warning/5 px-4 py-3"
      role="alert"
    >
      <p className="text-sm text-ink">
        Your session will expire in {minutesRemaining} minutes due to inactivity.
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={onExtend} className="text-sm font-medium text-brand hover:text-brand-hover">
          Stay signed in
        </button>
        <button onClick={onDismiss} className="text-sm text-ink-secondary hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  );
}
