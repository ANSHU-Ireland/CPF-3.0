import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import "@cpf/design-system/tokens.css";
import { EvidenceLink, Notice, Skeleton, StatusChip, Tabs, TabPanel, Timeline } from "@cpf/design-system";
import { reviewV2, type ReviewBundle } from "../api.js";

/**
 * S17 — artifact-first evidence review. Four panes as tabs (Artifact,
 * Evidence, Rubric, Integrity-pointer). The final artifact opens FIRST; the
 * rubric requires anchor + rationale + confidence per dimension; integrity
 * lives behind the separate role-gated endpoint and is only pointed to here.
 */
export function ReviewerV2WorkspacePage(): ReactNode {
  const { orgId = "", reviewId = "" } = useParams<{ orgId: string; reviewId: string }>();
  const [bundle, setBundle] = useState<ReviewBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("artifact");
  const [drafts, setDrafts] = useState<Record<string, { anchor: string; rationale: string; confidence: string; followUpProbe: string }>>({});
  const [saveState, setSaveState] = useState<Record<string, "saved" | "saving" | "error">>({});
  const [outcome, setOutcome] = useState<string | null>(null);
  const [finaliseError, setFinaliseError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    reviewV2
      .bundle(orgId, reviewId)
      .then((b) => {
        if (!alive) return;
        setBundle(b);
        const seed: typeof drafts = {};
        for (const r of b.dimensionReviews.filter((r) => r.review_round === b.myRound)) {
          seed[r.dimension_id] = { anchor: r.anchor, rationale: r.rationale, confidence: r.confidence, followUpProbe: "" };
        }
        setDrafts(seed);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [orgId, reviewId]);

  const reviewedCount = useMemo(
    () => (bundle ? bundle.pack.dimensions.filter((d) => drafts[d.dimensionId]?.rationale && saveState[d.dimensionId] === "saved").length : 0),
    [bundle, drafts, saveState],
  );

  if (error) {
    return (
      <section data-cpf-root style={{ maxWidth: 900, margin: "0 auto", padding: "var(--cpf-space-5)" }}>
        <Notice tone="danger" title="Cannot open this review">{error}</Notice>
        <Link to={`/org/${orgId}/reviews-v2`} style={{ color: "var(--cpf-primary)" }}>Back to queue</Link>
      </section>
    );
  }
  if (!bundle) {
    return (
      <section data-cpf-root style={{ maxWidth: 900, margin: "0 auto", padding: "var(--cpf-space-5)" }} aria-busy="true">
        <Skeleton lines={8} height={16} />
      </section>
    );
  }

  const saveDimension = async (dimensionId: string) => {
    const draft = drafts[dimensionId];
    if (!draft || draft.rationale.length < 20) {
      setSaveState((s) => ({ ...s, [dimensionId]: "error" }));
      return;
    }
    setSaveState((s) => ({ ...s, [dimensionId]: "saving" }));
    try {
      await reviewV2.saveDimension(orgId, reviewId, dimensionId, {
        anchor: draft.anchor,
        rationale: draft.rationale,
        confidence: draft.confidence,
        followUpProbe: draft.followUpProbe,
        citedEvidence: [],
      });
      setSaveState((s) => ({ ...s, [dimensionId]: "saved" }));
    } catch {
      setSaveState((s) => ({ ...s, [dimensionId]: "error" }));
    }
  };

  return (
    <section data-cpf-root style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--cpf-space-5)", fontFamily: "var(--cpf-font-sans)", color: "var(--cpf-text)" }}>
      <p style={{ color: "var(--cpf-text-secondary)", fontSize: "var(--cpf-text-xs)" }}>
        <Link to={`/org/${orgId}/reviews-v2`} style={{ color: "var(--cpf-text-secondary)" }}>← Queue</Link>
      </p>
      <h1 style={{ fontSize: "var(--cpf-text-xl)", display: "flex", gap: "var(--cpf-space-3)", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--cpf-font-mono)" }}>{bundle.pseudonym}</span>
        <span>{bundle.pack.title}</span>
        <StatusChip tone="info">{bundle.pack.packCode} v{bundle.pack.packVersion}</StatusChip>
        {bundle.myRound != null && <StatusChip tone="neutral">round {bundle.myRound}{bundle.myRound === 2 ? " (blind)" : ""}</StatusChip>}
      </h1>
      {outcome && (
        <Notice tone="success" title={`Review round finalised — ${outcome.replaceAll("_", " ")}`}>
          {outcome === "adjudication_opened" && "Material disagreement with the other round: an adjudication case was opened for a human adjudicator."}
          {outcome === "awaiting_second_review" && "A blind second reviewer completes their round next."}
        </Notice>
      )}

      <Tabs
        label="Review panes"
        activeId={tab}
        onChange={setTab}
        tabs={[
          { id: "artifact", label: "Artifact (final work)" },
          { id: "evidence", label: `Evidence (${bundle.versionHistory.length + bundle.aiTranscript.length + bundle.toolReceipts.length})` },
          { id: "rubric", label: `Rubric (${reviewedCount}/${bundle.pack.dimensions.length})` },
          { id: "integrity", label: "Integrity" },
        ]}
      />

      <TabPanel tabId="artifact" active={tab === "artifact"}>
        {bundle.hiddenCheckResults?.declaredLimitations && (
          <Notice tone="info" title="Candidate-declared limitations">{bundle.hiddenCheckResults.declaredLimitations}</Notice>
        )}
        {bundle.artifacts.map((a) => (
          <details key={a.id} open={Boolean(a.deliverable_slot)} style={{ margin: "var(--cpf-space-3) 0", background: "var(--cpf-surface)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-md)", padding: "var(--cpf-space-3)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "var(--cpf-text-sm)" }}>
              {a.deliverable_slot ? `${a.deliverable_slot} — ` : ""}{a.path} <StatusChip tone="neutral">{a.provenance.replaceAll("_", " ")}</StatusChip>{" "}
              <EvidenceLink id={a.content_hash.slice(0, 12)} kind="sha" />
            </summary>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--cpf-font-mono)", fontSize: "var(--cpf-text-sm)", background: "var(--cpf-canvas)", padding: "var(--cpf-space-3)", borderRadius: "var(--cpf-radius-sm)", maxHeight: 420, overflow: "auto" }}>
              {a.content ?? "(binary/object content)"}
            </pre>
          </details>
        ))}
        {bundle.hiddenCheckResults && (
          <details style={{ marginTop: "var(--cpf-space-4)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "var(--cpf-text-sm)" }}>Automated acceptance signals (context, not verdicts)</summary>
            <ul style={{ fontSize: "var(--cpf-text-sm)" }}>
              {bundle.hiddenCheckResults.results.map((r) => (
                <li key={r.id}>
                  <StatusChip tone={r.passed ? "success" : "warning"}>{r.passed ? "present" : "not detected"}</StatusChip> {r.id}
                </li>
              ))}
            </ul>
          </details>
        )}
      </TabPanel>

      <TabPanel tabId="evidence" active={tab === "evidence"}>
        <h2 style={{ fontSize: "var(--cpf-text-md)" }}>Version history</h2>
        <Timeline
          label="Artifact versions"
          items={bundle.versionHistory.map((v) => ({
            id: `${v.artifact_id}-${v.version_no}`,
            title: `${v.path} v${v.version_no}`,
            meta: `${new Date(v.created_at).toLocaleString()} · ${v.provenance.replaceAll("_", " ")} · ${v.content_hash.slice(0, 12)}`,
          }))}
        />
        <h2 style={{ fontSize: "var(--cpf-text-md)", marginTop: "var(--cpf-space-5)" }}>AI transcript (displayed messages — AI volume is never a quality signal)</h2>
        <Timeline
          label="Copilot conversation"
          items={bundle.aiTranscript.map((m, i) => ({
            id: `ai-${i}`,
            title: `${m.role} · turn ${m.turn_no}${m.validation_status !== "ok" ? ` · ${m.validation_status}` : ""}`,
            body: <span style={{ whiteSpace: "pre-wrap" }}>{m.displayed_text}</span>,
          }))}
        />
        <h2 style={{ fontSize: "var(--cpf-text-md)", marginTop: "var(--cpf-space-5)" }}>Tool receipts</h2>
        <Timeline
          label="Tool receipts"
          items={bundle.toolReceipts.map((r) => ({
            id: r.invocation_id,
            title: `${r.plugin_id}.${r.operation} — ${r.status}`,
            meta: `${new Date(r.started_at).toLocaleString()} · ${r.source_descriptor}`,
          }))}
        />
        {bundle.technicalIncidents.length > 0 && (
          <>
            <h2 style={{ fontSize: "var(--cpf-text-md)", marginTop: "var(--cpf-space-5)" }}>Technical incidents (never a score signal)</h2>
            <Timeline
              label="Technical incidents"
              items={bundle.technicalIncidents.map((t) => ({ id: t.id, title: `${t.category} — ${t.status}`, body: t.description }))}
            />
          </>
        )}
      </TabPanel>

      <TabPanel tabId="rubric" active={tab === "rubric"}>
        {bundle.myRound == null ? (
          <Notice tone="info" title="Read-only view">You are not assigned to a review round on this session.</Notice>
        ) : (
          <>
            <p style={{ fontSize: "var(--cpf-text-sm)", color: "var(--cpf-text-secondary)", maxWidth: 720 }}>
              Select an anchored rating per dimension and cite what you observed. “Not observed” is an honest answer.
              Rationales describe evidence — hiring judgements are rejected by the server.
            </p>
            {bundle.pack.dimensions.map((d) => {
              const draft = drafts[d.dimensionId] ?? { anchor: "", rationale: "", confidence: "medium", followUpProbe: "" };
              const state = saveState[d.dimensionId];
              return (
                <fieldset key={d.dimensionId} style={{ border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-md)", padding: "var(--cpf-space-4)", margin: "var(--cpf-space-3) 0", background: "var(--cpf-surface)" }}>
                  <legend style={{ fontWeight: 700, fontSize: "var(--cpf-text-sm)" }}>
                    {d.dimensionId.replaceAll("_", " ")} {state === "saved" && <StatusChip tone="success">saved</StatusChip>}
                    {state === "error" && <StatusChip tone="danger">not saved</StatusChip>}
                  </legend>
                  <div role="radiogroup" aria-label={`Anchor for ${d.dimensionId}`} style={{ display: "flex", gap: "var(--cpf-space-2)", flexWrap: "wrap" }}>
                    {["not_observed", "developing", "capable", "strong", "exemplary"].map((anchor) => (
                      <label key={anchor} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--cpf-text-sm)", border: draft.anchor === anchor ? "2px solid var(--cpf-primary)" : "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-sm)", padding: "4px 10px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name={`anchor-${d.dimensionId}`}
                          value={anchor}
                          checked={draft.anchor === anchor}
                          onChange={() => setDrafts((s) => ({ ...s, [d.dimensionId]: { ...draft, anchor } }))}
                        />
                        {anchor.replaceAll("_", " ")}
                      </label>
                    ))}
                  </div>
                  {draft.anchor && draft.anchor !== "not_observed" && (
                    <p style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
                      Anchor guide: {d.anchors[draft.anchor as keyof typeof d.anchors]}
                    </p>
                  )}
                  <label htmlFor={`rationale-${d.dimensionId}`} style={{ display: "block", fontSize: "var(--cpf-text-sm)", fontWeight: 600, marginTop: "var(--cpf-space-2)" }}>
                    Evidence rationale (required, ≥20 characters)
                  </label>
                  <textarea
                    id={`rationale-${d.dimensionId}`}
                    value={draft.rationale}
                    onChange={(e) => setDrafts((s) => ({ ...s, [d.dimensionId]: { ...draft, rationale: e.target.value } }))}
                    rows={3}
                    style={{ width: "100%", fontSize: "var(--cpf-text-sm)", padding: "var(--cpf-space-2)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-sm)" }}
                    placeholder="What did you observe, in which artifact/version/receipt?"
                  />
                  <div style={{ display: "flex", gap: "var(--cpf-space-3)", alignItems: "center", marginTop: "var(--cpf-space-2)", flexWrap: "wrap" }}>
                    <label style={{ fontSize: "var(--cpf-text-sm)" }}>
                      Confidence{" "}
                      <select value={draft.confidence} onChange={(e) => setDrafts((s) => ({ ...s, [d.dimensionId]: { ...draft, confidence: e.target.value } }))}>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </label>
                    <input
                      aria-label={`Follow-up probe for ${d.dimensionId}`}
                      value={draft.followUpProbe}
                      onChange={(e) => setDrafts((s) => ({ ...s, [d.dimensionId]: { ...draft, followUpProbe: e.target.value } }))}
                      placeholder="Optional interview probe for this dimension"
                      style={{ flex: 1, minWidth: 220, minHeight: 32, padding: "0 var(--cpf-space-2)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-sm)", fontSize: "var(--cpf-text-sm)" }}
                    />
                    <button style={{ minHeight: 36 }} disabled={!draft.anchor || draft.rationale.length < 20 || state === "saving"} onClick={() => void saveDimension(d.dimensionId)}>
                      {state === "saving" ? "Saving…" : "Save dimension"}
                    </button>
                  </div>
                </fieldset>
              );
            })}
            {finaliseError && <Notice tone="danger" title="Cannot finalise yet">{finaliseError}</Notice>}
            <button
              style={{ background: "var(--cpf-primary)", color: "#fff", border: "none", borderRadius: "var(--cpf-radius-md)", padding: "10px 22px", fontWeight: 600, minHeight: 44, cursor: "pointer" }}
              onClick={() =>
                void reviewV2
                  .finalise(orgId, reviewId)
                  .then((r) => {
                    setOutcome(r.outcome);
                    setFinaliseError(null);
                  })
                  .catch((e: Error) => setFinaliseError(e.message))
              }
            >
              Finalise my review round
            </button>
            <p style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
              Finalising requires all {bundle.pack.dimensions.length} dimensions with rationale, confidence and limitations. Material
              disagreement with the other round opens a human adjudication automatically.
            </p>
          </>
        )}
      </TabPanel>

      <TabPanel tabId="integrity" active={tab === "integrity"}>
        <Notice tone="info" title="Integrity evidence is a separate, privileged area (ADR-003)">
          Performance reviewers assess work quality without integrity context. If something in the evidence requires an
          integrity check, escalate to your organisation administrator — access is role-gated, audited and produces
          context, never an automated verdict. Integrity information can never modify performance anchors.
        </Notice>
      </TabPanel>
    </section>
  );
}
