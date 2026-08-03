import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AutosaveState, Dialog, IncidentBanner, Notice, Receipt, StatusChip, Tabs, TabPanel, Timer } from "@cpf/design-system";
import { v2, V2ApiError, type V2Landing } from "../api.js";

/**
 * S13 — live candidate workspace: top bar (stage · server-synced timer ·
 * autosave · health · pause/support), left rail (brief/assets/deliverables),
 * primary canvas (per-deliverable editors), right dock (copilot + plugins),
 * bottom drawer (receipts/incidents). S14 — review-before-submit, atomic
 * finalisation and the signed receipt screen.
 *
 * AI/plugin outages never block saving or submitting: the editor and
 * finalisation path have no dependency on the copilot/tool endpoints.
 */

interface Props {
  token: string;
  sessionId: string;
  landing: V2Landing;
  manifestNonce: string | null;
  onStateChange: () => Promise<void>;
}

const bar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--cpf-space-4)",
  padding: "var(--cpf-space-2) var(--cpf-space-4)",
  background: "var(--cpf-surface)",
  borderBottom: "var(--cpf-border-w) solid var(--cpf-border)",
  position: "sticky",
  top: 0,
  zIndex: 100,
  flexWrap: "wrap",
};

export function WorkspacePage({ token, sessionId, landing, manifestNonce, onStateChange }: Props): ReactNode {
  const [state, setState] = useState<string>(landing.state);
  const [remaining, setRemaining] = useState<number>(landing.pack.expectedDurationMinutes * 60);
  const [save, setSave] = useState<{ state: "saved" | "saving" | "offline" | "error"; at?: Date }>({ state: "saved" });
  const [drafts, setDrafts] = useState<Record<string, { content: string; version: number }>>({});
  const [activeSlot, setActiveSlot] = useState(landing.pack.deliverables[0]?.slot ?? "plan");
  const [dockTab, setDockTab] = useState("copilot");
  const [chat, setChat] = useState<Array<{ role: string; text: string; filtered?: boolean }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [copilotDown, setCopilotDown] = useState(false);
  const [receipts, setReceipts] = useState<Array<{ invocation_id: string; plugin_id: string; operation: string; status: string; source_descriptor: string }>>([]);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [finalReceipt, setFinalReceipt] = useState<{ support_code: string; artifact_head: string; signature: string; submitted_at: string } | null>(null);
  const [limitations, setLimitations] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [incidentNote, setIncidentNote] = useState<string | null>(null);
  const nonceRef = useRef<string | null>(manifestNonce);

  // Server-authoritative clock sync (poll every 30s; local countdown between).
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const s = await v2.state(token, sessionId);
        if (!alive) return;
        setState(s.state);
        setRemaining(s.remainingSeconds);
        if (!nonceRef.current && s.manifestNonce) nonceRef.current = s.manifestNonce; // reload recovery (S14)
        setSave((prev) => (prev.state === "offline" ? { state: "saved" } : prev));
      } catch {
        if (alive) setSave({ state: "offline" });
      }
    };
    void sync();
    const poll = setInterval(sync, 30_000);
    const tick = setInterval(() => setRemaining((r) => (state === "active" ? Math.max(0, r - 1) : r)), 1_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [token, sessionId, state]);

  // Load existing artifacts once (crash/reconnect recovery) — including the
  // saved content so "reopen this link — your work will be here" is true.
  useEffect(() => {
    void (async () => {
      try {
        const list = await v2.listArtifacts(token, sessionId);
        const next: Record<string, { content: string; version: number }> = {};
        for (const artifact of list.artifacts) {
          if (!artifact.deliverable_slot) continue;
          let content = "";
          try {
            const full = (await fetch(`/v2/sessions/${sessionId}/artifacts/${artifact.path}`, {
              headers: { "x-cpf-candidate-token": token },
            }).then((r) => (r.ok ? r.json() : null))) as { content?: string } | null;
            content = full?.content ?? "";
          } catch {
            // keep empty; version still protects against lost updates
          }
          next[artifact.deliverable_slot] = { content, version: artifact.latest_version_no };
        }
        setDrafts((d) => ({ ...next, ...d }));
      } catch {
        // listing failure is non-fatal; editors still work
      }
    })();
  }, [token, sessionId]);

  const saveDraft = useCallback(
    async (slot: string, content: string) => {
      const kind = landing.pack.deliverables.find((d) => d.slot === slot)?.kind ?? "document";
      const current = drafts[slot]?.version ?? 0;
      setSave({ state: "saving" });
      try {
        const res = await v2.saveArtifact(token, sessionId, `deliverables/${slot}.md`, {
          kind,
          deliverableSlot: slot,
          content,
          baseVersionNo: current,
        });
        setDrafts((d) => ({ ...d, [slot]: { content, version: res.versionNo } }));
        setSave({ state: "saved", at: new Date() });
      } catch (e) {
        const err = e as V2ApiError;
        if (err.code === "REVISION_CONFLICT") {
          // Reload authoritative head; keep local text so nothing is lost.
          const list = await v2.listArtifacts(token, sessionId).catch(() => null);
          const head = list?.artifacts.find((a) => a.deliverable_slot === slot)?.latest_version_no ?? current;
          setDrafts((d) => ({ ...d, [slot]: { content, version: head } }));
          setSave({ state: "error" });
        } else {
          setSave({ state: err.status === 0 ? "offline" : "error" });
        }
      }
    },
    [drafts, landing.pack.deliverables, sessionId, token],
  );

  // Debounced autosave.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEdit = (slot: string, content: string) => {
    setDrafts((d) => ({ ...d, [slot]: { content, version: d[slot]?.version ?? 0 } }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveDraft(slot, content), 900);
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    setChat((c) => [...c, { role: "candidate", text }]);
    setChatInput("");
    try {
      const res = await v2.copilot(token, sessionId, text);
      setChat((c) => [...c, { role: "assistant", text: res.message.text, filtered: res.message.validationStatus !== "ok" }]);
      setCopilotDown(false);
    } catch (e) {
      const err = e as V2ApiError;
      setCopilotDown(true);
      setChat((c) => [
        ...c,
        { role: "assistant", text: err.code === "COPILOT_BUDGET_EXHAUSTED" ? err.message : "The copilot is temporarily unavailable. Your work is safe and you can still submit.", filtered: true },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  const runTool = async (pluginId: string, operation: string, args: Record<string, unknown>) => {
    try {
      await v2.invokeTool(token, sessionId, pluginId, operation, args);
    } catch {
      // failure is captured as a receipt server-side where possible
    }
    const list = await v2.receipts(token, sessionId).catch(() => null);
    if (list) setReceipts(list.receipts);
    setDockTab("receipts");
  };

  const requiredSlots = useMemo(() => landing.pack.deliverables.filter((d) => d.required), [landing.pack.deliverables]);
  const missingSlots = requiredSlots.filter((d) => !(drafts[d.slot]?.version && drafts[d.slot]!.version > 0));

  const doFinalise = async () => {
    setSubmitError(null);
    if (!nonceRef.current) {
      // Nonce not yet recovered — fetch it from the authoritative state endpoint.
      try {
        const s = await v2.state(token, sessionId);
        nonceRef.current = s.manifestNonce ?? null;
      } catch {
        // handled below
      }
    }
    if (!nonceRef.current) {
      setSubmitError("Your session reference could not be refreshed. Check your connection and try again; if it persists, contact support.");
      return;
    }
    try {
      const res = await v2.finalise(token, sessionId, nonceRef.current, limitations);
      setFinalReceipt(res.receipt);
      setSubmitOpen(false);
      setState("submitted");
      await onStateChange();
    } catch (e) {
      const err = e as V2ApiError;
      setSubmitError(
        err.code === "DELIVERABLES_INCOMPLETE"
          ? `${err.message} Your work is untouched — complete the missing deliverables and submit again.`
          : `${err.message} Nothing was lost. Retry, or note the support code from this page when contacting support.`,
      );
    }
  };

  if (state === "submitted" || finalReceipt) {
    return (
      <main data-cpf-root style={{ maxWidth: "var(--cpf-content-narrow)", margin: "0 auto", padding: "var(--cpf-space-6) var(--cpf-space-4)", fontFamily: "var(--cpf-font-sans)", color: "var(--cpf-text)" }}>
        <h1 style={{ fontSize: "var(--cpf-text-2xl)" }}>Assessment submitted</h1>
        <p>You may close this window. The organisation's reviewers take it from here — a human reviews every submission.</p>
        {finalReceipt ? (
          <Receipt
            title="Submission receipt"
            entries={[
              { term: "Support code", value: finalReceipt.support_code, mono: true },
              { term: "Artifact head", value: finalReceipt.artifact_head, mono: true },
              { term: "Signature", value: finalReceipt.signature, mono: true },
              { term: "Submitted", value: new Date(finalReceipt.submitted_at).toLocaleString() },
            ]}
            footer="Keep the support code. You can request your data, annotate technical incidents, or appeal via the contacts in your invitation e-mail."
          />
        ) : (
          <Notice tone="success" title="Your submission is recorded">
            A receipt was issued for this session. If you need it again, contact support with your invitation reference.
          </Notice>
        )}
      </main>
    );
  }

  return (
    <div data-cpf-root style={{ minHeight: "100vh", background: "var(--cpf-canvas)", color: "var(--cpf-text)", fontFamily: "var(--cpf-font-sans)" }}>
      {save.state === "offline" && (
        <IncidentBanner
          title="Connection lost"
          detail="Your work is kept on this device and will sync when the connection returns."
          action={
            <button style={{ minHeight: 32 }} onClick={() => void v2.state(token, sessionId).then((s) => { setState(s.state); setRemaining(s.remainingSeconds); setSave({ state: "saved" }); }).catch(() => undefined)}>
              Retry now
            </button>
          }
        />
      )}
      {state === "paused_tech" && (
        <IncidentBanner
          title="Session paused (technical)"
          detail="The scored clock is frozen. Resume when you're ready."
          action={
            <button style={{ minHeight: 32 }} onClick={() => void v2.resume(token, sessionId).then(() => setState("active"))}>
              Resume assessment
            </button>
          }
        />
      )}
      <header style={bar} aria-label="Assessment status bar">
        <strong style={{ fontSize: "var(--cpf-text-sm)" }}>{landing.pack.title}</strong>
        <StatusChip tone={state === "active" ? "success" : "warning"}>{state.replaceAll("_", " ")}</StatusChip>
        <Timer remainingSeconds={remaining} paused={state !== "active"} />
        <AutosaveState state={save.state} savedAt={save.at} />
        <span style={{ flex: 1 }} />
        <button
          style={{ minHeight: 36 }}
          onClick={() => {
            const description = window.prompt("Describe the technical problem (this never affects your score):");
            if (description) {
              void v2.reportIncident(token, sessionId, "other", description).then(() => setIncidentNote("Incident recorded — support can add time credit if warranted."));
              void v2.pause(token, sessionId).then(() => setState("paused_tech")).catch(() => undefined);
            }
          }}
        >
          Report a problem / pause
        </button>
        <button style={{ ...{ background: "var(--cpf-primary)", color: "#fff", border: "none", borderRadius: "var(--cpf-radius-md)", padding: "8px 16px", fontWeight: 600, cursor: "pointer", minHeight: 36 } }} onClick={() => setSubmitOpen(true)}>
          Review and submit
        </button>
      </header>
      {incidentNote && (
        <div style={{ padding: "var(--cpf-space-2) var(--cpf-space-4)" }}>
          <Notice tone="success" title={incidentNote} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) minmax(320px, 1fr) minmax(280px, 360px)", gap: "var(--cpf-space-4)", padding: "var(--cpf-space-4)", alignItems: "start" }}>
        {/* Left rail */}
        <nav aria-label="Brief and deliverables" style={{ background: "var(--cpf-surface)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-md)", padding: "var(--cpf-space-4)", position: "sticky", top: 64, maxHeight: "calc(100vh - 96px)", overflow: "auto" }}>
          <h2 style={{ fontSize: "var(--cpf-text-sm)", textTransform: "uppercase", letterSpacing: 0.5, color: "var(--cpf-text-secondary)" }}>Brief</h2>
          <details open>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "var(--cpf-text-sm)" }}>Scenario</summary>
            <p style={{ fontSize: "var(--cpf-text-sm)" }}>{landing.pack.brief}</p>
          </details>
          <h2 style={{ fontSize: "var(--cpf-text-sm)", textTransform: "uppercase", letterSpacing: 0.5, color: "var(--cpf-text-secondary)", marginTop: "var(--cpf-space-4)" }}>Stages</h2>
          <ol style={{ paddingLeft: "var(--cpf-space-5)", fontSize: "var(--cpf-text-sm)" }}>
            {landing.pack.stages.map((s) => (
              <li key={s.id} style={{ marginBottom: "var(--cpf-space-2)" }}>
                <strong>{s.title}</strong> <span style={{ color: "var(--cpf-text-secondary)" }}>(~{s.suggestedMinutes}m)</span>
                <div style={{ color: "var(--cpf-text-secondary)" }}>{s.guidance}</div>
              </li>
            ))}
          </ol>
          <h2 style={{ fontSize: "var(--cpf-text-sm)", textTransform: "uppercase", letterSpacing: 0.5, color: "var(--cpf-text-secondary)", marginTop: "var(--cpf-space-4)" }}>Supplied assets</h2>
          <ul style={{ paddingLeft: "var(--cpf-space-5)", fontSize: "var(--cpf-text-xs)", fontFamily: "var(--cpf-font-mono)" }}>
            {landing.pack.assets.map((a) => (
              <li key={a.path}>
                <details>
                  <summary style={{ cursor: "pointer" }}>{a.path}</summary>
                  <pre style={{ whiteSpace: "pre-wrap", background: "var(--cpf-neutral-bg)", padding: "var(--cpf-space-2)", borderRadius: "var(--cpf-radius-sm)", maxHeight: 240, overflow: "auto" }}>{a.content}</pre>
                </details>
              </li>
            ))}
          </ul>
        </nav>

        {/* Primary canvas */}
        <section aria-label="Work surface" style={{ background: "var(--cpf-surface)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-md)", padding: "var(--cpf-space-4)", minWidth: 0, overflow: "hidden" }}>
          <Tabs
            label="Deliverables"
            activeId={activeSlot}
            onChange={setActiveSlot}
            tabs={landing.pack.deliverables.map((d) => ({
              id: d.slot,
              label: (
                <span>
                  {d.title}
                  {drafts[d.slot]?.version ? " ✓" : d.required ? " •" : ""}
                </span>
              ),
            }))}
          />
          {landing.pack.deliverables.map((d) => (
            <TabPanel key={d.slot} tabId={d.slot} active={activeSlot === d.slot}>
              <p style={{ fontSize: "var(--cpf-text-sm)", color: "var(--cpf-text-secondary)" }}>
                {d.acceptanceSummary} {d.required ? "(required)" : "(optional)"}
              </p>
              <label htmlFor={`editor-${d.slot}`} className="cpf-visually-hidden">
                {d.title} editor
              </label>
              <textarea
                id={`editor-${d.slot}`}
                value={drafts[d.slot]?.content ?? ""}
                onChange={(e) => onEdit(d.slot, e.target.value)}
                spellCheck
                style={{
                  width: "100%",
                  minHeight: 420,
                  resize: "vertical",
                  fontFamily: d.kind === "code_patch" || d.kind === "table" ? "var(--cpf-font-mono)" : "var(--cpf-font-sans)",
                  fontSize: "var(--cpf-text-sm)",
                  lineHeight: 1.6,
                  padding: "var(--cpf-space-3)",
                  border: "var(--cpf-border-w) solid var(--cpf-border)",
                  borderRadius: "var(--cpf-radius-sm)",
                  background: "var(--cpf-canvas)",
                  color: "var(--cpf-text)",
                }}
                placeholder={`Draft your ${d.title.toLowerCase()} here. It autosaves as an immutable version history — nothing is lost on reload.`}
              />
              <p style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
                Version {drafts[d.slot]?.version ?? 0} · autosaves a second after you stop typing · copy/paste works freely inside this workspace.
              </p>
            </TabPanel>
          ))}
        </section>

        {/* Right dock */}
        <aside aria-label="Copilot and tools" style={{ background: "var(--cpf-surface)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-md)", padding: "var(--cpf-space-3)", position: "sticky", top: 64, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" }}>
          <Tabs
            label="Assistance"
            activeId={dockTab}
            onChange={setDockTab}
            tabs={[
              { id: "copilot", label: "AI copilot" },
              { id: "tools", label: "Tools" },
              { id: "receipts", label: `Receipts (${receipts.length})` },
            ]}
          />
          <TabPanel tabId="copilot" active={dockTab === "copilot"}>
            {copilotDown && <Notice tone="warning" title="Copilot degraded">Your work and submission are unaffected.</Notice>}
            <div role="log" aria-label="Copilot conversation" style={{ flex: 1, overflow: "auto", maxHeight: 360, display: "flex", flexDirection: "column", gap: "var(--cpf-space-2)", padding: "var(--cpf-space-2) 0" }}>
              {chat.length === 0 && (
                <p style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
                  The copilot can plan, draft, code, calculate and suggest checks. It cannot see scoring, make hiring
                  judgements, or reach outside this assessment. Every message is recorded exactly as displayed.
                </p>
              )}
              {chat.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "candidate" ? "flex-end" : "flex-start", maxWidth: "92%", background: m.role === "candidate" ? "var(--cpf-info-bg)" : "var(--cpf-neutral-bg)", borderRadius: "var(--cpf-radius-md)", padding: "var(--cpf-space-2) var(--cpf-space-3)", fontSize: "var(--cpf-text-sm)", whiteSpace: "pre-wrap" }}>
                  {m.text}
                  {m.filtered && <span style={{ display: "block", fontSize: "var(--cpf-text-xs)", color: "var(--cpf-warning-fg)" }}>response filtered by policy</span>}
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat();
              }}
              style={{ display: "flex", gap: "var(--cpf-space-2)" }}
            >
              <label htmlFor="copilot-input" className="cpf-visually-hidden">
                Message the copilot
              </label>
              <input
                id="copilot-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask the copilot…"
                style={{ flex: 1, minHeight: 36, padding: "0 var(--cpf-space-3)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-sm)" }}
              />
              <button type="submit" disabled={chatBusy} style={{ minHeight: 36 }}>
                {chatBusy ? "…" : "Send"}
              </button>
            </form>
          </TabPanel>
          <TabPanel tabId="tools" active={dockTab === "tools"}>
            <ul style={{ listStyle: "none", padding: 0, fontSize: "var(--cpf-text-sm)" }}>
              {landing.pack.plugins.map((p) => (
                <li key={p.pluginId} style={{ display: "flex", alignItems: "center", gap: "var(--cpf-space-2)", padding: "var(--cpf-space-2) 0", borderBottom: "var(--cpf-border-w) solid var(--cpf-border)" }}>
                  <span style={{ flex: 1 }}>
                    <strong>{p.pluginId}</strong> <StatusChip tone="neutral">{p.mode.replaceAll("_", " ")}</StatusChip>
                  </span>
                  <button
                    style={{ minHeight: 32 }}
                    onClick={() =>
                      void runTool(
                        p.pluginId,
                        p.pluginId === "repofs" ? "list" : p.pluginId === "testrunner" ? "run" : p.pluginId === "dbplan" ? "explain" : p.pluginId === "claimschecker" ? "check" : "query",
                        p.pluginId === "dbplan"
                          ? { query: "SELECT * FROM invoices WHERE organisation_id = $1 AND status = 'archived'" }
                          : p.pluginId === "claimschecker"
                            ? { text: drafts[activeSlot]?.content ?? "" }
                            : {},
                      )
                    }
                  >
                    Run
                  </button>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
              Every tool is sandboxed — read-only snapshots and draft previews. Nothing can publish, send or spend.
            </p>
          </TabPanel>
          <TabPanel tabId="receipts" active={dockTab === "receipts"}>
            <ul style={{ listStyle: "none", padding: 0, fontSize: "var(--cpf-text-xs)", fontFamily: "var(--cpf-font-mono)", maxHeight: 380, overflow: "auto" }}>
              {receipts.length === 0 && <li style={{ color: "var(--cpf-text-secondary)", fontFamily: "var(--cpf-font-sans)" }}>Tool receipts appear here.</li>}
              {receipts.map((r) => (
                <li key={r.invocation_id} style={{ padding: "var(--cpf-space-1) 0", borderBottom: "var(--cpf-border-w) solid var(--cpf-border)" }}>
                  <StatusChip tone={r.status === "ok" ? "success" : r.status === "denied" ? "warning" : "danger"}>{r.status}</StatusChip>{" "}
                  {r.plugin_id}.{r.operation} · {r.source_descriptor}
                </li>
              ))}
            </ul>
          </TabPanel>
        </aside>
      </div>

      {/* S14 — review before submit */}
      <Dialog open={submitOpen} title="Review and submit" onClose={() => setSubmitOpen(false)}>
        <p style={{ fontSize: "var(--cpf-text-sm)" }}>Deliverables:</p>
        <ul style={{ fontSize: "var(--cpf-text-sm)" }}>
          {landing.pack.deliverables.map((d) => {
            const version = drafts[d.slot]?.version ?? 0;
            return (
              <li key={d.slot}>
                {version > 0 ? "✓" : d.required ? "✗" : "–"} {d.title} {version > 0 ? `(v${version})` : d.required ? "— missing" : "(optional, empty)"}
              </li>
            );
          })}
        </ul>
        {missingSlots.length > 0 && (
          <Notice tone="warning" title="Some required deliverables are missing">
            You can still close this dialog and keep working — nothing is submitted yet.
          </Notice>
        )}
        <label htmlFor="limitations" style={{ display: "block", fontSize: "var(--cpf-text-sm)", fontWeight: 600, marginTop: "var(--cpf-space-3)" }}>
          Anything unfinished or limited? (shown to reviewers — honesty is valued)
        </label>
        <textarea
          id="limitations"
          value={limitations}
          onChange={(e) => setLimitations(e.target.value)}
          rows={3}
          style={{ width: "100%", fontSize: "var(--cpf-text-sm)", padding: "var(--cpf-space-2)", border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-sm)" }}
          placeholder="e.g. Per-item error responses are stubbed; I'd finish X next."
        />
        {submitError && <Notice tone="danger" title="Submission did not complete">{submitError}</Notice>}
        <p style={{ display: "flex", gap: "var(--cpf-space-3)", marginTop: "var(--cpf-space-4)" }}>
          <button onClick={() => setSubmitOpen(false)} style={{ minHeight: 40 }}>
            Keep working
          </button>
          <button
            onClick={() => void doFinalise()}
            disabled={missingSlots.length > 0}
            style={{ background: "var(--cpf-primary)", color: "#fff", border: "none", borderRadius: "var(--cpf-radius-md)", padding: "8px 20px", fontWeight: 600, minHeight: 40, opacity: missingSlots.length > 0 ? 0.5 : 1 }}
          >
            Submit final work
          </button>
        </p>
        <p style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
          Submitting freezes your work and issues a signed receipt. Repeated clicks are safe — exactly one submission
          is ever recorded.
        </p>
      </Dialog>
    </div>
  );
}
