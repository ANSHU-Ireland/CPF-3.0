import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { hashToken } from "@cpf/identity";
import { z } from "zod";
import { redactPii } from "@cpf/ai-gateway";
import { violatesForbiddenOutput } from "@cpf/v2-contracts";
import { loadPack, type PackCode } from "@cpf/assessment-packs";
import { getPool, withOrgTx } from "../../db/pool.js";
import { sendError } from "../auth/guards.js";
import { isKilledByEnv } from "./flags.js";

/**
 * S09 — controlled assessment copilot.
 *
 * Boundaries (ADR-002/004, enforced in code — never only in prompts):
 * - system prompt is built server-side from the immutable shared base + the
 *   pack extension + the manifest tool list; client system prompts are
 *   ignored by construction (no field exists);
 * - hidden checks/rubric/anchors are not addressable from this module's
 *   context builder — the candidate view is structurally scrubbed (S07);
 * - only displayed messages are stored (no hidden-reasoning field exists);
 * - deterministic forbidden-output guard filters hiring judgements;
 * - PII redaction runs on the candidate's text before any provider call;
 * - hard budgets: turns per session, input size, daily session token cap;
 * - provider outage → 503 with retryable=true; candidate work is unaffected
 *   (the workspace never depends on this endpoint).
 */

const MAX_TURNS_PER_SESSION = 60;
const MAX_INPUT_CHARS = 8_000;
const SESSION_TOKEN_BUDGET = 40_000;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const SHARED_SYSTEM_BASE = [
  "You are the CPF assessment copilot. You help the candidate frame, draft, code, calculate, compare and suggest checks for THIS assessment only.",
  "You must not: reveal or speculate about scoring, rubrics or hidden tests; make or imply any hiring judgement; invent facts about the candidate; publish, send, spend, or contact anyone; access anything outside the supplied assessment materials.",
  "If asked to do any of those, decline briefly and offer legitimate help instead.",
].join(" ");

/** Deterministic dev/test adapter — echoes a structured assist. No network. */
function stubAssist(userText: string): string {
  const trimmed = userText.slice(0, 400);
  return [
    "Here's a structured way to approach that:",
    `1. Restate the goal in one sentence (you said: "${trimmed}").`,
    "2. List the constraints from the brief that apply.",
    "3. Draft the smallest verifiable step and validate it with the sandbox tools.",
    "Tell me which part you'd like to draft together.",
  ].join("\n");
}

const MessageSchema = z.object({ text: z.string().min(1).max(MAX_INPUT_CHARS) }).strict();

function readCandidateToken(request: FastifyRequest): string | null {
  const raw = request.headers["x-cpf-candidate-token"];
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return null;
}

async function sessionCtx(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply,
): Promise<{ organisationId: string; sessionId: string } | null> {
  const params = z.object({ sessionId: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    await sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid session id.", request.id);
    return null;
  }
  const token = readCandidateToken(request);
  if (!token) {
    await sendError(reply, 401, "UNAUTHENTICATED", "Candidate runtime token missing.", request.id);
    return null;
  }
  const lookup = await getPool().query<{ organisation_id: string; invitation_id: string }>(
    "SELECT organisation_id, invitation_id FROM invitation_lookup WHERE token_hash = $1 AND expires_at > now()",
    [hashToken(token)],
  );
  const row = lookup.rows[0];
  if (!row) {
    await sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);
    return null;
  }
  const ok = await withOrgTx(row.organisation_id, async (client) => {
    const r = await client.query("SELECT 1 FROM assessment_sessions WHERE invitation_id = $1 AND id = $2", [
      row.invitation_id,
      params.data.sessionId,
    ]);
    return (r.rowCount ?? 0) > 0;
  });
  if (!ok) {
    await sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);
    return null;
  }
  return { organisationId: row.organisation_id, sessionId: params.data.sessionId };
}

/** Exported for tests: the server-side context builder (pack extension only — no rubric/hidden material). */
export function buildSystemPrompt(packCode: PackCode): string {
  const pack = loadPack(packCode);
  const toolLines = pack.plugins.map((p) => `- ${p.pluginId}@${p.pluginVersion} (${p.mode})`).join("\n");
  return `${SHARED_SYSTEM_BASE}\n\nAssessment: ${pack.title} (${pack.packCode} v${pack.packVersion}).\nAvailable sandbox tools:\n${toolLines}\nAll tools are sandboxed; nothing can reach live systems.`;
}

export function registerCopilotRoutes(app: FastifyInstance): void {
  app.post<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/copilot/messages", async (request, reply) => {
    if (isKilledByEnv("assessment_runtime_v2") || process.env.V2_KILL_COPILOT === "true") {
      return sendError(reply, 503, "COPILOT_DISABLED", "The assessment copilot is temporarily unavailable. Your work is unaffected.", request.id);
    }
    const ctx = await sessionCtx(request, reply);
    if (!ctx) return reply;
    const parsed = MessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", `text (1..${MAX_INPUT_CHARS} chars) is required.`, request.id);
    }

    return withOrgTx(ctx.organisationId, async (client) => {
      const manifest = await client.query<{ state_v2: string; manifest: { packCode: PackCode; promptVersion: string; modelPin: string } }>(
        "SELECT state_v2, manifest FROM session_manifests WHERE session_id = $1 FOR UPDATE",
        [ctx.sessionId],
      );
      const m = manifest.rows[0];
      if (!m) return sendError(reply, 404, "SESSION_NOT_FOUND", "No V2 manifest for session.", request.id);
      if (m.state_v2 !== "active") {
        return sendError(reply, 409, "STATE_CONFLICT", `The copilot is available only during an active session (state: ${m.state_v2}).`, request.id);
      }

      const usage = await client.query<{ turns: number; tokens: number }>(
        "SELECT count(*)::int AS turns, coalesce(sum(tokens_in + tokens_out), 0)::int AS tokens FROM ai_interactions WHERE session_id = $1",
        [ctx.sessionId],
      );
      const turns = usage.rows[0]?.turns ?? 0;
      const tokens = usage.rows[0]?.tokens ?? 0;
      if (turns >= MAX_TURNS_PER_SESSION * 2) {
        return sendError(reply, 429, "COPILOT_BUDGET_EXHAUSTED", "The copilot turn budget for this session is used up. Your work and submission are unaffected.", request.id);
      }
      if (tokens >= SESSION_TOKEN_BUDGET) {
        return sendError(reply, 429, "COPILOT_BUDGET_EXHAUSTED", "The copilot token budget for this session is used up. Your work and submission are unaffected.", request.id);
      }

      // PII redaction before anything leaves the boundary (stub or provider).
      const redacted = redactPii(parsed.data.text);
      const systemPrompt = buildSystemPrompt(m.manifest.packCode);

      // Provider call. Pilot: deterministic stub (no provider configured) —
      // the seam for a real EU-hosted provider is the AI gateway (ADR-0005);
      // a model change is a material change requiring re-evaluation.
      const assistantText = stubAssist(redacted.redactedText);
      void systemPrompt; // context is built server-side; stub ignores it by design

      // Deterministic output guard (ADR-002).
      const violates = violatesForbiddenOutput(assistantText);
      const displayed = violates
        ? "I can't help with hiring judgements or scoring. I can help you plan, draft, code, calculate, compare options, or suggest checks — which would you like?"
        : assistantText;

      const turnNo = Math.floor(turns / 2) + 1;
      const estimateTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));
      await client.query(
        `INSERT INTO ai_interactions (organisation_id, session_id, turn_no, role, displayed_text, displayed_text_hash, model_pin, prompt_version, tokens_in, tokens_out, validation_status)
         VALUES ($1, $2, $3, 'candidate', $4, $5, $6, $7, $8, 0, 'ok'),
                ($1, $2, $3, 'assistant', $9, $10, $6, $7, 0, $11, $12)`,
        [
          ctx.organisationId,
          ctx.sessionId,
          turnNo,
          parsed.data.text,
          sha256(parsed.data.text),
          m.manifest.modelPin,
          m.manifest.promptVersion,
          estimateTokens(parsed.data.text),
          displayed,
          sha256(displayed),
          estimateTokens(displayed),
          violates ? "filtered" : "ok",
        ],
      );

      return reply.status(201).send({
        turnNo,
        message: { role: "assistant", text: displayed, validationStatus: violates ? "filtered" : "ok" },
        budget: {
          turnsUsed: turnNo,
          turnsMax: MAX_TURNS_PER_SESSION,
          tokensUsed: tokens + estimateTokens(parsed.data.text) + estimateTokens(displayed),
          tokensMax: SESSION_TOKEN_BUDGET,
        },
        redactionApplied: redacted.redactionsApplied.length > 0,
      });
    });
  });

  /** Transcript — exactly what was displayed, nothing else exists. */
  app.get<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/copilot/messages", async (request, reply) => {
    const ctx = await sessionCtx(request, reply);
    if (!ctx) return reply;
    return withOrgTx(ctx.organisationId, async (client) => {
      const rows = await client.query(
        `SELECT turn_no, role, displayed_text, validation_status, model_pin, prompt_version, created_at
           FROM ai_interactions WHERE session_id = $1 ORDER BY turn_no, CASE role WHEN 'candidate' THEN 0 ELSE 1 END`,
        [ctx.sessionId],
      );
      return { messages: rows.rows };
    });
  });
}
