import { useState, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  badge?: string | number;
}

export function Tabs({ items, initialTabId }: { items: TabItem[]; initialTabId?: string }) {
  const [active, setActive] = useState(initialTabId ?? items[0]?.id ?? '');
  const activeItem = items.find((t) => t.id === active);

  return (
    <div>
      <div
        className="flex gap-1 border-b border-border overflow-x-auto"
        role="tablist"
        aria-orientation="horizontal"
      >
        {items.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors min-h-[44px] ${
                selected
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-secondary hover:text-ink hover:bg-surface-subtle'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-2 rounded-full bg-surface-subtle px-2 py-0.5 text-xs">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="pt-6"
      >
        {activeItem?.content}
      </div>
    </div>
  );
}

export interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
  defaultOpen?: boolean;
}

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    new Set(items.filter((i) => i.defaultOpen).map((i) => i.id)),
  );

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="divide-y divide-border rounded-card border border-border overflow-hidden">
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        return (
          <div key={item.id}>
            <h3>
              <button
                aria-expanded={isOpen}
                aria-controls={`accordion-content-${item.id}`}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left font-medium text-ink hover:bg-surface-subtle transition-colors min-h-[44px]"
              >
                {item.title}
                <svg
                  className={`h-5 w-5 text-ink-secondary transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </h3>
            {isOpen && (
              <div
                id={`accordion-content-${item.id}`}
                className="px-4 pb-4 text-sm text-ink-secondary"
              >
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface Step {
  id: string;
  label: string;
  description?: string;
}

export function Stepper({
  steps,
  currentIndex,
  onStepClick,
}: {
  steps: Step[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto" aria-label="Progress">
      {steps.map((step, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isClickable = onStepClick && i <= currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2 flex-shrink-0">
            <button
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick?.(i)}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex items-center gap-2 group disabled:cursor-not-allowed"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium border-2 transition-colors ${
                  isComplete
                    ? 'bg-status-success text-white border-status-success'
                    : isCurrent
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface text-ink-secondary border-border'
                }`}
              >
                {isComplete ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={`text-sm whitespace-nowrap ${
                  isCurrent ? 'font-semibold text-ink' : 'text-ink-secondary'
                }`}
              >
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className={`h-0.5 w-8 ${isComplete ? 'bg-status-success' : 'bg-border'}`} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressSummary({
  completed,
  total,
  label = 'Completed',
}: {
  completed: number;
  total: number;
  label?: string;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-ink-secondary">
          {label}: {completed}/{total}
        </span>
        <span className="font-medium text-ink">{pct}%</span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-surface-subtle overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${completed} of ${total}`}
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export interface TimelineItem {
  id: string;
  timestamp: string;
  title: string;
  description?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const dotTones: Record<string, string> = {
    neutral: 'bg-ink-secondary',
    success: 'bg-status-success',
    warning: 'bg-status-warning',
    danger: 'bg-status-danger',
  };
  return (
    <ol className="relative space-y-6">
      {items.map((item) => (
        <li key={item.id} className="relative flex gap-4">
          <div className="flex flex-col items-center">
            <span className={`h-3 w-3 rounded-full ${dotTones[item.tone ?? 'neutral']} flex-shrink-0 mt-1.5`} />
            <span className="w-0.5 flex-1 bg-border" aria-hidden />
          </div>
          <div className="pb-2 flex-1">
            <p className="text-sm font-medium text-ink">{item.title}</p>
            {item.description && <p className="text-sm text-ink-secondary mt-0.5">{item.description}</p>}
            <time className="text-xs text-ink-secondary mt-1 block">{item.timestamp}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
