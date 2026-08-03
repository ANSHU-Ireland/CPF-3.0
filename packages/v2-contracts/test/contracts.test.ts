import { describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import {
  AssessmentManifestV2,
  EventBatchV2,
  IllegalTransitionV2Error,
  SESSION_TRANSITIONS_V2,
  SessionStateV2,
  SessionEventV2,
  nextSessionState,
  signManifest,
  verifyManifestSignature,
  violatesForbiddenOutput,
} from "../src/index.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function baseManifest() {
  return {
    contract: "assessment-manifest" as const,
    version: 1 as const,
    manifestId: randomUUID(),
    sessionId: randomUUID(),
    organisationId: randomUUID(),
    invitationId: randomUUID(),
    nonce: sha("nonce"),
    packCode: "SWE-FS-01",
    packVersion: 1,
    packContentHash: sha("pack"),
    promptVersion: "copilot-2026-08-03.1",
    modelPin: "gpt-4o-mini@2024-07-18",
    rubricVersion: "rubric-2026-08-03.1",
    noticeVersions: { privacyNotice: "2026-07-01" },
    policyVersion: "policy-2026-08-03.1",
    tools: [
      { pluginId: "repofs", pluginVersion: "1.0.0", mode: "session_sandbox" as const, maxInvocations: 500 },
    ],
    companion: {
      required: false,
      minVersion: "0.2.0",
      heartbeatIntervalSeconds: 20,
      heartbeatLossPolicy: "pause_tech" as const,
      internalClipboardOnly: true,
      cameraRequired: false as const,
    },
    timeboxMinutes: 110,
    allowedEndpoints: ["https://api.cpf.example/v2"],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("S05 session state machine", () => {
  it("walks the happy path end to end", () => {
    let s: SessionStateV2 = "invited";
    for (const e of ["disclose", "complete_preflight", "check_in", "start", "begin_submit", "confirm_receipt", "begin_review", "finalise"] as SessionEventV2[]) {
      s = nextSessionState(s, e);
    }
    expect(s).toBe("finalised");
  });

  it("technical pause is safe and reversible; it never invalidates", () => {
    expect(nextSessionState("active", "pause_tech")).toBe("paused_tech");
    expect(nextSessionState("paused_tech", "resume")).toBe("active");
    expect(Object.values(SESSION_TRANSITIONS_V2)).not.toContain("failed");
  });

  it("rejects every illegal transition exhaustively", () => {
    const states = SessionStateV2.options;
    const events = SessionEventV2.options;
    let illegal = 0;
    for (const from of states) {
      for (const event of events) {
        if (!(`${from}:${event}` in SESSION_TRANSITIONS_V2)) {
          expect(() => nextSessionState(from, event)).toThrow(IllegalTransitionV2Error);
          illegal += 1;
        }
      }
    }
    expect(illegal).toBe(states.length * events.length - Object.keys(SESSION_TRANSITIONS_V2).length);
  });

  it("a submitted session can never return to a mutable state", () => {
    const reachableFromSubmitted = Object.entries(SESSION_TRANSITIONS_V2)
      .filter(([k]) => k.startsWith("submitted:") || k.startsWith("reviewing:") || k.startsWith("finalised:"))
      .map(([, v]) => v);
    for (const to of reachableFromSubmitted) {
      expect(["reviewing", "finalised"]).toContain(to);
    }
  });
});

describe("S05 manifest contract", () => {
  it("signs and verifies; any field tamper breaks the signature", () => {
    const unsigned = baseManifest();
    const signature = signManifest(unsigned, "test-signing-key");
    const manifest = AssessmentManifestV2.parse({ ...unsigned, signature });
    expect(verifyManifestSignature(manifest, "test-signing-key")).toBe(true);
    const tampered = { ...manifest, timeboxMinutes: 200 };
    expect(verifyManifestSignature(tampered, "test-signing-key")).toBe(false);
  });

  it("rejects unknown fields (strict boundary)", () => {
    const unsigned = baseManifest();
    const signature = signManifest(unsigned, "k");
    expect(() => AssessmentManifestV2.parse({ ...unsigned, signature, extraField: 1 })).toThrow();
  });

  it("camera capture cannot be required (DPIA gate A4 encoded in the type)", () => {
    const unsigned = baseManifest();
    const bad = { ...unsigned, companion: { ...unsigned.companion, cameraRequired: true } };
    expect(() => AssessmentManifestV2.parse({ ...bad, signature: signManifest(bad as never, "k") })).toThrow();
  });
});

describe("S05 forbidden AI output guard (ADR-002)", () => {
  it.each([
    "I would hire this candidate immediately",
    "Candidate fails the bar for this role",
    "Ranking the candidates: 1) A 2) B",
    "Overall score: 87/100",
    "fit score of 9.2",
    "cheating probability is 80%",
  ])("blocks: %s", (text) => {
    expect(violatesForbiddenOutput(text)).toBe(true);
  });

  it.each([
    "Here is a draft plan for the landing page experiment",
    "The failing test is in checkout.test.ts — consider the null case",
    "Two options; option B has fewer risks for rollback",
  ])("allows normal assistance: %s", (text) => {
    expect(violatesForbiddenOutput(text)).toBe(false);
  });
});

describe("S05 event batch replay safety", () => {
  it("accepts a well-formed batch and refuses >200 events", () => {
    const ev = {
      contract: "integrity-event" as const,
      version: 1 as const,
      eventId: "evt-000001",
      sessionId: randomUUID(),
      sequenceNo: 1,
      eventType: "focus_lost" as const,
      ruleId: null,
      state: null,
      reliability: "high" as const,
      candidateVisible: true,
      annotationId: null,
      occurredAt: new Date().toISOString(),
      hash: sha("e1"),
      previousHash: null,
    };
    expect(() =>
      EventBatchV2.parse({ contract: "event-batch", version: 1, batchId: "batch-0001", sessionId: ev.sessionId, events: [ev] }),
    ).not.toThrow();
    const oversized = Array.from({ length: 201 }, (_, i) => ({ ...ev, eventId: `evt-oversz-${i}`, sequenceNo: i + 1 }));
    expect(() =>
      EventBatchV2.parse({ contract: "event-batch", version: 1, batchId: "batch-0002", sessionId: ev.sessionId, events: oversized }),
    ).toThrow();
  });
});
