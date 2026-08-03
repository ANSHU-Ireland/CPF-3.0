import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { resolveSuppressed, type SuppressedMetric } from '@/lib/types';

export function KpiCard({
  label,
  value,
  hint,
  trend,
  suppressed,
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
  suppressed?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary font-medium">{label}</p>
        {trend && (
          <span
            className={`text-xs font-medium ${
              trend.direction === 'up'
                ? 'text-status-success'
                : trend.direction === 'down'
                  ? 'text-status-danger'
                  : 'text-ink-secondary'
            }`}
          >
            {trend.label}
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold text-ink mt-2">
        {suppressed ? '< 5 organisations' : value}
      </p>
      {hint && <p className="text-xs text-ink-secondary mt-1">{hint}</p>}
    </div>
  );
}

export function DefinitionCard({
  term,
  definition,
  children,
}: {
  term: string;
  definition: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-start gap-2">
        <h4 className="font-semibold text-ink flex-1">{term}</h4>
        <button
          className="text-ink-secondary hover:text-ink"
          title={definition}
          aria-label={`Definition: ${definition}`}
        >
          <Info className="h-4 w-4" />
        </button>
      </div>
      {children && <div className="mt-3 text-sm text-ink-secondary">{children}</div>}
    </div>
  );
}

export function SuppressedValue({
  metric,
  label,
}: {
  metric: SuppressedMetric | number | string;
  label?: string;
}) {
  const resolved: SuppressedMetric =
    typeof metric === 'object' ? metric : resolveSuppressed(metric);
  return (
    <span
      className={resolved.suppressed ? 'text-ink-secondary italic' : 'text-ink font-medium'}
      title={resolved.suppressed ? 'Value suppressed to protect k-anonymity' : undefined}
    >
      {label && <span className="text-ink-secondary mr-1.5">{label}:</span>}
      {resolved.suppressed ? '< 5 organisations' : resolved.value}
    </span>
  );
}

export function TrendChart({
  data,
  label,
  caption,
}: {
  data: Array<{ label: string; value: number }>;
  label: string;
  caption?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-5">
        <p className="text-sm text-ink-secondary">Insufficient data to display {label.toLowerCase()}.</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value));
  const hasData = max > 0;

  return (
    <figure className="rounded-card border border-border bg-surface p-5">
      <figcaption className="text-sm font-medium text-ink mb-4">{label}</figcaption>
      {caption && <p className="text-xs text-ink-secondary mb-4">{caption}</p>}
      <div className="flex items-end gap-2 h-40" role="img" aria-label={`${label} chart`}>
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-ink-secondary font-medium">
              {hasData ? d.value : '—'}
            </span>
            <div
              className="w-full rounded-t bg-brand/80 hover:bg-brand transition-colors min-h-[2px]"
              style={{ height: hasData ? `${(d.value / max) * 100}%` : '2px' }}
              title={`${d.label}: ${d.value}`}
            />
            <span className="text-xs text-ink-secondary truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
      {/* Accessible text alternative */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr><th scope="col">Period</th><th scope="col">Value</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}><th scope="row">{d.label}</th><td>{d.value}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
