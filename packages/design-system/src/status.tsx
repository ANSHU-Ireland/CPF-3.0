import type { CSSProperties, ReactNode } from "react";

/**
 * Status & feedback primitives (S04). Every status pairs colour with text —
 * never colour alone. All live regions are polite unless an incident demands
 * assertive interruption.
 */

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneVars: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--cpf-neutral-bg)", fg: "var(--cpf-neutral-fg)" },
  info: { bg: "var(--cpf-info-bg)", fg: "var(--cpf-info-fg)" },
  success: { bg: "var(--cpf-success-bg)", fg: "var(--cpf-success-fg)" },
  warning: { bg: "var(--cpf-warning-bg)", fg: "var(--cpf-warning-fg)" },
  danger: { bg: "var(--cpf-danger-bg)", fg: "var(--cpf-danger-fg)" },
};

export function StatusChip({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }): ReactNode {
  const v = toneVars[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--cpf-space-1)",
        padding: "2px var(--cpf-space-2)",
        borderRadius: "var(--cpf-radius-sm)",
        background: v.bg,
        color: v.fg,
        fontSize: "var(--cpf-text-xs)",
        fontWeight: 600,
        lineHeight: 1.7,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: StatusTone;
  title: string;
  children?: ReactNode;
}): ReactNode {
  const v = toneVars[tone];
  return (
    <section
      role={tone === "danger" ? "alert" : "status"}
      aria-label={title}
      style={{
        borderLeft: `4px solid ${v.fg}`,
        background: v.bg,
        color: "var(--cpf-text)",
        padding: "var(--cpf-space-3) var(--cpf-space-4)",
        borderRadius: "var(--cpf-radius-sm)",
        margin: "var(--cpf-space-3) 0",
      }}
    >
      <strong style={{ display: "block", color: v.fg, marginBottom: children ? "var(--cpf-space-1)" : 0 }}>{title}</strong>
      {children != null && <div style={{ fontSize: "var(--cpf-text-sm)", lineHeight: "var(--cpf-leading)" }}>{children}</div>}
    </section>
  );
}

/** GOV.UK-style error summary: focusable heading + links to offending fields; entered data preserved. */
export function ErrorSummary({
  errors,
  headingId = "cpf-error-summary",
}: {
  errors: Array<{ fieldId: string; message: string }>;
  headingId?: string;
}): ReactNode {
  if (errors.length === 0) return null;
  return (
    <section
      role="alert"
      aria-labelledby={headingId}
      tabIndex={-1}
      style={{
        border: "2px solid var(--cpf-danger-fg)",
        borderRadius: "var(--cpf-radius-sm)",
        padding: "var(--cpf-space-4)",
        margin: "var(--cpf-space-4) 0",
        background: "var(--cpf-surface)",
      }}
    >
      <h2 id={headingId} style={{ margin: 0, fontSize: "var(--cpf-text-lg)", color: "var(--cpf-danger-fg)" }}>
        There is a problem
      </h2>
      <ul style={{ margin: "var(--cpf-space-2) 0 0", paddingLeft: "var(--cpf-space-5)" }}>
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`} style={{ color: "var(--cpf-danger-fg)", fontWeight: 600 }}>
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Assessment-wide incident banner. Assertive: interrupts, offers one recovery action. */
export function IncidentBanner({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--cpf-space-4)",
        justifyContent: "space-between",
        background: "var(--cpf-warning-bg)",
        color: "var(--cpf-warning-fg)",
        borderBottom: "var(--cpf-border-w) solid var(--cpf-border)",
        padding: "var(--cpf-space-3) var(--cpf-space-4)",
      }}
    >
      <div>
        <strong>{title}</strong>
        {detail != null && <span style={{ marginLeft: "var(--cpf-space-2)", fontSize: "var(--cpf-text-sm)" }}>{detail}</span>}
      </div>
      {action}
    </div>
  );
}

/** Autosave state — polite live region; never steals focus. */
export function AutosaveState({
  state,
  savedAt,
}: {
  state: "saved" | "saving" | "offline" | "error";
  savedAt?: Date | undefined;
}): ReactNode {
  const label =
    state === "saved"
      ? `Saved${savedAt ? ` at ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
      : state === "saving"
        ? "Saving…"
        : state === "offline"
          ? "Offline — work is kept on this device"
          : "Save failed — retrying";
  const tone: StatusTone = state === "saved" ? "success" : state === "saving" ? "neutral" : "warning";
  return (
    <span role="status" aria-live="polite">
      <StatusChip tone={tone}>{label}</StatusChip>
    </span>
  );
}

/**
 * Assessment timer. Announces only meaningful thresholds (never flashes):
 * callers pass already-formatted remaining time; announcements fire at the
 * given milestone minutes via aria-live.
 */
export function Timer({
  remainingSeconds,
  paused = false,
  announceAtMinutes = [30, 10, 5],
}: {
  remainingSeconds: number;
  paused?: boolean;
  announceAtMinutes?: number[];
}): ReactNode {
  const m = Math.floor(remainingSeconds / 60);
  const s = Math.max(0, Math.floor(remainingSeconds % 60));
  const display = `${m}:${String(s).padStart(2, "0")}`;
  const shouldAnnounce = announceAtMinutes.includes(m) && s === 0;
  const style: CSSProperties = {
    fontFamily: "var(--cpf-font-mono)",
    fontVariantNumeric: "tabular-nums",
    fontSize: "var(--cpf-text-md)",
    color: m < 5 ? "var(--cpf-danger-fg)" : "var(--cpf-text)",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--cpf-space-2)" }}>
      <span aria-hidden="true" style={style}>
        {display}
      </span>
      <span className="cpf-visually-hidden" role="timer" aria-live={shouldAnnounce ? "polite" : "off"}>
        {paused ? "Timer paused" : `${m} minutes remaining`}
      </span>
      {paused && <StatusChip tone="info">Paused</StatusChip>}
    </span>
  );
}
