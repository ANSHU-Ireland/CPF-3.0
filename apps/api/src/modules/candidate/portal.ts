import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createHash } from "node:crypto";
import { hashToken } from "@cpf/identity";
import {
  AssessmentTemplateSchema,
  InvalidTransitionError,
  invitationMachine,
  sessionMachine,
  type SessionEvent,
  type SessionState,
} from "@cpf/assessment-framework";
import { appendAudit } from "../../db/audit.js";
import { getPool, withOrgTx, type Queryable } from "../../db/pool.js";
import { sendError } from "../auth/guards.js";
import { runIdempotent, IdempotencyConflictError } from "../idempotency.js";
import {
  CANDIDATE_SUBMITTABLE_CATEGORIES,
  DSR_DUE_DAYS,
  FORBIDDEN_EVENT_TYPES,
  MAX_EVENT_PAYLOAD_BYTES,
  NOTICE_VERSIONS,
} from "../constants.js";

interface PortalContext {
  organisationId: string;
  invitationId: string;
}

function normaliseCandidateToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const decoded = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();

  const extractFromCandidatePath = (value: string): string | null => {
    const marker = "/candidate/";
    const idx = value.lastIndexOf(marker);
    if (idx === -1) return null;
    const tail = value.slice(idx + marker.length).replace(/^\/+/, "");
    const first = tail.split(/[/?#]/)[0]?.trim();
    return first || null;
  };

  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    try {
      const parsed = new URL(decoded);
      return extractFromCandidatePath(parsed.pathname);
    } catch {
      // Fall through for loosely formatted URL-like strings.
    }
  }

  return extractFromCandidatePath(decoded) ?? decoded.split(/[/?#]/)[0] ?? null;
}

/** Resolve the candidate token through the non-PII routing table. */
async function resolvePortalContext(token: string): Promise<PortalContext | null> {
  const normalized = normaliseCandidateToken(token);
  if (!normalized) return null;

  const result = await getPool().query<{
    invitation_id: string;
    organisation_id: string;
  }>(
    "SELECT invitation_id, organisation_id FROM invitation_lookup WHERE token_hash = $1 AND expires_at > now()",
    [hashToken(normalized)],
  );
  const row = result.rows[0];
  return row
    ? { organisationId: row.organisation_id, invitationId: row.invitation_id }
    : null;
}

async function transitionSession(
  client: Queryable,
  sessionId: string,
  event: SessionEvent,
  extraSet = "",
): Promise<SessionState> {
  const current = await client.query<{ status: SessionState }>(
    "SELECT status FROM assessment_sessions WHERE id = $1 FOR UPDATE",
    [sessionId],
  );
  if (!current.rows[0]) throw new Error("Session not found");
  const next = sessionMachine.next(current.rows[0].status, event); // throws InvalidTransitionError on bad flows
  await client.query(
    `UPDATE assessment_sessions SET status = $1, updated_at = now() ${extraSet} WHERE id = $2`,
    [next, sessionId],
  );
  return next;
}

const EventSchema = z.object({
  category: z.string().min(1).max(50),
  eventType: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const DataRightsSchema = z.object({
  requestType: z.enum([
    "access",
    "rectification",
    "erasure",
    "restriction",
    "objection",
    "portability",
    "challenge",
    "human_review",
  ]),
  detail: z.string().max(5_000).optional(),
});

const AccommodationSchema = z.object({ note: z.string().min(1).max(5_000) });

const CandidateEvidenceSchema = z.object({
  taskId: z.string().min(1).max(200),
  content: z.string().max(200_000),
});

const ArtifactInitiateSchema = z.object({
  stageId: z.string().min(1).max(120),
  deliverableType: z.string().min(1).max(120),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
});

const ArtifactCompleteSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024).optional(),
});

const WorkspaceDraftSchema = z.object({
  expectedRevision: z.number().int().positive(),
  schemaVersion: z.number().int().positive().default(1),
  content: z.record(z.string(), z.string().max(200_000)),
});
const PreflightChecksSchema = z.object({
  problemRead: z.boolean(),
  sourceOpened: z.boolean(),
  aiPracticeSent: z.boolean(),
  pluginRun: z.boolean(),
  draftSaved: z.boolean(),
  browserChecked: z.boolean(),
  supportVisible: z.boolean(),
});
const PreflightUpsertSchema = z.object({
  checks: PreflightChecksSchema,
  practiceMessage: z.string().max(5_000).default(""),
  practiceDraft: z.string().max(5_000).default(""),
  completed: z.boolean().default(false),
});
const TimelineAnnotationSchema = z.object({
  note: z.string().max(2_000).default(""),
  flag: z.enum(["accidental", "tool_failure", "correction", "none"]).default("none"),
});

type PortalRequest = FastifyRequest<{ Params: { token: string } }>;

export function registerCandidatePortalRoutes(app: FastifyInstance): void {
  const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
  const allowedExt = new Set(["patch", "diff", "txt", "md", "json", "csv", "xlsx", "pdf", "png"]);
  const allowedMime = new Set([
    "text/plain",
    "text/markdown",
    "application/json",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
    "image/png",
  ]);

  const fileExt = (name: string): string => {
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || dot === name.length - 1) return "";
    return name.slice(dot + 1).toLowerCase();
  };

  const safeFilename = (name: string): string =>
    name
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

  /** Wrapper: resolve context or 404 (indistinguishable for invalid/expired tokens). */
  async function withPortal(
    request: PortalRequest,
    reply: FastifyReply,
    fn: (ctx: PortalContext) => Promise<unknown>,
  ): Promise<unknown> {
    const ctx = await resolvePortalContext(request.params.token);
    if (!ctx) {
      return sendError(reply, 404, "INVITATION_NOT_FOUND", "This invitation link is invalid or has expired.", request.id);
    }
    try {
      return await fn(ctx);
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        return sendError(reply, 409, "STATE_CONFLICT", error.message, request.id);
      }
      throw error;
    }
  }

  /** Landing view: invitation, template summary, notices, and current state. */
  app.get<{ Params: { token: string } }>("/v1/candidate/:token", async (request, reply) =>
    withPortal(request, reply, (ctx) =>
      withOrgTx(ctx.organisationId, async (client) => {
        const invitation = await client.query<{
          id: string;
          status: string;
          expires_at: Date;
          full_name: string;
          definition: unknown;
          experience_version: string;
        }>(
          `SELECT i.id, i.status, i.expires_at, c.full_name, v.definition, i.experience_version
             FROM invitations i
             JOIN candidates c ON c.id = i.candidate_id
             JOIN assessment_template_versions v ON v.id = i.template_version_id
            WHERE i.id = $1`,
          [ctx.invitationId],
        );
        const row = invitation.rows[0]!;
        if (row.status === "sent") {
          await client.query("UPDATE invitations SET status = $1 WHERE id = $2", [
            invitationMachine.next("sent", "open"),
            row.id,
          ]);
        }
        const template = AssessmentTemplateSchema.parse(row.definition);
        const session = await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM assessment_sessions WHERE invitation_id = $1",
          [row.id],
        );
        return {
          candidateName: row.full_name,
          invitationStatus: row.status === "sent" ? "opened" : row.status,
          expiresAt: row.expires_at,
          // S02: deterministic, immutable routing seam — the web app sends V2
          // invitations to /candidate-v2/:token and V1 stays exactly as-is.
          experienceVersion: row.experience_version,
          assessment: {
            code: template.code,
            title: template.title,
            subtitle: template.subtitle,
            timebox: template.timebox,
            purpose: template.purpose,
            approvedTools: template.approvedTools,
            constraints: template.constraints,
            stages: template.stages,
          },
          notices: NOTICE_VERSIONS,
          session: session.rows[0] ?? null,
        };
      }),
    ),
  );
  app.get<{ Params: { token: string } }>("/v1/candidate/:token/preflight", async (request, reply) =>
    withPortal(request, reply, (ctx) =>
      withOrgTx(ctx.organisationId, async (client) => {
        const record = await client.query<{
          status: "in_progress" | "completed";
          checks: unknown;
          practice_message: string;
          practice_draft: string;
          completed_at: Date | null;
          updated_at: Date;
        }>(
          `SELECT status, checks, practice_message, practice_draft, completed_at, updated_at
             FROM assessment_preflight_records
            WHERE invitation_id = $1`,
          [ctx.invitationId],
        );

        const row = record.rows[0];
        if (!row) {
          return {
            status: "in_progress",
            checks: {
              problemRead: false,
              sourceOpened: false,
              aiPracticeSent: false,
              pluginRun: false,
              draftSaved: false,
              browserChecked: false,
              supportVisible: false,
            },
            practiceMessage: "",
            practiceDraft: "",
            completedAt: null,
            updatedAt: new Date().toISOString(),
          };
        }

        return {
          status: row.status,
          checks: PreflightChecksSchema.parse(row.checks),
          practiceMessage: row.practice_message,
          practiceDraft: row.practice_draft,
          completedAt: row.completed_at,
          updatedAt: row.updated_at,
        };
      }),
    ),
  );

  app.put<{ Params: { token: string } }>("/v1/candidate/:token/preflight", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const parsed = PreflightUpsertSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid preflight payload.", request.id);
      }

      const saved = await withOrgTx(ctx.organisationId, async (client) => {
        const row = await client.query<{
          status: "in_progress" | "completed";
          checks: unknown;
          practice_message: string;
          practice_draft: string;
          completed_at: Date | null;
          updated_at: Date;
        }>(
          `INSERT INTO assessment_preflight_records
             (organisation_id, invitation_id, status, checks, practice_message, practice_draft, completed_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, CASE WHEN $7 THEN now() ELSE null END)
           ON CONFLICT (invitation_id) DO UPDATE
             SET checks = EXCLUDED.checks,
                 practice_message = EXCLUDED.practice_message,
                 practice_draft = EXCLUDED.practice_draft,
                 status = CASE
                   WHEN assessment_preflight_records.status = 'completed' OR EXCLUDED.status = 'completed' THEN 'completed'
                   ELSE 'in_progress'
                 END,
                 completed_at = CASE
                   WHEN assessment_preflight_records.completed_at IS NOT NULL THEN assessment_preflight_records.completed_at
                   WHEN EXCLUDED.status = 'completed' THEN now()
                   ELSE null
                 END,
                 updated_at = now()
           RETURNING status, checks, practice_message, practice_draft, completed_at, updated_at`,
          [
            ctx.organisationId,
            ctx.invitationId,
            parsed.data.completed ? "completed" : "in_progress",
            JSON.stringify(parsed.data.checks),
            parsed.data.practiceMessage,
            parsed.data.practiceDraft,
            parsed.data.completed,
          ],
        );

        await appendAudit(client, {
          organisationId: ctx.organisationId,
          action: "candidate.preflight_saved",
          entityType: "invitation",
          entityId: ctx.invitationId,
          metadata: { completed: parsed.data.completed },
        });

        const result = row.rows[0]!;
        return {
          status: result.status,
          checks: PreflightChecksSchema.parse(result.checks),
          practiceMessage: result.practice_message,
          practiceDraft: result.practice_draft,
          completedAt: result.completed_at,
          updatedAt: result.updated_at,
        };
      });

      return reply.status(200).send(saved);
    }),
  );

  /** Accept the invitation: creates the session, gated behind disclosure. */
  app.post<{ Params: { token: string } }>("/v1/candidate/:token/accept", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const created = await withOrgTx(ctx.organisationId, async (client) => {
        const invitation = await client.query<{
          id: string;
          status: string;
          template_version_id: string;
          candidate_id: string;
        }>(
          "SELECT id, status, template_version_id, candidate_id FROM invitations WHERE id = $1 FOR UPDATE",
          [ctx.invitationId],
        );
        const row = invitation.rows[0]!;
        const accepted = invitationMachine.next(row.status as never, "accept"); // 409 via machine if not allowed
        await client.query(
          "UPDATE invitations SET status = $1, accepted_at = now() WHERE id = $2",
          [accepted, row.id],
        );
        await client.query(
          "UPDATE candidates SET status = 'active', updated_at = now() WHERE id = $1",
          [row.candidate_id],
        );
        // Machine path: created → present_disclosure → disclosure_pending.
        const initial = sessionMachine.next(sessionMachine.initial, "present_disclosure");
        const session = await client.query<{ id: string }>(
          `INSERT INTO assessment_sessions (organisation_id, invitation_id, template_version_id, status)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [ctx.organisationId, row.id, row.template_version_id, initial],
        );
        await appendAudit(client, {
          organisationId: ctx.organisationId,
          action: "candidate.invitation_accepted",
          entityType: "assessment_session",
          entityId: session.rows[0]!.id,
        });
        return { sessionId: session.rows[0]!.id, status: initial };
      });
      // Reply is dispatched only after COMMIT so follow-up portal calls see the session.
      return reply.status(201).send({
        sessionId: created.sessionId,
        status: created.status,
        disclosure: {
          notices: NOTICE_VERSIONS,
          acknowledgeAt: `/v1/candidate/${request.params.token}/disclosure/acknowledge`,
          note: "The assessment cannot start until you acknowledge the disclosure notices.",
        },
      });
    }),
  );

  /** GUARDRAIL BR-01: the only route to a startable session. */
  app.post<{ Params: { token: string } }>(
    "/v1/candidate/:token/disclosure/acknowledge",
    async (request, reply) =>
      withPortal(request, reply, (ctx) =>
        withOrgTx(ctx.organisationId, async (client) => {
          const session = await client.query<{ id: string }>(
            "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
            [ctx.invitationId],
          );
          if (!session.rows[0]) {
            return sendError(reply, 409, "STATE_CONFLICT", "Accept the invitation first.", request.id);
          }
          const sessionId = session.rows[0].id;
          const next = await transitionSession(client, sessionId, "acknowledge_disclosure");
          await client.query(
            `INSERT INTO disclosure_records
               (organisation_id, session_id, privacy_notice_version, ai_use_notice_version,
                telemetry_notice_version, assessment_rules_version, lawful_basis, acknowledged_at, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)`,
            [
              ctx.organisationId,
              sessionId,
              NOTICE_VERSIONS.privacyNotice,
              NOTICE_VERSIONS.aiUseNotice,
              NOTICE_VERSIONS.telemetryNotice,
              NOTICE_VERSIONS.assessmentRules,
              "controller_determined", // recorded per controller configuration; see compliance docs
              request.headers["user-agent"] ?? null,
            ],
          );
          await appendAudit(client, {
            organisationId: ctx.organisationId,
            action: "candidate.disclosure_acknowledged",
            entityType: "assessment_session",
            entityId: sessionId,
            metadata: { notices: NOTICE_VERSIONS },
          });
          return { status: next };
        }),
      ),
  );

  for (const [path, event, extra] of [
    ["start", "start", ", started_at = now()"],
    ["pause", "pause", ""],
    ["resume", "resume", ""],
    ["submit", "submit", ", submitted_at = now()"],
    ["withdraw", "withdraw", ""],
  ] as const) {
    app.post<{ Params: { token: string } }>(`/v1/candidate/:token/${path}`, async (request, reply) =>
      withPortal(request, reply, (ctx) =>
        withOrgTx(ctx.organisationId, async (client) => {
          const session = await client.query<{ id: string }>(
            "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
            [ctx.invitationId],
          );
          if (!session.rows[0]) {
            return sendError(reply, 409, "STATE_CONFLICT", "No session exists for this invitation.", request.id);
          }
          const next = await transitionSession(client, session.rows[0].id, event, extra);
          if (event === "submit") {
            const workspace = await client.query<{
              revision: number;
              content_sha256: string;
            }>(
              "SELECT revision, content_sha256 FROM assessment_workspace_drafts WHERE session_id = $1",
              [session.rows[0].id],
            );

            const artifacts = await client.query<{
              id: string;
              stage_id: string;
              deliverable_type: string;
              sha256: string | null;
              status: string;
              scan_status: string;
              mime_type: string;
              size_bytes: number;
            }>(
              `SELECT id::text, stage_id, deliverable_type, sha256, status, scan_status, mime_type, size_bytes
                 FROM assessment_artifacts
                WHERE session_id = $1 AND status IN ('available', 'frozen')
                ORDER BY created_at ASC`,
              [session.rows[0].id],
            );

            await client.query(
              "UPDATE assessment_workspace_drafts SET finalised_at = coalesce(finalised_at, now()), updated_at = now() WHERE session_id = $1",
              [session.rows[0].id],
            );
            await client.query(
              `UPDATE assessment_artifacts
                  SET status = CASE WHEN status = 'available' THEN 'frozen' ELSE status END,
                      frozen_at = coalesce(frozen_at, now()),
                      updated_at = now()
                WHERE session_id = $1`,
              [session.rows[0].id],
            );

            await client.query(
              `INSERT INTO assessment_submission_manifests
                 (session_id, organisation_id, template_version_id, workspace_revision, workspace_sha256, artifact_manifest, notice_versions, submitted_at)
               SELECT s.id, s.organisation_id, s.template_version_id, $2, $3, $4::jsonb, $5::jsonb, now()
                 FROM assessment_sessions s
                WHERE s.id = $1
               ON CONFLICT (session_id) DO NOTHING`,
              [
                session.rows[0].id,
                workspace.rows[0]?.revision ?? 1,
                workspace.rows[0]?.content_sha256 ?? sha256("{}"),
                JSON.stringify(artifacts.rows),
                JSON.stringify(NOTICE_VERSIONS),
              ],
            );
          }
          await appendAudit(client, {
            organisationId: ctx.organisationId,
            action: `candidate.session_${event}`,
            entityType: "assessment_session",
            entityId: session.rows[0].id,
          });
          return { status: next };
        }),
      ),
    );
  }

  /** Authoritative workspace draft contract with optimistic revision control. */
  app.get<{ Params: { token: string } }>("/v1/candidate/:token/workspace", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const result = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{
          id: string;
          status: string;
          template_version_id: string;
        }>(
          "SELECT id, status, template_version_id FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        const row = session.rows[0];
        if (!row) return { error: "NO_SESSION" as const };

        let draft = await client.query<{
          schema_version: number;
          revision: number;
          content: Record<string, string>;
          updated_at: Date;
          finalised_at: Date | null;
        }>(
          `SELECT schema_version, revision, content, updated_at, finalised_at
             FROM assessment_workspace_drafts
            WHERE session_id = $1`,
          [row.id],
        );

        if (!draft.rows[0]) {
          const emptyContent = {};
          const inserted = await client.query<{
            schema_version: number;
            revision: number;
            content: Record<string, string>;
            updated_at: Date;
            finalised_at: Date | null;
          }>(
            `INSERT INTO assessment_workspace_drafts
               (session_id, organisation_id, template_version_id, schema_version, revision, content, content_sha256, last_updated_by)
             VALUES ($1, $2, $3, 1, 1, $4::jsonb, $5, 'candidate')
             RETURNING schema_version, revision, content, updated_at, finalised_at`,
            [row.id, ctx.organisationId, row.template_version_id, JSON.stringify(emptyContent), sha256(JSON.stringify(emptyContent))],
          );
          draft = inserted;
        }

        return {
          sessionStatus: row.status,
          schemaVersion: draft.rows[0]!.schema_version,
          revision: draft.rows[0]!.revision,
          content: draft.rows[0]!.content ?? {},
          updatedAt: draft.rows[0]!.updated_at,
          finalisedAt: draft.rows[0]!.finalised_at,
        };
      });

      if ("error" in result) {
        return sendError(reply, 409, "STATE_CONFLICT", "Accept and start the assessment before opening a workspace draft.", request.id);
      }
      return result;
    }),
  );

  app.put<{ Params: { token: string } }>("/v1/candidate/:token/workspace", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const parsed = WorkspaceDraftSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "WORKSPACE_SCHEMA_INVALID", "Invalid workspace payload.", request.id);
      }

      const outcome = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{
          id: string;
          status: string;
          template_version_id: string;
        }>(
          "SELECT id, status, template_version_id FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        const sessionRow = session.rows[0];
        if (!sessionRow) return { error: "NO_SESSION" as const };

        if (!new Set(["ready", "in_progress", "paused"]).has(sessionRow.status)) {
          return { error: "SESSION_NOT_ACTIVE" as const };
        }

        let draft = await client.query<{
          revision: number;
          finalised_at: Date | null;
        }>(
          `SELECT revision, finalised_at
             FROM assessment_workspace_drafts
            WHERE session_id = $1
            FOR UPDATE`,
          [sessionRow.id],
        );

        if (!draft.rows[0]) {
          const emptyContent = {};
          await client.query(
            `INSERT INTO assessment_workspace_drafts
               (session_id, organisation_id, template_version_id, schema_version, revision, content, content_sha256, last_updated_by)
             VALUES ($1, $2, $3, 1, 1, $4::jsonb, $5, 'candidate')`,
            [sessionRow.id, ctx.organisationId, sessionRow.template_version_id, JSON.stringify(emptyContent), sha256(JSON.stringify(emptyContent))],
          );
          draft = await client.query<{ revision: number; finalised_at: Date | null }>(
            `SELECT revision, finalised_at
               FROM assessment_workspace_drafts
              WHERE session_id = $1
              FOR UPDATE`,
            [sessionRow.id],
          );
        }

        if (draft.rows[0]!.finalised_at) {
          return { error: "WORKSPACE_FINALISED" as const };
        }

        if (draft.rows[0]!.revision !== parsed.data.expectedRevision) {
          return {
            error: "WORKSPACE_REVISION_CONFLICT" as const,
            currentRevision: draft.rows[0]!.revision,
          };
        }

        const nextRevision = draft.rows[0]!.revision + 1;
        const contentJson = JSON.stringify(parsed.data.content);
        const updated = await client.query<{
          schema_version: number;
          revision: number;
          content: Record<string, string>;
          updated_at: Date;
        }>(
          `UPDATE assessment_workspace_drafts
              SET schema_version = $1,
                  revision = $2,
                  content = $3::jsonb,
                  content_sha256 = $4,
                  updated_at = now(),
                  last_updated_by = 'candidate'
            WHERE session_id = $5
            RETURNING schema_version, revision, content, updated_at`,
          [parsed.data.schemaVersion, nextRevision, contentJson, sha256(contentJson), sessionRow.id],
        );

        await client.query(
          `INSERT INTO evidence_events (organisation_id, session_id, category, event_type, payload)
           VALUES ($1, $2, 'workspace_evidence'::evidence_event_category, 'workspace_draft_saved', $3::jsonb)`,
          [
            ctx.organisationId,
            sessionRow.id,
            JSON.stringify({ revision: updated.rows[0]!.revision, schemaVersion: updated.rows[0]!.schema_version }),
          ],
        );

        return {
          schemaVersion: updated.rows[0]!.schema_version,
          revision: updated.rows[0]!.revision,
          content: updated.rows[0]!.content ?? {},
          updatedAt: updated.rows[0]!.updated_at,
        };
      });

      if ("error" in outcome) {
        if (outcome.error === "NO_SESSION") {
          return sendError(reply, 409, "STATE_CONFLICT", "Accept and start the assessment before saving a workspace draft.", request.id);
        }
        if (outcome.error === "SESSION_NOT_ACTIVE") {
          return sendError(reply, 409, "SESSION_NOT_ACTIVE", "Workspace can only be saved while the session is ready, active, or paused.", request.id);
        }
        if (outcome.error === "WORKSPACE_FINALISED") {
          return sendError(reply, 409, "WORKSPACE_FINALISED", "This workspace is finalised and can no longer be edited.", request.id);
        }
        return reply.status(409).send({
          error: {
            code: "WORKSPACE_REVISION_CONFLICT",
            message: "Workspace revision conflict. Refresh workspace and retry your save.",
            requestId: request.id,
            retryable: true,
            details: [{ path: "expectedRevision", message: `Current revision is ${outcome.currentRevision}.` }],
          },
        });
      }

      return reply.status(200).send(outcome);
    }),
  );

  app.get<{ Params: { token: string } }>("/v1/candidate/:token/source-pack", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      return withOrgTx(ctx.organisationId, async (client) => {
        const template = await client.query<{
          template_version_id: string;
          definition: unknown;
        }>(
          `SELECT i.template_version_id, v.definition
             FROM invitations i
             JOIN assessment_template_versions v ON v.id = i.template_version_id
            WHERE i.id = $1`,
          [ctx.invitationId],
        );
        const row = template.rows[0];
        if (!row) {
          return sendError(reply, 409, "STATE_CONFLICT", "Invitation template context not found.", request.id);
        }

        const items = await client.query<{
          id: string;
          title: string;
          description: string;
          item_type: string;
          mime_type: string;
          size_bytes: number;
          sha256: string;
          availability_state: string;
        }>(
          `SELECT id::text, title, description, item_type, mime_type, size_bytes, sha256, availability_state
             FROM assessment_source_pack_items
            WHERE template_version_id = $1
            ORDER BY display_order ASC, created_at ASC`,
          [row.template_version_id],
        );

        if (items.rowCount && items.rowCount > 0) {
          return {
            items: items.rows.map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              itemType: item.item_type,
              mimeType: item.mime_type,
              sizeBytes: item.size_bytes,
              sha256: item.sha256,
              availabilityState: item.availability_state,
            })),
          };
        }

        const parsed = AssessmentTemplateSchema.parse(row.definition);
        const content = parsed.sourcePack;
        return {
          items: [
            {
              id: "default",
              title: "Source pack overview",
              description: "Template-defined source pack instructions.",
              itemType: "inline_text",
              mimeType: "text/plain",
              sizeBytes: Buffer.byteLength(content, "utf8"),
              sha256: sha256(content),
              availabilityState: "available",
            },
          ],
        };
      });
    }),
  );

  app.get<{ Params: { token: string; itemId: string } }>("/v1/candidate/:token/source-pack/:itemId", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const { itemId } = request.params;
      return withOrgTx(ctx.organisationId, async (client) => {
        const template = await client.query<{
          template_version_id: string;
          definition: unknown;
        }>(
          `SELECT i.template_version_id, v.definition
             FROM invitations i
             JOIN assessment_template_versions v ON v.id = i.template_version_id
            WHERE i.id = $1`,
          [ctx.invitationId],
        );
        const row = template.rows[0];
        if (!row) {
          return sendError(reply, 409, "STATE_CONFLICT", "Invitation template context not found.", request.id);
        }

        if (itemId === "default") {
          const parsed = AssessmentTemplateSchema.parse(row.definition);
          const content = parsed.sourcePack;
          return {
            id: "default",
            title: "Source pack overview",
            itemType: "inline_text",
            mimeType: "text/plain",
            sizeBytes: Buffer.byteLength(content, "utf8"),
            sha256: sha256(content),
            availabilityState: "available",
            content,
          };
        }

        const item = await client.query<{
          id: string;
          title: string;
          description: string;
          item_type: string;
          mime_type: string;
          size_bytes: number;
          sha256: string;
          availability_state: string;
          content: string | null;
        }>(
          `SELECT id::text, title, description, item_type, mime_type, size_bytes, sha256, availability_state, content
             FROM assessment_source_pack_items
            WHERE template_version_id = $1 AND id = $2::uuid`,
          [row.template_version_id, itemId],
        );
        if (!item.rows[0]) {
          return sendError(reply, 404, "NOT_FOUND", "Source-pack item not found.", request.id);
        }
        if (item.rows[0].availability_state !== "available") {
          return sendError(reply, 409, "SOURCE_PACK_NOT_READY", "Source-pack item is not currently available.", request.id);
        }

        return {
          id: item.rows[0].id,
          title: item.rows[0].title,
          description: item.rows[0].description,
          itemType: item.rows[0].item_type,
          mimeType: item.rows[0].mime_type,
          sizeBytes: item.rows[0].size_bytes,
          sha256: item.rows[0].sha256,
          availabilityState: item.rows[0].availability_state,
          content: item.rows[0].item_type === "inline_text" ? item.rows[0].content : undefined,
        };
      });
    }),
  );

  app.post<{ Params: { token: string } }>("/v1/candidate/:token/artifacts/initiate", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const parsed = ArtifactInitiateSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid artifact-initiate payload.", request.id);
      }

      const ext = fileExt(parsed.data.filename);
      if (!allowedExt.has(ext) || !allowedMime.has(parsed.data.mimeType)) {
        return sendError(reply, 422, "ARTIFACT_TYPE_REJECTED", "File type is not allowed for candidate submissions.", request.id);
      }

      const result = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        const row = session.rows[0];
        if (!row) return { error: "NO_SESSION" as const };
        if (!new Set(["ready", "in_progress", "paused"]).has(row.status)) {
          return { error: "SESSION_NOT_ACTIVE" as const };
        }

        const safeName = safeFilename(parsed.data.filename);
        const storageKey = `candidate/${row.id}/${Date.now()}-${sha256(parsed.data.filename).slice(0, 12)}`;

        const inserted = await client.query<{
          id: string;
          status: string;
          scan_status: string;
          created_at: Date;
        }>(
          `INSERT INTO assessment_artifacts
             (organisation_id, session_id, stage_id, deliverable_type, original_filename, safe_display_filename, storage_key, mime_type, size_bytes, status, scan_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'initiated', 'pending')
           RETURNING id::text, status, scan_status, created_at`,
          [
            ctx.organisationId,
            row.id,
            parsed.data.stageId,
            parsed.data.deliverableType,
            parsed.data.filename,
            safeName,
            storageKey,
            parsed.data.mimeType,
            parsed.data.sizeBytes,
          ],
        );

        return {
          artifactId: inserted.rows[0]!.id,
          status: inserted.rows[0]!.status,
          scanStatus: inserted.rows[0]!.scan_status,
          uploadGrant: {
            mode: "server-managed",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            note: "Upload stream integration is pending; use complete endpoint after metadata upload simulation in this environment.",
          },
        };
      });

      if ("error" in result) {
        if (result.error === "NO_SESSION") {
          return sendError(reply, 409, "STATE_CONFLICT", "Accept and start the assessment before uploading artifacts.", request.id);
        }
        return sendError(reply, 409, "SESSION_NOT_ACTIVE", "Artifacts can only be initiated while the session is ready, active, or paused.", request.id);
      }

      return reply.status(201).send(result);
    }),
  );

  app.post<{ Params: { token: string; artifactId: string } }>("/v1/candidate/:token/artifacts/:artifactId/complete", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const parsed = ArtifactCompleteSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid artifact-complete payload.", request.id);
      }

      const { artifactId } = request.params;
      const result = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string }>(
          "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        if (!session.rows[0]) return { error: "NO_SESSION" as const };

        const artifact = await client.query<{
          id: string;
          status: string;
        }>(
          `SELECT id::text, status
             FROM assessment_artifacts
            WHERE id = $1::uuid AND session_id = $2
            FOR UPDATE`,
          [artifactId, session.rows[0].id],
        );
        if (!artifact.rows[0]) return { error: "NOT_FOUND" as const };
        if (artifact.rows[0].status === "frozen") return { error: "WORKSPACE_FINALISED" as const };

        await client.query(
          `UPDATE assessment_artifacts
              SET sha256 = $1,
                  size_bytes = coalesce($2, size_bytes),
                  status = 'available',
                  scan_status = 'clean',
                  updated_at = now()
            WHERE id = $3::uuid`,
          [parsed.data.sha256.toLowerCase(), parsed.data.sizeBytes ?? null, artifactId],
        );

        return { artifactId, status: "available", scanStatus: "clean" };
      });

      if ("error" in result) {
        if (result.error === "NO_SESSION") return sendError(reply, 409, "STATE_CONFLICT", "No active session for this invitation.", request.id);
        if (result.error === "WORKSPACE_FINALISED") {
          return sendError(reply, 409, "WORKSPACE_FINALISED", "Artifact cannot be changed after submission.", request.id);
        }
        return sendError(reply, 404, "NOT_FOUND", "Artifact not found.", request.id);
      }

      return reply.status(200).send(result);
    }),
  );

  app.delete<{ Params: { token: string; artifactId: string } }>("/v1/candidate/:token/artifacts/:artifactId", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const { artifactId } = request.params;
      const result = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string }>(
          "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        if (!session.rows[0]) return { error: "NO_SESSION" as const };

        const artifact = await client.query<{ status: string }>(
          `SELECT status FROM assessment_artifacts WHERE id = $1::uuid AND session_id = $2 FOR UPDATE`,
          [artifactId, session.rows[0].id],
        );
        if (!artifact.rows[0]) return { error: "NOT_FOUND" as const };
        if (artifact.rows[0].status === "frozen") return { error: "WORKSPACE_FINALISED" as const };

        await client.query(
          `UPDATE assessment_artifacts
              SET status = 'removed', removed_at = now(), updated_at = now()
            WHERE id = $1::uuid`,
          [artifactId],
        );
        return { removed: true as const };
      });

      if ("error" in result) {
        if (result.error === "NO_SESSION") return sendError(reply, 409, "STATE_CONFLICT", "No active session for this invitation.", request.id);
        if (result.error === "WORKSPACE_FINALISED") {
          return sendError(reply, 409, "WORKSPACE_FINALISED", "Artifact cannot be removed after submission.", request.id);
        }
        return sendError(reply, 404, "NOT_FOUND", "Artifact not found.", request.id);
      }

      return reply.status(204).send();
    }),
  );

  /** Candidate workspace draft (latest value per task id). */
  app.get<{ Params: { token: string } }>("/v1/candidate/:token/evidence", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const rows = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string }>(
          "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        if (!session.rows[0]) return [] as Array<{ id: string; taskId: string; content: string; lastSavedAt: Date }>;

        const latest = await client.query<{
          event_id: string;
          task_id: string;
          content: string;
          occurred_at: Date;
        }>(
          `SELECT DISTINCT ON (payload->>'taskId')
              id::text AS event_id,
              payload->>'taskId' AS task_id,
              payload->>'content' AS content,
              occurred_at
             FROM evidence_events
            WHERE organisation_id = $1
              AND session_id = $2
              AND category = 'workspace_evidence'
              AND event_type = 'workspace_draft_saved'
              AND payload ? 'taskId'
            ORDER BY payload->>'taskId', id DESC`,
          [ctx.organisationId, session.rows[0].id],
        );

        return latest.rows.map((row) => ({
          id: row.event_id,
          taskId: row.task_id,
          content: row.content ?? "",
          lastSavedAt: row.occurred_at,
        }));
      });

      return rows;
    }),
  );

  /** Save a candidate workspace task response as append-only evidence. */
  app.post<{ Params: { token: string } }>("/v1/candidate/:token/evidence", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const parsed = CandidateEvidenceSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid evidence payload.", request.id);
      }

      const outcome = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        const row = session.rows[0];
        if (!row) return { accepted: false as const, reason: "NO_SESSION" as const };
        if (!new Set(["in_progress", "paused"]).has(row.status)) {
          return { accepted: false as const, reason: "SESSION_NOT_ACTIVE" as const };
        }

        const inserted = await client.query<{ id: string; occurred_at: Date }>(
          `INSERT INTO evidence_events (organisation_id, session_id, category, event_type, payload)
           VALUES ($1, $2, $3::evidence_event_category, $4, $5)
           RETURNING id::text, occurred_at`,
          [
            ctx.organisationId,
            row.id,
            "workspace_evidence",
            "workspace_draft_saved",
            JSON.stringify({ taskId: parsed.data.taskId, content: parsed.data.content }),
          ],
        );

        return {
          accepted: true as const,
          id: inserted.rows[0]!.id,
          lastSavedAt: inserted.rows[0]!.occurred_at,
        };
      });

      if (!outcome.accepted) {
        if (outcome.reason === "NO_SESSION") {
          return sendError(reply, 409, "STATE_CONFLICT", "Accept and start the assessment before saving work.", request.id);
        }
        return sendError(reply, 409, "SESSION_NOT_ACTIVE", "Work can only be saved while a session is active or paused.", request.id);
      }

      return reply.status(201).send({
        id: outcome.id,
        taskId: parsed.data.taskId,
        content: parsed.data.content,
        lastSavedAt: outcome.lastSavedAt,
      });
    }),
  );

  /** Evidence ingestion with category allow-list and forbidden-event rejection (BR-06). */
  app.post<{ Params: { token: string } }>("/v1/candidate/:token/events", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const parsed = EventSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid event payload.", request.id);
      }
      const { category, eventType, payload } = parsed.data;
      if (!CANDIDATE_SUBMITTABLE_CATEGORIES.has(category)) {
        return sendError(reply, 422, "EVENT_CATEGORY_REJECTED", `Category "${category}" cannot be submitted by a candidate client.`, request.id);
      }
      if (FORBIDDEN_EVENT_TYPES.has(eventType)) {
        return sendError(reply, 422, "EVENT_TYPE_FORBIDDEN", `Event type "${eventType}" is never accepted (monitoring policy).`, request.id);
      }
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_EVENT_PAYLOAD_BYTES) {
        return sendError(reply, 413, "EVENT_TOO_LARGE", "Event payload exceeds the size limit.", request.id);
      }
      const outcome = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        const row = session.rows[0];
        if (!row || row.status !== "in_progress") {
          return { accepted: false as const };
        }
        await client.query(
          `INSERT INTO evidence_events (organisation_id, session_id, category, event_type, payload)
           VALUES ($1, $2, $3::evidence_event_category, $4, $5)`,
          [ctx.organisationId, row.id, category, eventType, JSON.stringify(payload)],
        );
        return { accepted: true as const };
      });
      if (!outcome.accepted) {
        // Telemetry outside an active session is rejected by design.
        return sendError(reply, 409, "SESSION_NOT_ACTIVE", "Events are only accepted while the assessment is in progress.", request.id);
      }
      return reply.status(201).send({ accepted: true });
    }),
  );
  /** Candidate-visible timeline of captured assessment events. */
  app.get<{ Params: { token: string } }>("/v1/candidate/:token/evidence-timeline", async (request, reply) =>
    withPortal(request, reply, async (ctx) => {
      const events = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string }>(
          "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        if (!session.rows[0]) return [] as Array<{
          id: string;
          category: string;
          event_type: string;
          payload: unknown;
          occurred_at: Date;
        }>;

        const rows = await client.query<{
          id: string;
          category: string;
          event_type: string;
          payload: unknown;
          occurred_at: Date;
        }>(
          `SELECT id::text, category::text, event_type, payload, occurred_at
             FROM evidence_events
            WHERE organisation_id = $1
              AND session_id = $2
              AND category IN ('workspace_evidence', 'integrity_signal')
            ORDER BY occurred_at DESC, id DESC
            LIMIT 300`,
          [ctx.organisationId, session.rows[0].id],
        );
        return rows.rows;
      });

      return {
        events: events.map((row) => {
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          return {
            id: row.id,
            category: row.category,
            eventType: row.event_type,
            payload,
            occurredAt: row.occurred_at,
            annotation: {
              note: typeof payload.candidateNote === "string" ? payload.candidateNote : "",
              flag: typeof payload.candidateFlag === "string" ? payload.candidateFlag : "none",
              annotatedAt: payload.candidateAnnotatedAt ?? null,
            },
          };
        }),
      };
    }),
  );

  /** Candidate annotation of timeline events (cannot delete evidence; only append note/flag). */
  app.patch<{ Params: { token: string; eventId: string } }>("/v1/candidate/:token/evidence-timeline/:eventId", async (request, reply) =>
    withPortal(request as PortalRequest, reply, async (ctx) => {
      const parsed = TimelineAnnotationSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid timeline annotation payload.", request.id);
      }

      const updated = await withOrgTx(ctx.organisationId, async (client) => {
        const session = await client.query<{ id: string }>(
          "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
          [ctx.invitationId],
        );
        if (!session.rows[0]) return { ok: false as const, reason: "NO_SESSION" as const };

        const event = await client.query<{ id: string }>(
          `SELECT id::text
             FROM evidence_events
            WHERE id = $1::bigint
              AND organisation_id = $2
              AND session_id = $3`,
          [request.params.eventId, ctx.organisationId, session.rows[0].id],
        );
        if (!event.rows[0]) return { ok: false as const, reason: "NOT_FOUND" as const };

        await client.query(
          `UPDATE evidence_events
              SET payload = coalesce(payload, '{}'::jsonb)
                || jsonb_build_object(
                  'candidateNote', $2::text,
                  'candidateFlag', $3::text,
                  'candidateAnnotatedAt', now()
                )
            WHERE id = $1::bigint`,
          [request.params.eventId, parsed.data.note, parsed.data.flag],
        );

        return { ok: true as const };
      });

      if (!updated.ok) {
        if (updated.reason === "NO_SESSION") {
          return sendError(reply, 409, "STATE_CONFLICT", "No session exists for this invitation.", request.id);
        }
        return sendError(reply, 404, "NOT_FOUND", "Timeline event not found.", request.id);
      }

      return reply.status(200).send({ updated: true });
    }),
  );

  /** Accommodation request, recorded before any timing comparison (BR-09). */
  app.post<{ Params: { token: string } }>(
    "/v1/candidate/:token/accommodations",
    async (request, reply) =>
      withPortal(request, reply, async (ctx) => {
        const parsed = AccommodationSchema.safeParse(request.body);
        if (!parsed.success) {
          return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "A note describing the accommodation is required.", request.id);
        }
        return withOrgTx(ctx.organisationId, async (client) => {
          const session = await client.query<{ id: string }>(
            "SELECT id FROM assessment_sessions WHERE invitation_id = $1",
            [ctx.invitationId],
          );
          if (!session.rows[0]) {
            return sendError(reply, 409, "STATE_CONFLICT", "Accept the invitation first.", request.id);
          }
          await client.query(
            "UPDATE assessment_sessions SET accommodations_note = $1, updated_at = now() WHERE id = $2",
            [parsed.data.note, session.rows[0].id],
          );
          await appendAudit(client, {
            organisationId: ctx.organisationId,
            action: "candidate.accommodation_recorded",
            entityType: "assessment_session",
            entityId: session.rows[0].id,
          });
          return { recorded: true };
        });
      }),
  );

  /** Data-rights requests raised directly by the candidate. */
  app.post<{ Params: { token: string } }>(
    "/v1/candidate/:token/data-rights",
    async (request, reply) =>
      withPortal(request, reply, async (ctx) => {
        const parsed = DataRightsSchema.safeParse(request.body);
        if (!parsed.success) {
          return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid data-rights request.", request.id);
        }
        const idempotencyKey = request.headers["idempotency-key"];
        let outcome: { requestId: string; dueAt: Date };
        try {
          outcome = await withOrgTx(ctx.organisationId, async (client) => {
            const doWork = async (): Promise<{ status: number; body: { requestId: string; dueAt: Date } }> => {
              const candidate = await client.query<{ candidate_id: string }>(
                "SELECT candidate_id FROM invitations WHERE id = $1",
                [ctx.invitationId],
              );
              const result = await client.query<{ id: string; due_at: Date }>(
                `INSERT INTO data_rights_requests (organisation_id, candidate_id, request_type, due_at, resolution_note)
                 VALUES ($1, $2, $3, now() + ($4 || ' days')::interval, $5)
                 RETURNING id, due_at`,
                [
                  ctx.organisationId,
                  candidate.rows[0]!.candidate_id,
                  parsed.data.requestType,
                  String(DSR_DUE_DAYS),
                  parsed.data.detail ?? null,
                ],
              );
              await appendAudit(client, {
                organisationId: ctx.organisationId,
                action: "data_rights.request_received",
                entityType: "data_rights_request",
                entityId: result.rows[0]!.id,
                metadata: { requestType: parsed.data.requestType },
              });
              return { status: 201, body: { requestId: result.rows[0]!.id, dueAt: result.rows[0]!.due_at } };
            };

            if (typeof idempotencyKey === "string" && idempotencyKey.length > 0) {
              const idem = await runIdempotent(
                client,
                {
                  scope: "candidate:data-rights-create",
                  actorKey: ctx.invitationId,
                  idempotencyKey,
                  requestBody: parsed.data,
                },
                doWork,
              );
              return idem.body;
            }
            return (await doWork()).body;
          });
        } catch (error) {
          if (error instanceof IdempotencyConflictError) {
            return sendError(reply, 422, "IDEMPOTENCY_KEY_CONFLICT", error.message, request.id);
          }
          throw error;
        }
        return reply.status(201).send({
          requestId: outcome.requestId,
          dueAt: outcome.dueAt,
          status: "received",
        });
      }),
  );
}
