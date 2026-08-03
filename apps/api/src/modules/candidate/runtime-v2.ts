import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hashToken } from "@cpf/identity";
import { z } from "zod";
import { getPool, withOrgTx } from "../../db/pool.js";
import {
  V2_RUNTIME_BATCH_MAX_EVENTS,
  V2_RUNTIME_EVENT_PAYLOAD_MAX_BYTES,
  V2_RUNTIME_QUERY_MAX_EVENTS,
} from "../constants.js";
import { sendError } from "../auth/guards.js";

interface RuntimeContext {
  organisationId: string;
  sessionId: string;
}

interface RuntimeSummaryEvent {
  sequence_no: string;
  event_type: string;
  category: string;
  severity: string;
}

const HeartbeatSchema = z.object({
  deviceSessionId: z.string().min(8).max(120),
  companionVersion: z.string().min(1).max(40),
  helperState: z.enum(["ok", "degraded", "offline"]),
  cameraState: z.enum(["on", "off", "permission_denied", "unavailable"]),
  focusState: z.enum(["focused", "blurred"]),
  internalClipboardState: z.enum(["empty", "contains_data", "blocked"]),
  clientOccurredAt: z.string().datetime(),
  networkRttMs: z.number().int().min(0).max(60_000).optional(),
  hashChainHead: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  meta: z.record(z.string(), z.unknown()).default({}),
});

const RuntimeEventSchema = z.object({
  sequenceNo: z.number().int().positive(),
  eventId: z.string().min(8).max(120),
  eventType: z.string().min(1).max(120),
  category: z.enum(["navigation", "focus", "clipboard", "tool", "ai", "network", "camera", "integrity", "system"]),
  severity: z.enum(["info", "warning", "high", "critical"]),
  source: z.enum(["companion", "web_runtime", "system"]),
  clientOccurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
  payloadRedacted: z.boolean().default(false),
  redactionReason: z.string().min(3).max(200).optional(),
  hash: z.string().regex(/^[a-f0-9]{64}$/i),
  previousHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

const RuntimeEventBatchSchema = z.object({
  deviceSessionId: z.string().min(8).max(120),
  batchId: z.string().min(8).max(120).optional(),
  events: z.array(RuntimeEventSchema).min(1).max(V2_RUNTIME_BATCH_MAX_EVENTS),
});

const LogsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(V2_RUNTIME_QUERY_MAX_EVENTS).default(200),
});

const SessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export function summariseRuntimeEvents(events: RuntimeSummaryEvent[]) {
  const oldest = events.length > 0 ? events[events.length - 1] : undefined;
  const highOrCriticalCount = events.filter((e) => e.severity === "high" || e.severity === "critical").length;
  return {
    totalEvents: events.length,
    focusLossCount: events.filter((e) => e.event_type === "focus_lost").length,
    clipboardBlockedCount: events.filter((e) => e.event_type === "external_clipboard_blocked").length,
    networkDropCount: events.filter((e) => e.event_type === "network_disconnected").length,
    toolFailureCount: events.filter((e) => e.category === "tool" && (e.severity === "high" || e.severity === "critical")).length,
    highOrCriticalCount,
    latestSequenceNo: events[0] ? Number(events[0].sequence_no) : 0,
    oldestSequenceNo: oldest ? Number(oldest.sequence_no) : 0,
  };
}

function readCandidateToken(request: FastifyRequest): string | null {
  const raw = request.headers["x-cpf-candidate-token"];
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return null;
}

async function resolveRuntimeContext(candidateToken: string, sessionId: string): Promise<RuntimeContext | null> {
  const tokenHash = hashToken(candidateToken);
  const lookup = await getPool().query<{
    organisation_id: string;
    invitation_id: string;
  }>(
    `SELECT organisation_id, invitation_id
       FROM invitation_lookup
      WHERE token_hash = $1
        AND expires_at > now()`,
    [tokenHash],
  );
  const row = lookup.rows[0];
  if (!row) return null;

  const matched = await withOrgTx(row.organisation_id, async (client) => {
    const session = await client.query<{ id: string }>(
      "SELECT id FROM assessment_sessions WHERE invitation_id = $1 AND id = $2",
      [row.invitation_id, sessionId],
    );
    return session.rows[0]?.id ?? null;
  });

  if (!matched) return null;
  return { organisationId: row.organisation_id, sessionId: matched };
}

async function withRuntimeContext(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply,
  handler: (ctx: RuntimeContext) => Promise<unknown>,
): Promise<unknown> {
  const params = SessionParamsSchema.safeParse(request.params);
  if (!params.success) {
    return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid session id.", request.id);
  }
  const token = readCandidateToken(request);
  if (!token) {
    return sendError(reply, 401, "UNAUTHENTICATED", "Candidate runtime token missing.", request.id);
  }
  const ctx = await resolveRuntimeContext(token, params.data.sessionId);
  if (!ctx) {
    return sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);
  }
  return handler(ctx);
}

export function registerCandidateRuntimeV2Routes(app: FastifyInstance): void {
  app.post<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/heartbeat", async (request, reply) =>
    withRuntimeContext(request, reply, async (ctx) => {
      const parsed = HeartbeatSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid heartbeat payload.", request.id);
      }
      const hb = parsed.data;
      const clientTime = new Date(hb.clientOccurredAt);
      const skewMs = Date.now() - clientTime.getTime();

      await withOrgTx(ctx.organisationId, async (client) => {
        await client.query(
          `INSERT INTO candidate_session_heartbeats_v2
             (organisation_id, session_id, device_session_id, companion_version, helper_state, camera_state,
              focus_state, internal_clipboard_state, client_occurred_at, clock_skew_ms, network_rtt_ms,
              hash_chain_head, meta)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
          [
            ctx.organisationId,
            ctx.sessionId,
            hb.deviceSessionId,
            hb.companionVersion,
            hb.helperState,
            hb.cameraState,
            hb.focusState,
            hb.internalClipboardState,
            hb.clientOccurredAt,
            skewMs,
            hb.networkRttMs ?? null,
            hb.hashChainHead ?? null,
            JSON.stringify(hb.meta ?? {}),
          ],
        );
      });

      return reply.status(201).send({
        sessionId: ctx.sessionId,
        acceptedAt: new Date().toISOString(),
        computedClockSkewMs: skewMs,
      });
    }),
  );

  app.post<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/events:batch", async (request, reply) =>
    withRuntimeContext(request, reply, async (ctx) => {
      const parsed = RuntimeEventBatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid runtime event batch.", request.id);
      }

      const { deviceSessionId, batchId, events } = parsed.data;
      for (const event of events) {
        const payloadBytes = Buffer.byteLength(JSON.stringify(event.payload), "utf8");
        if (payloadBytes > V2_RUNTIME_EVENT_PAYLOAD_MAX_BYTES) {
          return sendError(
            reply,
            413,
            "EVENT_TOO_LARGE",
            `Event payload exceeds ${V2_RUNTIME_EVENT_PAYLOAD_MAX_BYTES} bytes limit.`,
            request.id,
          );
        }
        if (event.payloadRedacted && !event.redactionReason) {
          return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Redaction reason required when payloadRedacted is true.", request.id);
        }
      }

      const sorted = [...events].sort((a, b) => a.sequenceNo - b.sequenceNo);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i]!.sequenceNo === sorted[i - 1]!.sequenceNo) {
          return sendError(reply, 409, "LOG_SEQUENCE_CONFLICT", "Duplicate sequence numbers within batch.", request.id);
        }
      }

      try {
        const conflict = await withOrgTx(ctx.organisationId, async (client) => {
          const maxRes = await client.query<{ max_seq: string | null }>(
            "SELECT max(sequence_no)::text AS max_seq FROM candidate_behavior_events_v2 WHERE session_id = $1",
            [ctx.sessionId],
          );
          const currentMax = Number(maxRes.rows[0]?.max_seq ?? "0");
          if (!Number.isFinite(currentMax)) {
            throw new Error("Invalid sequence state");
          }
          const minIncoming = sorted[0]!.sequenceNo;
          if (minIncoming <= currentMax) {
            return true;
          }

          for (const event of sorted) {
            const payloadBytes = Buffer.byteLength(JSON.stringify(event.payload), "utf8");
            await client.query(
              `INSERT INTO candidate_behavior_events_v2
                 (organisation_id, session_id, device_session_id, batch_id, sequence_no, event_id, event_type,
                  category, severity, source, client_occurred_at, payload, payload_bytes,
                  payload_redacted, redaction_reason, event_hash, previous_hash)
               VALUES
                 ($1, $2, $3, $4, $5, $6, $7,
                  $8, $9, $10, $11, $12::jsonb, $13,
                  $14, $15, $16, $17)`,
              [
                ctx.organisationId,
                ctx.sessionId,
                deviceSessionId,
                batchId ?? null,
                event.sequenceNo,
                event.eventId,
                event.eventType,
                event.category,
                event.severity,
                event.source,
                event.clientOccurredAt,
                JSON.stringify(event.payload ?? {}),
                payloadBytes,
                event.payloadRedacted,
                event.redactionReason ?? null,
                event.hash,
                event.previousHash ?? null,
              ],
            );
          }
          return false;
        });

        if (conflict) {
          return sendError(reply, 409, "LOG_SEQUENCE_CONFLICT", "Incoming sequence must be strictly greater than stored sequence.", request.id);
        }
      } catch (error) {
        const dbError = error as { code?: string };
        if (dbError?.code === "23505") {
          return sendError(reply, 409, "LOG_SEQUENCE_CONFLICT", "Duplicate sequence or event id detected.", request.id);
        }
        throw error;
      }

      return reply.status(201).send({
        sessionId: ctx.sessionId,
        acceptedCount: events.length,
        minSequenceNo: sorted[0]!.sequenceNo,
        maxSequenceNo: sorted[sorted.length - 1]!.sequenceNo,
      });
    }),
  );

  app.get<{ Params: { sessionId: string }; Querystring: { limit?: string } }>("/v2/sessions/:sessionId/logs", async (request, reply) =>
    withRuntimeContext(request as FastifyRequest<{ Params: { sessionId: string } }>, reply, async (ctx) => {
      const query = LogsQuerySchema.safeParse(request.query ?? {});
      if (!query.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid logs query.", request.id);
      }
      const limit = query.data.limit;

      return withOrgTx(ctx.organisationId, async (client) => {
        const [heartbeatsRes, eventsRes] = await Promise.all([
          client.query<{
            device_session_id: string;
            companion_version: string;
            helper_state: string;
            camera_state: string;
            focus_state: string;
            internal_clipboard_state: string;
            client_occurred_at: string;
            server_received_at: string;
            clock_skew_ms: number;
            network_rtt_ms: number | null;
            hash_chain_head: string | null;
          }>(
            `SELECT device_session_id, companion_version, helper_state, camera_state, focus_state,
                    internal_clipboard_state, client_occurred_at::text, server_received_at::text,
                    clock_skew_ms, network_rtt_ms, hash_chain_head
               FROM candidate_session_heartbeats_v2
              WHERE session_id = $1
              ORDER BY server_received_at DESC
              LIMIT $2`,
            [ctx.sessionId, limit],
          ),
          client.query<{
            sequence_no: string;
            event_id: string;
            event_type: string;
            category: string;
            severity: string;
            source: string;
            client_occurred_at: string;
            server_received_at: string;
            payload: Record<string, unknown>;
            payload_bytes: number;
            payload_redacted: boolean;
            redaction_reason: string | null;
          }>(
            `SELECT sequence_no::text, event_id, event_type, category, severity, source,
                    client_occurred_at::text, server_received_at::text, payload, payload_bytes,
                    payload_redacted, redaction_reason
               FROM candidate_behavior_events_v2
              WHERE session_id = $1
              ORDER BY sequence_no DESC
              LIMIT $2`,
            [ctx.sessionId, limit],
          ),
        ]);

        const events = eventsRes.rows;
        const eventSummary = summariseRuntimeEvents(events);
        const summary = {
          totalHeartbeats: heartbeatsRes.rows.length,
          ...eventSummary,
        };

        return {
          sessionId: ctx.sessionId,
          summary,
          heartbeats: heartbeatsRes.rows,
          events,
        };
      });
    }),
  );
}
