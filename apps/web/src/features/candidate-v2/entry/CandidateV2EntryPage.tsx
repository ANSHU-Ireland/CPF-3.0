import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useParams } from "react-router";
import "@cpf/design-system/tokens.css";
import { ErrorSummary, Notice, Skeleton, Stepper } from "@cpf/design-system";
import { v2, V2ApiError, type V2Landing } from "../api.js";
import { WorkspacePage } from "../runtime/WorkspacePage.js";

/**
 * S11+S12 — Candidate V2 entry: invitation summary → notice centre →
 * comprehension confirmation → accommodations → preflight checks → tutorial
 * note → explicit check-in → live workspace (S13). Single-column service
 * flow, 680px content width, one dominant action per screen.
 */

const wrap: CSSProperties = {
  maxWidth: "var(--cpf-content-narrow)",
  margin: "0 auto",
  padding: "var(--cpf-space-6) var(--cpf-space-4)",
  fontFamily: "var(--cpf-font-sans)",
  color: "var(--cpf-text)",
  lineHeight: "var(--cpf-leading)",
};

const primaryBtn: CSSProperties = {
  background: "var(--cpf-primary)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--cpf-radius-md)",
  padding: "12px 24px",
  fontSize: "var(--cpf-text-md)",
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};

export function CandidateV2EntryPage(): ReactNode {
  const { token = "" } = useParams<{ token: string }>();
  const [landing, setLanding] = useState<V2Landing | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await v2.landing(token);
      setLanding(data);
      setSessionId(data.sessionId);
      setError(null);
    } catch (e) {
      const err = e as V2ApiError;
      setError({ code: err.code ?? "NETWORK", message: err.message });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) {
    return (
      <main style={wrap} data-cpf-root>
        <h1 style={{ fontSize: "var(--cpf-text-2xl)" }}>We can't open this invitation</h1>
        <Notice tone={error.code === "EXPERIENCE_DISABLED" ? "warning" : "danger"} title={friendlyError(error.code)}>
          {error.message} If you believe this is a mistake, contact the organisation that invited you, or CPF support
          with the reference from your invitation e-mail.
        </Notice>
      </main>
    );
  }
  if (!landing) {
    return (
      <main style={wrap} data-cpf-root aria-busy="true">
        <p>Checking your invitation…</p>
        <Skeleton lines={5} />
      </main>
    );
  }

  const state = landing.state;
  if ((state === "active" || state === "paused_tech" || state === "submitting" || state === "submitted") && sessionId) {
    return <WorkspacePage token={token} sessionId={sessionId} landing={landing} manifestNonce={nonce} onStateChange={refresh} />;
  }

  const stepIndex = state === "invited" ? 0 : state === "disclosed" ? 1 : 2;

  return (
    <main style={wrap} data-cpf-root>
      <p style={{ color: "var(--cpf-text-secondary)", fontSize: "var(--cpf-text-xs)", letterSpacing: 0.6, textTransform: "uppercase" }}>
        CPF assessment — controlled pilot
      </p>
      <h1 style={{ fontSize: "var(--cpf-text-2xl)", margin: "var(--cpf-space-2) 0" }}>{landing.pack.title}</h1>
      <p style={{ color: "var(--cpf-text-secondary)" }}>
        For {landing.candidateName} · {landing.pack.targetRole} · about {landing.pack.expectedDurationMinutes} minutes
        of assessed work once you start the clock.
      </p>
      <Stepper steps={["Notices", "Compatibility", "Check-in", "Assessment"]} currentIndex={stepIndex} />

      {state === "invited" && (
        <NoticesStep
          landing={landing}
          busy={busy}
          onAcknowledge={async () => {
            setBusy(true);
            try {
              const res = await v2.disclose(token);
              setSessionId(res.sessionId);
              setNonce(res.manifest.nonce);
              await refresh();
            } catch (e) {
              const err = e as V2ApiError;
              setError({ code: err.code ?? "NETWORK", message: err.message });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {state === "disclosed" && (
        <PreflightStep
          landing={landing}
          busy={busy}
          onComplete={async () => {
            setBusy(true);
            try {
              await v2.lifecycle(token, "preflight/complete");
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {(state === "preflight" || state === "ready") && (
        <CheckInStep
          landing={landing}
          busy={busy}
          onCheckIn={async () => {
            setBusy(true);
            try {
              if (state === "preflight") await v2.lifecycle(token, "check-in");
              await v2.lifecycle(token, "start");
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </main>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "INVITATION_NOT_FOUND":
      return "This link is invalid or has expired";
    case "WRONG_EXPERIENCE_VERSION":
      return "This invitation uses the standard candidate portal";
    case "EXPERIENCE_DISABLED":
      return "The new experience is temporarily unavailable";
    default:
      return "Something went wrong";
  }
}

function NoticesStep({ landing, busy, onAcknowledge }: { landing: V2Landing; busy: boolean; onAcknowledge: () => void }): ReactNode {
  const [confirms, setConfirms] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const required = [
    { id: "c-ai", label: "AI assistance is provided and its visible use is part of the assessment. I decide what to accept." },
    { id: "c-monitoring", label: "Focus, clipboard-boundary and connection events are recorded during the live assessment — never my screen content or camera." },
    { id: "c-human", label: "Only trained human reviewers assess my work. No automated hiring decision is made about me." },
    { id: "c-rights", label: "I can request my data, annotate technical incidents, and appeal through an independent reviewer." },
  ];
  const allConfirmed = required.every((r) => confirms[r.id]);
  const errors =
    attempted && !allConfirmed
      ? required.filter((r) => !confirms[r.id]).map((r) => ({ fieldId: r.id, message: `Confirm: ${r.label.slice(0, 56)}…` }))
      : [];

  return (
    <section aria-label="Notices and confirmation">
      <Notice tone="info" title="Before you begin — how this assessment works">
        You will complete realistic work for the {landing.pack.targetRole} role with an AI copilot and sandboxed
        professional tools. Nothing you do here can reach a live system. Your invitation stays valid until its
        deadline; the {landing.pack.expectedDurationMinutes}-minute clock starts only when you explicitly check in.
      </Notice>

      <h2 style={{ fontSize: "var(--cpf-text-lg)" }}>What is and isn't assessed</h2>
      <ul>
        <li>Assessed: the dimensions listed below, from the work you submit and how you verify it.</li>
        <li>Not assessed: how much or little you use the AI, tutorial exploration, technical problems, or accommodation use.</li>
      </ul>
      <p style={{ fontSize: "var(--cpf-text-sm)", color: "var(--cpf-text-secondary)" }}>
        Dimensions: {landing.pack.dimensions.map((d) => d.dimensionId.replaceAll("_", " ")).join(", ")}.
      </p>

      <details style={{ margin: "var(--cpf-space-3) 0" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Data, retention and your rights (full notices)</summary>
        <ul style={{ fontSize: "var(--cpf-text-sm)" }}>
          {Object.entries(landing.notices).map(([key, version]) => (
            <li key={key}>
              {key}: version <code style={{ fontFamily: "var(--cpf-font-mono)" }}>{version}</code>
            </li>
          ))}
          <li>Camera capture is not part of this pilot. No biometric, emotion or gaze analysis exists in this product.</li>
          <li>Assessment evidence is retained 365 days; monitoring metadata 90 days; deletion requests are honoured subject to lawful holds.</li>
        </ul>
      </details>

      <h2 style={{ fontSize: "var(--cpf-text-lg)" }}>Accommodations and alternatives</h2>
      <p style={{ fontSize: "var(--cpf-text-sm)" }}>
        If you need extra time, assistive technology, or cannot use this format, contact the organisation that invited
        you — an equivalent supported route is available and using it is never held against you. {landing.pack.accessibilityNotes}
      </p>

      <ErrorSummary errors={errors} />
      <fieldset style={{ border: "var(--cpf-border-w) solid var(--cpf-border)", borderRadius: "var(--cpf-radius-md)", padding: "var(--cpf-space-4)" }}>
        <legend style={{ fontWeight: 600 }}>Please confirm you understand</legend>
        {required.map((r) => (
          <label key={r.id} htmlFor={r.id} style={{ display: "flex", gap: "var(--cpf-space-2)", margin: "var(--cpf-space-2) 0", fontSize: "var(--cpf-text-sm)" }}>
            <input
              id={r.id}
              type="checkbox"
              checked={Boolean(confirms[r.id])}
              onChange={(e) => setConfirms((c) => ({ ...c, [r.id]: e.target.checked }))}
              style={{ width: 20, height: 20, flexShrink: 0 }}
            />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>
      <p style={{ marginTop: "var(--cpf-space-4)" }}>
        <button
          style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
          disabled={busy}
          onClick={() => {
            setAttempted(true);
            if (allConfirmed) onAcknowledge();
          }}
        >
          {busy ? "Preparing your assessment…" : "Acknowledge notices and continue"}
        </button>
      </p>
      <p style={{ fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
        Acknowledging these notices records their versions with your invitation. It does not start the clock.
      </p>
    </section>
  );
}

function PreflightStep({ landing, busy, onComplete }: { landing: V2Landing; busy: boolean; onComplete: () => void }): ReactNode {
  const [checks, setChecks] = useState<Array<{ id: string; label: string; status: "checking" | "ready" | "action_needed"; detail?: string }>>([
    { id: "network", label: "Connection to the assessment service", status: "checking" },
    { id: "storage", label: "Local storage for crash recovery", status: "checking" },
    { id: "clock", label: "Clock synchronisation", status: "checking" },
    { id: "keyboard", label: "Keyboard and zoom support", status: "ready", detail: "Fully keyboard-operable; 200% zoom supported." },
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: Record<string, { status: "ready" | "action_needed"; detail?: string }> = {};
      try {
        const t0 = performance.now();
        const res = await fetch("/health");
        results.network = res.ok
          ? { status: "ready", detail: `Reachable (${Math.round(performance.now() - t0)} ms)` }
          : { status: "action_needed", detail: "The service responded with an error. Retry or use another network." };
      } catch {
        results.network = { status: "action_needed", detail: "Cannot reach the assessment service. Check your connection." };
      }
      try {
        localStorage.setItem("cpf.v2.preflight", "ok");
        localStorage.removeItem("cpf.v2.preflight");
        results.storage = { status: "ready" };
      } catch {
        results.storage = { status: "action_needed", detail: "Enable site storage (private-browsing modes can block recovery)." };
      }
      results.clock = { status: "ready", detail: "The server clock is authoritative; your display syncs automatically." };
      if (!cancelled) setChecks((prev) => prev.map((c) => (results[c.id] ? { ...c, ...results[c.id] } : c)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allReady = checks.every((c) => c.status === "ready");
  return (
    <section aria-label="Compatibility check">
      <h2 style={{ fontSize: "var(--cpf-text-lg)" }}>Compatibility check</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {checks.map((c) => (
          <li key={c.id} style={{ display: "flex", gap: "var(--cpf-space-3)", padding: "var(--cpf-space-2) 0", borderBottom: "var(--cpf-border-w) solid var(--cpf-border)" }}>
            <span aria-hidden="true">{c.status === "ready" ? "✓" : c.status === "checking" ? "…" : "→"}</span>
            <span style={{ flex: 1 }}>
              <strong style={{ fontSize: "var(--cpf-text-sm)" }}>{c.label}</strong>
              <span style={{ display: "block", fontSize: "var(--cpf-text-xs)", color: "var(--cpf-text-secondary)" }}>
                {c.status === "checking" ? "Checking…" : c.status === "ready" ? (c.detail ?? "Ready") : c.detail}
              </span>
            </span>
            <span style={{ fontSize: "var(--cpf-text-xs)", fontWeight: 700, color: c.status === "action_needed" ? "var(--cpf-warning-fg)" : "var(--cpf-success-fg)" }}>
              {c.status === "ready" ? "Ready" : c.status === "checking" ? "" : "Action needed"}
            </span>
          </li>
        ))}
      </ul>
      <Notice tone="info" title="Tutorial available, not scored">
        After check-in you'll see the live workspace. Exploring the tools before you press “Start the assessment” is
        not scored. Your brief: “{landing.pack.title}”.
      </Notice>
      <p>
        <button style={{ ...primaryBtn, opacity: busy || !allReady ? 0.6 : 1 }} disabled={busy || !allReady} onClick={onComplete}>
          {busy ? "Saving…" : "Everything is ready — continue"}
        </button>
      </p>
      {!allReady && (
        <p style={{ fontSize: "var(--cpf-text-sm)", color: "var(--cpf-text-secondary)" }}>
          Fix the items marked “action needed”, or contact support for the alternative route — a device limitation
          never counts against you.
        </p>
      )}
    </section>
  );
}

function CheckInStep({ landing, busy, onCheckIn }: { landing: V2Landing; busy: boolean; onCheckIn: () => void }): ReactNode {
  return (
    <section aria-label="Check in">
      <h2 style={{ fontSize: "var(--cpf-text-lg)" }}>Ready to start?</h2>
      <p>
        Pressing the button below starts your {landing.pack.expectedDurationMinutes}-minute assessment clock. Make sure
        you have the time available now — you can pause for technical problems, and those pauses never count against you.
      </p>
      <ul style={{ fontSize: "var(--cpf-text-sm)" }}>
        <li>Your work saves automatically every few seconds.</li>
        <li>If your connection drops, reopen this link — your work will be here.</li>
        <li>The AI copilot and tools are available throughout; using them is expected.</li>
      </ul>
      <p>
        <button style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={onCheckIn}>
          {busy ? "Starting…" : "Start the assessment"}
        </button>
      </p>
    </section>
  );
}
