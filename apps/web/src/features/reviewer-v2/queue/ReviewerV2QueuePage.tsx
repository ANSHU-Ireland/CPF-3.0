import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import "@cpf/design-system/tokens.css";
import { DataTable, EmptyState, Notice, Skeleton, StatusChip } from "@cpf/design-system";
import { reviewV2, type QueueItem } from "../api.js";

/**
 * S16 — Reviewer V2 queue. Pseudonymous, SLA-ordered (never performance-
 * ordered), no candidate image/name/camera state. High-density table with
 * saved-filter simplicity: assigned-to-me toggle + status filter.
 */
export function ReviewerV2QueuePage(): ReactNode {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    reviewV2
      .queue(orgId)
      .then((r) => alive && setItems(r.items))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [orgId]);

  const visible = (items ?? []).filter((i) => !mineOnly || i.assignedToMe);

  return (
    <section data-cpf-root style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--cpf-space-5)", fontFamily: "var(--cpf-font-sans)", color: "var(--cpf-text)" }}>
      <p style={{ color: "var(--cpf-text-secondary)", fontSize: "var(--cpf-text-xs)", letterSpacing: 0.5, textTransform: "uppercase" }}>Review V2 — controlled pilot</p>
      <h1 style={{ fontSize: "var(--cpf-text-xl)" }}>Evidence review queue</h1>
      <p style={{ color: "var(--cpf-text-secondary)", fontSize: "var(--cpf-text-sm)", maxWidth: 720 }}>
        Pseudonymous and ordered by review SLA. Candidate identity, camera state and integrity severity are
        deliberately absent here (ADR-003).
      </p>
      <label style={{ display: "inline-flex", gap: "var(--cpf-space-2)", alignItems: "center", fontSize: "var(--cpf-text-sm)", margin: "var(--cpf-space-3) 0" }}>
        <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} style={{ width: 18, height: 18 }} />
        Assigned to me
      </label>

      {error && <Notice tone="danger" title="Could not load the queue">{error}</Notice>}
      {!items && !error && <Skeleton lines={6} height={18} />}
      {items && (
        <DataTable<QueueItem>
          caption="V2 review queue, ordered by SLA"
          rowKey={(r) => r.sessionId}
          emptyState={<EmptyState title="No V2 submissions waiting" hint="Sessions appear here when V2 candidates submit." />}
          columns={[
            { id: "pseudonym", header: "Candidate", render: (r) => <Link to={`/org/${orgId}/reviews-v2/${r.sessionId}`} style={{ color: "var(--cpf-primary)", fontFamily: "var(--cpf-font-mono)" }}>{r.pseudonym}</Link> },
            { id: "pack", header: "Assessment", render: (r) => `${r.packCode} v${r.packVersion}` },
            { id: "role", header: "Role / level", render: (r) => `${r.targetRole} · ${r.targetLevel}` },
            {
              id: "status",
              header: "Status",
              render: (r) => (
                <StatusChip tone={r.status === "awaiting_review" ? "info" : r.status === "adjudication" ? "warning" : "neutral"}>
                  {r.status.replaceAll("_", " ")}
                </StatusChip>
              ),
            },
            {
              id: "sla",
              header: "SLA",
              render: (r) => (
                <StatusChip tone={r.slaHoursRemaining < 12 ? "danger" : r.slaHoursRemaining < 24 ? "warning" : "success"}>
                  {r.slaHoursRemaining < 0 ? `${Math.abs(Math.round(r.slaHoursRemaining))}h overdue` : `${Math.round(r.slaHoursRemaining)}h left`}
                </StatusChip>
              ),
            },
            { id: "second", header: "Second review", render: (r) => (r.secondReviewRequired ? "Required (blind)" : "—") },
            { id: "incidents", header: "Incidents", render: (r) => (r.technicalIncidents ? <StatusChip tone="warning">technical incident</StatusChip> : "—") },
            { id: "mine", header: "Assignment", render: (r) => (r.assignedToMe ? <StatusChip tone="success">assigned to me</StatusChip> : "—") },
          ]}
          rows={visible}
        />
      )}
      <p style={{ marginTop: "var(--cpf-space-4)" }}>
        <Link to={`/org/${orgId}/reviews`} style={{ color: "var(--cpf-text-secondary)", fontSize: "var(--cpf-text-sm)" }}>
          Switch to the V1 review queue
        </Link>
      </p>
    </section>
  );
}
