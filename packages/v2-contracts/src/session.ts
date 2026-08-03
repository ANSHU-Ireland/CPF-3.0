import { z } from "zod";

/**
 * S05 — V2 session lifecycle and shared scalar contracts.
 *
 * Rules: version every contract; UTC ISO-8601 datetimes; `.strict()` at
 * security-sensitive boundaries (unknown fields rejected); stable machine
 * error codes with `retryable`; no unversioned polymorphic payloads.
 */

export const CONTRACT_VERSION = "2026-08-03.1";

export const Uuid = z.string().uuid();
export const IsoDateTime = z.string().datetime({ offset: true });
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "sha-256 hex digest required");
export const IdempotencyKey = z.string().min(8).max(120);

/**
 * V2 session lifecycle (plan §Step 5):
 * invited → disclosed → preflight → ready → active ↔ paused_tech →
 * submitting → submitted → reviewing → finalised, plus expired / withdrawn /
 * support_review.
 */
export const SessionStateV2 = z.enum([
  "invited",
  "disclosed",
  "preflight",
  "ready",
  "active",
  "paused_tech",
  "submitting",
  "submitted",
  "reviewing",
  "finalised",
  "expired",
  "withdrawn",
  "support_review",
]);
export type SessionStateV2 = z.infer<typeof SessionStateV2>;

export const SessionEventV2 = z.enum([
  "disclose",
  "complete_preflight",
  "check_in",
  "start",
  "pause_tech",
  "resume",
  "begin_submit",
  "confirm_receipt",
  "begin_review",
  "finalise",
  "expire",
  "withdraw",
  "escalate_support",
  "resolve_support",
]);
export type SessionEventV2 = z.infer<typeof SessionEventV2>;

/**
 * Exhaustive legal transition table. Anything absent is illegal — the runtime
 * rejects it with STATE_CONFLICT. A technical pause never invalidates the
 * candidate (rule 1.1.10); time limit moves active → submitting, never failed.
 */
export const SESSION_TRANSITIONS_V2: Readonly<Record<string, SessionStateV2>> = {
  "invited:disclose": "disclosed",
  "disclosed:complete_preflight": "preflight",
  "preflight:check_in": "ready",
  "ready:start": "active",
  "active:pause_tech": "paused_tech",
  "paused_tech:resume": "active",
  "paused_tech:escalate_support": "support_review",
  "active:begin_submit": "submitting",
  "submitting:confirm_receipt": "submitted",
  "submitted:begin_review": "reviewing",
  "reviewing:finalise": "finalised",
  "invited:expire": "expired",
  "disclosed:expire": "expired",
  "preflight:expire": "expired",
  "ready:expire": "expired",
  "invited:withdraw": "withdrawn",
  "disclosed:withdraw": "withdrawn",
  "preflight:withdraw": "withdrawn",
  "ready:withdraw": "withdrawn",
  "active:withdraw": "withdrawn",
  "active:escalate_support": "support_review",
  "submitting:escalate_support": "support_review",
  "support_review:resolve_support": "active",
} as const;

export class IllegalTransitionV2Error extends Error {
  constructor(
    readonly from: SessionStateV2,
    readonly event: SessionEventV2,
  ) {
    super(`Session event "${event}" is not allowed in state "${from}".`);
    this.name = "IllegalTransitionV2Error";
  }
}

export function nextSessionState(from: SessionStateV2, event: SessionEventV2): SessionStateV2 {
  const to = SESSION_TRANSITIONS_V2[`${from}:${event}`];
  if (!to) throw new IllegalTransitionV2Error(from, event);
  return to;
}

/** Stable machine error envelope (mirrors V1's error contract; adds contractVersion). */
export const ErrorEnvelopeV2 = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        requestId: z.string(),
        retryable: z.boolean(),
        contractVersion: z.literal(CONTRACT_VERSION).optional(),
      })
      .strict(),
  })
  .strict();
