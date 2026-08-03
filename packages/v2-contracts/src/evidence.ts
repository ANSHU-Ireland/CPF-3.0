import { z } from "zod";
import { IsoDateTime, Sha256Hex, Uuid, IdempotencyKey } from "./session.js";

/**
 * S05 — AI interaction, plugin invocation/receipt, integrity event, technical
 * incident and review contracts.
 */

/** Displayed AI interaction — deliberately has NO field for hidden reasoning. */
export const AiInteractionV2 = z
  .object({
    contract: z.literal("ai-interaction"),
    version: z.literal(1),
    interactionId: Uuid,
    sessionId: Uuid,
    turnNo: z.number().int().positive(),
    role: z.enum(["candidate", "assistant"]),
    /** Exactly what was displayed. Nothing else exists to store. */
    displayedText: z.string().max(60_000),
    displayedTextHash: Sha256Hex,
    modelPin: z.string().min(1).max(120),
    promptVersion: z.string().min(1).max(64),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    validationStatus: z.enum(["ok", "refused", "filtered", "failed"]),
    createdAt: IsoDateTime,
  })
  .strict();

/**
 * Forbidden-output guard (ADR-002): deterministic code check applied to every
 * assistant message and every reviewer-assist output. Not a prompt.
 */
export const FORBIDDEN_AI_OUTPUT_PATTERNS: readonly RegExp[] = [
  /\b(hire|reject|do not hire|don'?t hire)\b\s+(this|the)\s+candidate/i,
  /\bcandidate\s+(passes|fails|passed|failed)\b/i,
  /\b(pass|fail)\s*[:\u2014-]\s*(candidate|assessment)/i,
  /\brank(ing|ed)?\s+(the\s+)?candidates?\b/i,
  /\b(overall|universal|final)\s+(candidate\s+)?score\b/i,
  /\bfit\s+score\b/i,
  /\bcheating\s+probability\b/i,
];

export function violatesForbiddenOutput(text: string): boolean {
  return FORBIDDEN_AI_OUTPUT_PATTERNS.some((p) => p.test(text));
}

/** Plugin invocation request (model/candidate arguments are untrusted). */
export const PluginInvocationV2 = z
  .object({
    contract: z.literal("plugin-invocation"),
    version: z.literal(1),
    invocationId: Uuid,
    sessionId: Uuid,
    pluginId: z.string().min(1).max(80),
    pluginVersion: z.string().min(1).max(40),
    operation: z.string().min(1).max(120),
    /** Validated against the plugin's own argument schema by the broker. */
    arguments: z.record(z.string(), z.unknown()),
    requestedBy: z.enum(["candidate", "assistant_proposal"]),
    /** State-changing sandbox actions need explicit candidate confirmation. */
    candidateConfirmed: z.boolean(),
    idempotencyKey: IdempotencyKey,
    requestedAt: IsoDateTime,
  })
  .strict();

/** Immutable, candidate-visible plugin receipt. */
export const PluginReceiptV2 = z
  .object({
    contract: z.literal("plugin-receipt"),
    version: z.literal(1),
    receiptId: Uuid,
    invocationId: Uuid,
    sessionId: Uuid,
    pluginId: z.string().min(1).max(80),
    pluginVersion: z.string().min(1).max(40),
    operation: z.string().min(1).max(120),
    status: z.enum(["ok", "failed", "timeout", "denied", "circuit_open"]),
    /** Source version / filters / window the result was computed from. */
    sourceDescriptor: z.string().max(500),
    resultHash: Sha256Hex.nullable(),
    resultBytes: z.number().int().nonnegative(),
    startedAt: IsoDateTime,
    completedAt: IsoDateTime,
  })
  .strict();

/** Typed integrity event (ADR-003): reliability-graded, candidate-visible, annotatable. */
export const IntegrityEventV2 = z
  .object({
    contract: z.literal("integrity-event"),
    version: z.literal(1),
    eventId: z.string().min(6).max(120),
    sessionId: Uuid,
    sequenceNo: z.number().int().positive(),
    eventType: z.enum([
      "focus_lost",
      "focus_regained",
      "external_clipboard_blocked",
      "network_disconnected",
      "network_reconnected",
      "companion_heartbeat_lost",
      "companion_reconnected",
      "process_rule_state_changed",
      "manifest_mismatch",
      "clock_drift_detected",
    ]),
    /** Rule id + state only — never process lists or content (minimisation). */
    ruleId: z.string().max(80).nullable(),
    state: z.string().max(80).nullable(),
    reliability: z.enum(["high", "medium", "low"]),
    candidateVisible: z.boolean(),
    annotationId: Uuid.nullable(),
    occurredAt: IsoDateTime,
    hash: Sha256Hex,
    previousHash: Sha256Hex.nullable(),
  })
  .strict();

export const TechnicalIncidentV2 = z
  .object({
    contract: z.literal("technical-incident"),
    version: z.literal(1),
    incidentId: Uuid,
    sessionId: Uuid,
    reportedBy: z.enum(["candidate", "system", "support"]),
    category: z.enum(["network", "device", "companion", "plugin", "ai_provider", "platform", "other"]),
    description: z.string().max(4000),
    /** Scored-clock credit granted (minutes); applied server-side, audited. */
    timeCreditMinutes: z.number().int().min(0).max(240),
    pauseApplied: z.boolean(),
    status: z.enum(["open", "resolved", "credited", "rejected"]),
    openedAt: IsoDateTime,
    resolvedAt: IsoDateTime.nullable(),
  })
  .strict();

/** One rubric dimension review — human anchor selection only (ADR-002). */
export const DimensionReviewV2 = z
  .object({
    contract: z.literal("dimension-review"),
    version: z.literal(1),
    reviewId: Uuid,
    sessionId: Uuid,
    dimensionId: z.string().min(1).max(80),
    /** Anchor selected by the human reviewer; assistants cannot set this. */
    anchor: z.enum(["not_observed", "developing", "capable", "strong", "exemplary"]),
    rationale: z.string().min(1).max(8000),
    confidence: z.enum(["low", "medium", "high"]),
    limitations: z.string().max(4000),
    citedEvidence: z.array(z.string().min(1).max(120)).min(0).max(64),
    counterEvidence: z.array(z.string().min(1).max(120)).max(64),
    followUpProbe: z.string().max(2000),
    reviewedBy: Uuid,
    reviewedAt: IsoDateTime,
  })
  .strict();

/** Signed submission / shutdown receipt. */
export const ShutdownReceiptV2 = z
  .object({
    contract: z.literal("shutdown-receipt"),
    version: z.literal(1),
    receiptId: Uuid,
    sessionId: Uuid,
    manifestNonce: Sha256Hex,
    artifactHead: Sha256Hex,
    eventHead: Sha256Hex.nullable(),
    submittedAt: IsoDateTime,
    supportCode: z.string().min(8).max(24),
    signature: Sha256Hex,
  })
  .strict();

/** Event batch envelope with idempotency (duplicates are safe replays). */
export const EventBatchV2 = z
  .object({
    contract: z.literal("event-batch"),
    version: z.literal(1),
    batchId: IdempotencyKey,
    sessionId: Uuid,
    events: z.array(IntegrityEventV2).min(1).max(200),
  })
  .strict();
