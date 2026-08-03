import { useEffect, useRef, type ReactNode } from "react";

/**
 * Layout primitives (S04): AppShell, SplitPane, Tabs, Dialog, Drawer, Stepper.
 * Semantic landmarks, keyboard paths and 200%-zoom transformations are part
 * of the contract — panes become tabs at small widths (callers pass mode).
 */

export function AppShell({
  header,
  nav,
  children,
  footer,
}: {
  header: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}): ReactNode {
  return (
    <div
      data-cpf-root
      style={{
        minHeight: "100vh",
        background: "var(--cpf-canvas)",
        color: "var(--cpf-text)",
        fontFamily: "var(--cpf-font-sans)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: "var(--cpf-z-nav)" as never,
          background: "var(--cpf-surface)",
          borderBottom: "var(--cpf-border-w) solid var(--cpf-border)",
        }}
      >
        {header}
      </header>
      {nav != null && <nav aria-label="Primary">{nav}</nav>}
      <main style={{ flex: 1, width: "100%" }}>{children}</main>
      {footer != null && (
        <footer style={{ borderTop: "var(--cpf-border-w) solid var(--cpf-border)", background: "var(--cpf-surface)" }}>
          {footer}
        </footer>
      )}
    </div>
  );
}

/** Two-region split. `collapsed` renders regions stacked (small windows / 200% zoom). */
export function SplitPane({
  primary,
  secondary,
  secondaryWidth = 380,
  collapsed = false,
  primaryLabel,
  secondaryLabel,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  secondaryWidth?: number;
  collapsed?: boolean;
  primaryLabel: string;
  secondaryLabel: string;
}): ReactNode {
  if (collapsed) {
    return (
      <div>
        <section aria-label={primaryLabel}>{primary}</section>
        <section aria-label={secondaryLabel}>{secondary}</section>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${secondaryWidth}px`, gap: "var(--cpf-space-4)", alignItems: "start" }}>
      <section aria-label={primaryLabel} style={{ minWidth: 0 }}>
        {primary}
      </section>
      <section aria-label={secondaryLabel} style={{ minWidth: 0 }}>
        {secondary}
      </section>
    </div>
  );
}

/** Accessible tabs (roving arrow keys, aria-selected; panels labelled by tab). */
export function Tabs({
  tabs,
  activeId,
  onChange,
  label,
}: {
  tabs: Array<{ id: string; label: ReactNode; badge?: ReactNode }>;
  activeId: string;
  onChange: (id: string) => void;
  label: string;
}): ReactNode {
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());
  return (
    <div role="tablist" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: "var(--cpf-space-1)", borderBottom: "var(--cpf-border-w) solid var(--cpf-border)", minWidth: 0 }}>
      {tabs.map((tab, index) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (delta === 0) return;
              e.preventDefault();
              const next = tabs[(index + delta + tabs.length) % tabs.length]!;
              onChange(next.id);
              refs.current.get(next.id)?.focus();
            }}
            style={{
              appearance: "none",
              border: "none",
              background: "transparent",
              padding: "var(--cpf-space-2) var(--cpf-space-3)",
              minHeight: "var(--cpf-target-min)",
              fontSize: "var(--cpf-text-sm)",
              fontWeight: selected ? 700 : 500,
              color: selected ? "var(--cpf-primary)" : "var(--cpf-text-secondary)",
              borderBottom: selected ? "2px solid var(--cpf-primary)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ tabId, active, children }: { tabId: string; active: boolean; children: ReactNode }): ReactNode {
  return (
    <div role="tabpanel" id={`panel-${tabId}`} aria-labelledby={`tab-${tabId}`} hidden={!active}>
      {children}
    </div>
  );
}

/** Modal dialog on the native <dialog> element: focus containment + Esc for free. */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onCancel={onClose}
      style={{
        border: "var(--cpf-border-w) solid var(--cpf-border)",
        borderRadius: "var(--cpf-radius-lg)",
        boxShadow: "var(--cpf-shadow-3)",
        padding: "var(--cpf-space-5)",
        maxWidth: 560,
        width: "calc(100vw - 48px)",
        color: "var(--cpf-text)",
        fontFamily: "var(--cpf-font-sans)",
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: "var(--cpf-text-xl)" }}>{title}</h2>
      {children}
    </dialog>
  );
}

/** Progress stepper for the candidate service flow. */
export function Stepper({
  steps,
  currentIndex,
  label = "Progress",
}: {
  steps: string[];
  currentIndex: number;
  label?: string;
}): ReactNode {
  return (
    <ol aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: "var(--cpf-space-3)", listStyle: "none", padding: 0, margin: "var(--cpf-space-4) 0" }}>
      {steps.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li key={step} aria-current={state === "current" ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: "var(--cpf-space-2)" }}>
            <span
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--cpf-text-xs)",
                fontWeight: 700,
                background: state === "upcoming" ? "var(--cpf-neutral-bg)" : "var(--cpf-primary)",
                color: state === "upcoming" ? "var(--cpf-neutral-fg)" : "#fff",
              }}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span style={{ fontSize: "var(--cpf-text-sm)", fontWeight: state === "current" ? 700 : 500, color: state === "upcoming" ? "var(--cpf-text-secondary)" : "var(--cpf-text)" }}>
              {step}
              {state === "done" && <span className="cpf-visually-hidden"> (completed)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
