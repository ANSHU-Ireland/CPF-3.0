import type { ReactNode } from "react";

/**
 * Data-display primitives (S04): DataTable, Timeline, EvidenceLink, Receipt,
 * EmptyState, Skeleton. Evidence IDs are immutable and monospaced; timelines
 * are semantic ordered lists (Primer timeline a11y conventions).
 */

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyState,
}: {
  caption: string;
  columns: Array<{ id: string; header: ReactNode; render: (row: Row) => ReactNode; width?: number | string }>;
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyState?: ReactNode;
}): ReactNode {
  if (rows.length === 0 && emptyState != null) return <>{emptyState}</>;
  return (
    <div style={{ overflowX: "auto", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-md)", background: "var(--cpf-surface)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--cpf-text-sm)" }}>
        <caption className="cpf-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                style={{
                  textAlign: "left",
                  padding: "var(--cpf-space-2) var(--cpf-space-3)",
                  borderBottom: "var(--cpf-border-w) solid var(--cpf-border)",
                  color: "var(--cpf-text-secondary)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} style={{ borderBottom: "var(--cpf-border-w) solid var(--cpf-border)" }}>
              {columns.map((col) => (
                <td key={col.id} style={{ padding: "var(--cpf-space-2) var(--cpf-space-3)", verticalAlign: "top" }}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Timeline({
  items,
  label,
}: {
  items: Array<{ id: string; marker?: ReactNode; title: ReactNode; meta?: ReactNode; body?: ReactNode }>;
  label: string;
}): ReactNode {
  return (
    <ol aria-label={label} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item.id} style={{ display: "flex", gap: "var(--cpf-space-3)", padding: "var(--cpf-space-2) 0", borderBottom: "var(--cpf-border-w) solid var(--cpf-border)" }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, marginTop: 6, borderRadius: "50%", background: "var(--cpf-border)", flexShrink: 0 }}>
            {item.marker}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--cpf-text-sm)", fontWeight: 600 }}>{item.title}</div>
            {item.meta != null && <div style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>{item.meta}</div>}
            {item.body != null && <div style={{ fontSize: "var(--cpf-text-sm)", marginTop: "var(--cpf-space-1)" }}>{item.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Immutable evidence citation: monospace ID, one click to the source. */
export function EvidenceLink({ id, onOpen, kind }: { id: string; kind?: string; onOpen?: (id: string) => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(id)}
      style={{
        appearance: "none",
        border: "var(--cpf-border-w) solid var(--cpf-border)",
        borderRadius: "var(--cpf-radius-sm)",
        background: "var(--cpf-neutral-bg)",
        color: "var(--cpf-text)",
        fontFamily: "var(--cpf-font-mono)",
        fontSize: "var(--cpf-text-xs)",
        padding: "1px var(--cpf-space-2)",
        cursor: onOpen ? "pointer" : "default",
        minHeight: "var(--cpf-target-min)",
      }}
    >
      {kind != null && <span style={{ color: "var(--cpf-text-secondary)", marginRight: 4 }}>{kind}</span>}
      {id}
    </button>
  );
}

/** Signed receipt block: definition list + monospace hashes, print-friendly. */
export function Receipt({
  title,
  entries,
  footer,
}: {
  title: string;
  entries: Array<{ term: string; value: ReactNode; mono?: boolean }>;
  footer?: ReactNode;
}): ReactNode {
  return (
    <section
      aria-label={title}
      style={{
        border: "2px solid var(--cpf-text)",
        borderRadius: "var(--cpf-radius-md)",
        background: "var(--cpf-surface)",
        padding: "var(--cpf-space-5)",
        maxWidth: 640,
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: "var(--cpf-text-lg)" }}>{title}</h2>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--cpf-space-2) var(--cpf-space-4)" }}>
        {entries.map((entry) => (
          <div key={entry.term} style={{ display: "contents" }}>
            <dt style={{ color: "var(--cpf-text-secondary)", fontSize: "var(--cpf-text-sm)" }}>{entry.term}</dt>
            <dd
              style={{
                margin: 0,
                fontSize: "var(--cpf-text-sm)",
                fontFamily: entry.mono ? "var(--cpf-font-mono)" : undefined,
                overflowWrap: "anywhere",
              }}
            >
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
      {footer != null && <div style={{ marginTop: "var(--cpf-space-4)", fontSize: "var(--cpf-text-sm)", color: "var(--cpf-text-secondary)" }}>{footer}</div>}
    </section>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }): ReactNode {
  return (
    <div style={{ textAlign: "center", padding: "var(--cpf-space-7) var(--cpf-space-5)", color: "var(--cpf-text-secondary)" }}>
      <p style={{ fontSize: "var(--cpf-text-md)", fontWeight: 600, color: "var(--cpf-text)", margin: 0 }}>{title}</p>
      {hint != null && <p style={{ fontSize: "var(--cpf-text-sm)", margin: "var(--cpf-space-2) 0 0" }}>{hint}</p>}
      {action != null && <div style={{ marginTop: "var(--cpf-space-4)" }}>{action}</div>}
    </div>
  );
}

/** Loading skeleton — stable layout (no CLS), hidden from assistive tech. */
export function Skeleton({ lines = 3, height = 14 }: { lines?: number; height?: number }): ReactNode {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          style={{
            height,
            margin: "var(--cpf-space-2) 0",
            borderRadius: "var(--cpf-radius-sm)",
            background: "var(--cpf-neutral-bg)",
            width: i === lines - 1 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  );
}
