import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * S15 — proctor companion protocol.
 *
 * The bridge between the companion webview and the native side is NARROW and
 * TYPED: exactly these messages, nothing else. There is no arbitrary shell,
 * no filesystem API, no process-list transfer (only rule id + state), no
 * audio, no biometric/emotion/gaze capability — such messages do not exist
 * in this protocol and cannot be added without a new protocol version and a
 * DPIA-gated review.
 */

export const PROTOCOL_VERSION = 1;

/** Web → native bridge commands (the complete set). */
export const BridgeCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validate_manifest"), manifestJwt: z.string().min(16).max(16_384) }).strict(),
  z.object({ type: z.literal("begin_session"), sessionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("heartbeat_now") }).strict(),
  z.object({ type: z.literal("pause_watchers") }).strict(),
  z.object({ type: z.literal("resume_watchers") }).strict(),
  z.object({ type: z.literal("begin_shutdown"), receiptSignature: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
]);
export type BridgeCommand = z.infer<typeof BridgeCommand>;

/** Native → web bridge events (the complete set). */
export const BridgeEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manifest_valid"), sessionId: z.string().uuid(), policyVersion: z.string() }).strict(),
  z.object({ type: z.literal("manifest_invalid"), reason: z.enum(["expired", "signature", "version"]) }).strict(),
  z.object({
    type: z.literal("watcher_state"),
    ruleId: z.string().max(80),
    state: z.enum(["ok", "violation", "unavailable"]),
  }).strict(),
  z.object({ type: z.literal("clipboard_boundary"), direction: z.enum(["external_paste_blocked", "external_copy_blocked"]) }).strict(),
  z.object({ type: z.literal("heartbeat_sent"), sequenceNo: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("shutdown_step"), step: ShutdownStepSchema() }).strict(),
]);
export type BridgeEvent = z.infer<typeof BridgeEvent>;

function ShutdownStepSchema() {
  return z.enum([
    "freeze_mutations",
    "flush_heads",
    "verify_receipt",
    "revoke_tokens",
    "stop_watchers",
    "clear_ephemeral",
    "retain_receipt",
    "terminate",
  ]);
}

/**
 * The verified self-termination sequence (plan §Step 15). Order is a
 * contract: verify_receipt MUST precede revoke/stop/clear steps, and
 * terminate is only reachable after every prior step reports done.
 */
export const SHUTDOWN_SEQUENCE = [
  "freeze_mutations",
  "flush_heads",
  "verify_receipt",
  "revoke_tokens",
  "stop_watchers",
  "clear_ephemeral",
  "retain_receipt",
  "terminate",
] as const;
export type ShutdownStep = (typeof SHUTDOWN_SEQUENCE)[number];

export class ShutdownOrderError extends Error {
  constructor(step: ShutdownStep, expected: ShutdownStep) {
    super(`Shutdown step "${step}" attempted before "${expected}" completed.`);
    this.name = "ShutdownOrderError";
  }
}

/** Pure sequencer: returns the next required step, throws on out-of-order attempts. */
export function nextShutdownStep(completed: readonly ShutdownStep[], attempted: ShutdownStep): ShutdownStep {
  const expected = SHUTDOWN_SEQUENCE[completed.length];
  if (!expected) throw new ShutdownOrderError(attempted, "terminate");
  if (attempted !== expected) throw new ShutdownOrderError(attempted, expected);
  return expected;
}

/** Heartbeat hash chain: head' = sha256(head || sequenceNo || occurredAt). */
export function chainHead(previousHead: string | null, sequenceNo: number, occurredAtIso: string): string {
  return createHash("sha256")
    .update(`${previousHead ?? ""}|${sequenceNo}|${occurredAtIso}`, "utf8")
    .digest("hex");
}

/** Verify a chain of events reconstructs the claimed head (gap/tamper detection). */
export function verifyChain(events: Array<{ sequenceNo: number; occurredAtIso: string }>, claimedHead: string): boolean {
  let head: string | null = null;
  for (const event of [...events].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    head = chainHead(head, event.sequenceNo, event.occurredAtIso);
  }
  return head === claimedHead;
}

/**
 * Proportionate watcher rules (category checks — never process lists).
 * The shipped set is subject to the DPIA (A4/S15 gate).
 */
export const WATCHER_RULES = [
  { ruleId: "screen_share_active", description: "A screen-sharing/remote-control session is active", reliability: "medium" },
  { ruleId: "virtual_machine_suspected", description: "The OS reports virtualisation markers", reliability: "low" },
  { ruleId: "clipboard_external_paste", description: "Paste from outside the assessment boundary attempted", reliability: "high" },
  { ruleId: "second_display_connected", description: "An additional display is connected", reliability: "high" },
] as const;
