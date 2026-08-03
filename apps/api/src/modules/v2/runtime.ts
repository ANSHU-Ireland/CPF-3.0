import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { hashToken } from "@cpf/identity";
import { z } from "zod";
import {
  candidateView,
  loadHiddenChecks,
  loadPack,
  packContentHash,
  PACK_CODES,
  type PackCode,
} from "@cpf/assessment-packs";
import {
  nextSessionState,
  IllegalTransitionV2Error,
  type SessionStateV2,
  type SessionEventV2,
} from "@cpf/v2-contracts";
import { appendAudit } from "../../db/audit.js";
import { getPool, withOrgTx, type Queryable } from "../../db/pool.js";
import { sendError } from "../auth/guards.js";
import { isKilledByEnv, resolveOrgFlags } from "./flags.js";

/**
 * S08 — V2 assessment runtime and artifact engine.
 *
 * The database is authoritative for time and state; the candidate clock is a
 * projection. Artifacts are immutable versions with one logical final pointer.
 * Finalisation is atomic and idempotent (S14 contract): a unique manifest
 * nonce + the shutdown_receipts UNIQUE(session_id) constraint guarantee one
 * receipt no matter how many concurrent submits race.
 *
 * No AI or plugin availability is required to view saved work or to submit.
 */

const RUNTIME_SIGNING_KEY = process.env.V2_RUNTIME_SIGNING_KEY ?? "dev-only-runtime-signing-key";
const MAX_ARTIFACTS_PER_SESSION = 64;
const MAX_VERSIONS_PER_ARTIFACT = 500;
const MAX_TEXT_ARTIFACT_BYTES = 1_048_576; // 1 MiB inline text ceiling

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** V2 precise state → V1 coarse session_status projection (keeps V1 views coherent). */
const V1_STATUS_PROJECTION: Record<SessionStateV2, string> = {
  invited: "created",
  disclosed: "disclosure_pending",
  preflight: "disclosure_pending",
  ready: "ready",
  active: "in_progress",
  paused_tech: "paused",
  submitting: "in_progress",
  submitted: "submitted",
  reviewing: "under_review",
  finalised: "review_finalised",
  expired: "expired",
  withdrawn: "withdrawn",
  support_review: "paused",
};

interface PortalCtx {
  organisationId: string;
  invitationId: string;
}

async function resolveInvitation(token: string): Promise<PortalCtx | null> {
  const tokenHash = hashToken(token);
  const lookup = await getPool().query<{ organisation_id: string; invitation_id: string }>(
    `SELECT organisation_id, invitation_id FROM invitation_lookup
      WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
  const row = lookup.rows[0];
  return row ? { organisationId: row.organisation_id, invitationId: row.invitation_id } : null;
}

interface ManifestRow {
  id: string;
  session_id: string;
  state_v2: SessionStateV2;
  manifest: {
    packCode: PackCode;
    timeboxMinutes: number;
    nonce: string;
    [k: string]: unknown;
  };
  nonce: string;
  active_since: Date | null;
  scored_seconds_used: number;
  time_credit_seconds: number;
  started_at: Date | null;
}

async function loadManifestForInvitation(client: Queryable, invitationId: string): Promise<ManifestRow | null> {
  const res = await client.query<ManifestRow>(
    `SELECT id, session_id, state_v2, manifest, nonce, active_since, scored_seconds_used, time_credit_seconds, started_at
       FROM session_manifests WHERE invitation_id = $1 FOR UPDATE`,
    [invitationId],
  );
  return res.rows[0] ?? null;
}

async function loadManifestForSession(client: Queryable, sessionId: string): Promise<ManifestRow | null> {
  const res = await client.query<ManifestRow>(
    `SELECT id, session_id, state_v2, manifest, nonce, active_since, scored_seconds_used, time_credit_seconds, started_at
       FROM session_manifests WHERE session_id = $1 FOR UPDATE`,
    [sessionId],
  );
  return res.rows[0] ?? null;
}

/** Server-authoritative remaining scored seconds. */
export function remainingSeconds(row: {
  timeboxMinutes: number;
  scoredSecondsUsed: number;
  timeCreditSeconds: number;
  activeSince: Date | null;
  now?: Date;
}): number {
  const now = row.now ?? new Date();
  const liveSeconds = row.activeSince ? Math.max(0, Math.floor((now.getTime() - row.activeSince.getTime()) / 1000)) : 0;
  return row.timeboxMinutes * 60 + row.timeCreditSeconds - row.scoredSecondsUsed - liveSeconds;
}

async function transition(
  client: Queryable,
  manifest: ManifestRow,
  event: SessionEventV2,
  extra?: { creditSeconds?: number },
): Promise<SessionStateV2> {
  const next = nextSessionState(manifest.state_v2, event);
  const now = new Date();

  let scored = manifest.scored_seconds_used;
  let activeSince: Date | null = manifest.active_since;
  if (event === "start" || event === "resume" || (event === "resolve_support" && next === "active")) {
    activeSince = now;
  }
  if ((event === "pause_tech" || event === "begin_submit" || event === "escalate_support") && manifest.active_since) {
    scored += Math.max(0, Math.floor((now.getTime() - manifest.active_since.getTime()) / 1000));
    activeSince = null;
  }

  await client.query(
    `UPDATE session_manifests
        SET state_v2 = $2,
            active_since = $3,
            scored_seconds_used = $4,
            time_credit_seconds = time_credit_seconds + $5,
            started_at = CASE WHEN $6 THEN coalesce(started_at, now()) ELSE started_at END,
            checked_in_at = CASE WHEN $7 THEN coalesce(checked_in_at, now()) ELSE checked_in_at END,
            paused_at = CASE WHEN $8 THEN now() ELSE paused_at END,
            submitted_at = CASE WHEN $9 THEN coalesce(submitted_at, now()) ELSE submitted_at END
      WHERE id = $1`,
    [
      manifest.id,
      next,
      activeSince,
      scored,
      extra?.creditSeconds ?? 0,
      event === "start",
      event === "check_in",
      event === "pause_tech",
      event === "confirm_receipt",
    ],
  );
  await client.query(`UPDATE assessment_sessions SET status = $2::session_status, updated_at = now() WHERE id = $1`, [
    manifest.session_id,
    V1_STATUS_PROJECTION[next],
  ]);
  manifest.state_v2 = next;
  manifest.active_since = activeSince;
  manifest.scored_seconds_used = scored;
  return next;
}

const ArtifactPutSchema = z
  .object({
    kind: z.enum(["file", "document", "table", "creative", "code_patch", "handover_note"]),
    deliverableSlot: z.string().min(1).max(80).nullable().optional(),
    content: z.string().max(MAX_TEXT_ARTIFACT_BYTES),
    mimeType: z.string().min(3).max(120).default("text/markdown"),
    provenance: z.enum(["candidate", "ai_assisted", "imported_asset"]).default("candidate"),
    /** Optimistic concurrency: expected latest version (0 = create). */
    baseVersionNo: z.number().int().min(0),
  })
  .strict();

const IncidentSchema = z
  .object({
    category: z.enum(["network", "device", "companion", "plugin", "ai_provider", "platform", "other"]),
    description: z.string().min(1).max(4000),
  })
  .strict();

const FinaliseSchema = z
  .object({
    manifestNonce: z.string().regex(/^[0-9a-f]{64}$/),
    declaredLimitations: z.string().max(4000).default(""),
  })
  .strict();

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
  const inv = await resolveInvitation(token);
  if (!inv) {
    await sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);
    return null;
  }
  const matched = await withOrgTx(inv.organisationId, async (client) => {
    const r = await client.query<{ id: string }>(
      "SELECT id FROM assessment_sessions WHERE invitation_id = $1 AND id = $2",
      [inv.invitationId, params.data.sessionId],
    );
    return r.rows[0]?.id ?? null;
  });
  if (!matched) {
    await sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);
    return null;
  }
  return { organisationId: inv.organisationId, sessionId: matched };
}

export function registerAssessmentRuntimeRoutes(app: FastifyInstance): void {
  /** V2 landing: candidate-safe pack view + current runtime state. */
  app.get<{ Params: { token: string } }>("/v2/candidate/:token", async (request, reply) => {
    const inv = await resolveInvitation(request.params.token);
    if (!inv) return sendError(reply, 404, "INVITATION_NOT_FOUND", "This invitation link is invalid or has expired.", request.id);
    return withOrgTx(inv.organisationId, async (client) => {
      const invitation = await client.query<{ experience_version: string; status: string; full_name: string }>(
        `SELECT i.experience_version, i.status, c.full_name
           FROM invitations i JOIN candidates c ON c.id = i.candidate_id WHERE i.id = $1`,
        [inv.invitationId],
      );
      const row = invitation.rows[0]!;
      if (row.experience_version !== "v2") {
        return sendError(reply, 409, "WRONG_EXPERIENCE_VERSION", "This invitation uses the V1 candidate portal.", request.id);
      }
      const flags = await resolveOrgFlags(client, inv.organisationId);
      if (!flags.candidate_v2) {
        return sendError(reply, 409, "EXPERIENCE_DISABLED", "The V2 experience is currently disabled for this organisation.", request.id);
      }
      const manifest = await client.query<{ state_v2: SessionStateV2; session_id: string; manifest: { packCode: PackCode; timeboxMinutes: number } }>(
        "SELECT state_v2, session_id, manifest FROM session_manifests WHERE invitation_id = $1",
        [inv.invitationId],
      );
      const packCode = (manifest.rows[0]?.manifest.packCode ?? defaultPackForInvitation()) as PackCode;
      const pack = loadPack(packCode);
      return {
        candidateName: row.full_name,
        experienceVersion: "v2",
        state: manifest.rows[0]?.state_v2 ?? "invited",
        sessionId: manifest.rows[0]?.session_id ?? null,
        pack: candidateView(pack),
        notices: {
          aiUse: "notice/ai-use@2026-08-03",
          monitoring: "notice/telemetry@2026-08-03",
          dataUse: "notice/data-use@2026-08-03",
          humanReview: "notice/human-review@2026-08-03",
          appeal: "notice/appeal@2026-08-03",
        },
      };
    });
  });

  /** Disclosure acknowledgement → session + signed manifest issue. */
  app.post<{ Params: { token: string }; Body: { packCode?: string } }>(
    "/v2/candidate/:token/disclose",
    async (request, reply) => {
      if (isKilledByEnv("assessment_runtime_v2")) {
        return sendError(reply, 503, "RUNTIME_DISABLED", "The V2 runtime is temporarily disabled.", request.id);
      }
      const inv = await resolveInvitation(request.params.token);
      if (!inv) return sendError(reply, 404, "INVITATION_NOT_FOUND", "This invitation link is invalid or has expired.", request.id);
      const body = z.object({ packCode: z.enum(PACK_CODES).optional() }).strict().safeParse(request.body ?? {});
      if (!body.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid pack code.", request.id);
      }
      return withOrgTx(inv.organisationId, async (client) => {
        const invitation = await client.query<{
          id: string;
          experience_version: string;
          template_version_id: string;
          candidate_id: string;
          status: string;
        }>(
          "SELECT id, experience_version, template_version_id, candidate_id, status FROM invitations WHERE id = $1 FOR UPDATE",
          [inv.invitationId],
        );
        const row = invitation.rows[0]!;
        if (row.experience_version !== "v2") {
          return sendError(reply, 409, "WRONG_EXPERIENCE_VERSION", "This invitation uses the V1 candidate portal.", request.id);
        }
        const flags = await resolveOrgFlags(client, inv.organisationId);
        if (!flags.candidate_v2 || !flags.assessment_runtime_v2) {
          return sendError(reply, 409, "EXPERIENCE_DISABLED", "The V2 runtime is not enabled for this organisation.", request.id);
        }
        const existing = await loadManifestForInvitation(client, inv.invitationId);
        if (existing) {
          // Idempotent re-acknowledge: return the current state, never a duplicate session.
          return reply.status(200).send({ sessionId: existing.session_id, state: existing.state_v2, manifest: existing.manifest });
        }

        const packCode: PackCode = body.data.packCode ?? defaultPackForInvitation();
        const pack = loadPack(packCode);
        const contentHash = packContentHash(pack);

        // Register the pack version (immutable once published; idempotent).
        const packVersion = await client.query<{ id: string }>(
          `INSERT INTO assessment_pack_versions
             (pack_code, pack_version, content_hash, definition, status, rubric_version, prompt_version, policy_version, published_at)
           VALUES ($1, $2, $3, $4::jsonb, 'published', $5, $6, 'policy/v2@1', now())
           ON CONFLICT (pack_code, pack_version) DO UPDATE SET pack_code = EXCLUDED.pack_code
           RETURNING id`,
          [pack.packCode, pack.packVersion, contentHash, JSON.stringify(candidateView(pack)), pack.rubricVersion, pack.copilotPromptRef],
        );

        // V1 session row (coarse status projection) + V2 manifest.
        const session = await client.query<{ id: string }>(
          `INSERT INTO assessment_sessions (organisation_id, invitation_id, template_version_id, status)
           VALUES ($1, $2, $3, 'disclosure_pending') RETURNING id`,
          [inv.organisationId, row.id, row.template_version_id],
        );
        await client.query("UPDATE invitations SET status = 'accepted', accepted_at = coalesce(accepted_at, now()) WHERE id = $1", [row.id]);
        await client.query("UPDATE candidates SET status = 'active', updated_at = now() WHERE id = $1", [row.candidate_id]);

        const sessionId = session.rows[0]!.id;
        const nonce = sha256(randomBytes(32).toString("hex"));
        const manifestBody = {
          contract: "assessment-manifest",
          version: 1,
          manifestId: randomUUID(),
          sessionId,
          organisationId: inv.organisationId,
          invitationId: row.id,
          nonce,
          packCode: pack.packCode,
          packVersion: pack.packVersion,
          packContentHash: contentHash,
          promptVersion: pack.copilotPromptRef,
          modelPin: process.env.AI_ALLOWED_MODEL ? `${process.env.AI_ALLOWED_MODEL}@${process.env.AI_ALLOWED_MODEL_VERSION ?? "pinned"}` : "stub@none",
          rubricVersion: pack.rubricVersion,
          noticeVersions: {
            aiUse: "notice/ai-use@2026-08-03",
            monitoring: "notice/telemetry@2026-08-03",
            dataUse: "notice/data-use@2026-08-03",
            humanReview: "notice/human-review@2026-08-03",
            appeal: "notice/appeal@2026-08-03",
          },
          policyVersion: "policy/v2@1",
          tools: pack.plugins.map((p) => ({
            pluginId: p.pluginId,
            pluginVersion: p.pluginVersion,
            mode: p.mode,
            maxInvocations: p.maxInvocations,
          })),
          companion: {
            required: false, // pilot: browser-mode; companion policy hardens in S15
            minVersion: "0.2.0",
            heartbeatIntervalSeconds: 20,
            heartbeatLossPolicy: "pause_tech",
            internalClipboardOnly: true,
            cameraRequired: false,
          },
          timeboxMinutes: pack.expectedDurationMinutes,
          allowedEndpoints: [],
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
        };
        const signature = createHmac("sha256", RUNTIME_SIGNING_KEY).update(JSON.stringify(manifestBody)).digest("hex");

        await client.query(
          `INSERT INTO session_manifests
             (organisation_id, session_id, invitation_id, pack_version_id, nonce, manifest, signature, state_v2, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'disclosed', $8)`,
          [inv.organisationId, sessionId, row.id, packVersion.rows[0]!.id, nonce, JSON.stringify(manifestBody), signature, manifestBody.expiresAt],
        );
        await appendAudit(client, {
          organisationId: inv.organisationId,
          action: "candidate.v2_disclosure_acknowledged",
          entityType: "session_manifests",
          entityId: sessionId,
          metadata: { packCode: pack.packCode, packVersion: pack.packVersion },
        });
        return reply.status(201).send({ sessionId, state: "disclosed", manifest: { ...manifestBody, signature } });
      });
    },
  );

  /** Lifecycle transitions with server-side time accounting. */
  for (const [path, event] of [
    ["preflight/complete", "complete_preflight"],
    ["check-in", "check_in"],
    ["start", "start"],
  ] as const) {
    app.post<{ Params: { token: string } }>(`/v2/candidate/:token/${path}`, async (request, reply) => {
      const inv = await resolveInvitation(request.params.token);
      if (!inv) return sendError(reply, 404, "INVITATION_NOT_FOUND", "This invitation link is invalid or has expired.", request.id);
      return withOrgTx(inv.organisationId, async (client) => {
        const manifest = await loadManifestForInvitation(client, inv.invitationId);
        if (!manifest) return sendError(reply, 409, "STATE_CONFLICT", "Acknowledge the disclosure first.", request.id);
        try {
          const state = await transition(client, manifest, event);
          await appendAudit(client, {
            organisationId: inv.organisationId,
            action: `candidate.v2_${event}`,
            entityType: "session_manifests",
            entityId: manifest.session_id,
          });
          return {
            state,
            sessionId: manifest.session_id,
            remainingSeconds: remainingSeconds({
              timeboxMinutes: manifest.manifest.timeboxMinutes,
              scoredSecondsUsed: manifest.scored_seconds_used,
              timeCreditSeconds: manifest.time_credit_seconds,
              activeSince: manifest.active_since,
            }),
          };
        } catch (error) {
          if (error instanceof IllegalTransitionV2Error) {
            return sendError(reply, 409, "STATE_CONFLICT", error.message, request.id);
          }
          throw error;
        }
      });
    });
  }

  /** Server-authoritative state/clock projection (poll-safe). */
  app.get<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/state", async (request, reply) => {
    const ctx = await sessionCtx(request, reply);
    if (!ctx) return reply;
    return withOrgTx(ctx.organisationId, async (client) => {
      const manifest = await loadManifestForSession(client, ctx.sessionId);
      if (!manifest) return sendError(reply, 404, "SESSION_NOT_FOUND", "No V2 manifest for session.", request.id);
      const remaining = remainingSeconds({
        timeboxMinutes: manifest.manifest.timeboxMinutes,
        scoredSecondsUsed: manifest.scored_seconds_used,
        timeCreditSeconds: manifest.time_credit_seconds,
        activeSince: manifest.active_since,
      });
      // Time limit reached: the session moves to submitting, never to failed.
      if (manifest.state_v2 === "active" && remaining <= 0) {
        await transition(client, manifest, "begin_submit");
      }
      return {
        state: manifest.state_v2,
        remainingSeconds: Math.max(0, remaining),
        serverTime: new Date().toISOString(),
        timeboxMinutes: manifest.manifest.timeboxMinutes,
        // The candidate token already grants full session access; returning
        // the nonce here restores finalisation after a page reload (S14
        // recovery) without weakening the manifest binding.
        manifestNonce: manifest.nonce,
      };
    });
  });

  /** Technical pause / resume (candidate-invoked; incident-linked). */
  for (const [path, event] of [
    ["pause", "pause_tech"],
    ["resume", "resume"],
  ] as const) {
    app.post<{ Params: { sessionId: string } }>(`/v2/sessions/:sessionId/${path}`, async (request, reply) => {
      const ctx = await sessionCtx(request, reply);
      if (!ctx) return reply;
      return withOrgTx(ctx.organisationId, async (client) => {
        const manifest = await loadManifestForSession(client, ctx.sessionId);
        if (!manifest) return sendError(reply, 404, "SESSION_NOT_FOUND", "No V2 manifest for session.", request.id);
        try {
          const state = await transition(client, manifest, event);
          await appendAudit(client, {
            organisationId: ctx.organisationId,
            action: `candidate.v2_${event}`,
            entityType: "session_manifests",
            entityId: ctx.sessionId,
          });
          return { state };
        } catch (error) {
          if (error instanceof IllegalTransitionV2Error) {
            return sendError(reply, 409, "STATE_CONFLICT", error.message, request.id);
          }
          throw error;
        }
      });
    });
  }

  /** Technical incident (never a score signal; may carry a time credit later). */
  app.post<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/incidents", async (request, reply) => {
    const ctx = await sessionCtx(request, reply);
    if (!ctx) return reply;
    const parsed = IncidentSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "category and description are required.", request.id);
    }
    return withOrgTx(ctx.organisationId, async (client) => {
      const incident = await client.query<{ id: string }>(
        `INSERT INTO technical_incidents (organisation_id, session_id, reported_by, category, description)
         VALUES ($1, $2, 'candidate', $3, $4) RETURNING id`,
        [ctx.organisationId, ctx.sessionId, parsed.data.category, parsed.data.description],
      );
      await appendAudit(client, {
        organisationId: ctx.organisationId,
        action: "candidate.v2_incident_reported",
        entityType: "technical_incidents",
        entityId: incident.rows[0]!.id,
        metadata: { category: parsed.data.category },
      });
      return reply.status(201).send({ incidentId: incident.rows[0]!.id, status: "open" });
    });
  });

  /** Artifact autosave: immutable version, optimistic concurrency, quotas. */
  app.put<{ Params: { sessionId: string; "*": string } }>("/v2/sessions/:sessionId/artifacts/*", async (request, reply) => {
    const ctx = await sessionCtx(request as FastifyRequest<{ Params: { sessionId: string } }>, reply);
    if (!ctx) return reply;
    const path = (request.params as { "*": string })["*"];
    if (!path || path.length > 300 || path.includes("..") || path.startsWith("/")) {
      return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid artifact path.", request.id);
    }
    const parsed = ArtifactPutSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid artifact payload.", request.id);
    }
    return withOrgTx(ctx.organisationId, async (client) => {
      const manifest = await loadManifestForSession(client, ctx.sessionId);
      if (!manifest) return sendError(reply, 404, "SESSION_NOT_FOUND", "No V2 manifest for session.", request.id);
      if (!["active", "paused_tech", "ready"].includes(manifest.state_v2)) {
        return sendError(reply, 409, "STATE_CONFLICT", `Artifacts cannot change in state "${manifest.state_v2}".`, request.id);
      }

      const artifactCount = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM workspace_artifacts WHERE session_id = $1",
        [ctx.sessionId],
      );

      const existing = await client.query<{ id: string; latest_version_no: number }>(
        "SELECT id, latest_version_no FROM workspace_artifacts WHERE session_id = $1 AND path = $2 FOR UPDATE",
        [ctx.sessionId, path],
      );

      if (!existing.rows[0] && (artifactCount.rows[0]?.n ?? 0) >= MAX_ARTIFACTS_PER_SESSION) {
        return sendError(reply, 422, "QUOTA_EXCEEDED", `Artifact limit (${MAX_ARTIFACTS_PER_SESSION}) reached.`, request.id);
      }

      const currentVersion = existing.rows[0]?.latest_version_no ?? 0;
      if (parsed.data.baseVersionNo !== currentVersion) {
        return sendError(
          reply,
          409,
          "REVISION_CONFLICT",
          `Artifact is at version ${currentVersion}; you supplied base ${parsed.data.baseVersionNo}. Reload the latest version.`,
          request.id,
        );
      }
      if (currentVersion >= MAX_VERSIONS_PER_ARTIFACT) {
        return sendError(reply, 422, "QUOTA_EXCEEDED", "Version limit for this artifact reached.", request.id);
      }

      let artifactId = existing.rows[0]?.id;
      if (!artifactId) {
        const created = await client.query<{ id: string }>(
          `INSERT INTO workspace_artifacts (organisation_id, session_id, kind, path, deliverable_slot, latest_version_no)
           VALUES ($1, $2, $3, $4, $5, 0) RETURNING id`,
          [ctx.organisationId, ctx.sessionId, parsed.data.kind, path, parsed.data.deliverableSlot ?? null],
        );
        artifactId = created.rows[0]!.id;
      }
      const nextVersion = currentVersion + 1;
      const contentHash = sha256(parsed.data.content);
      await client.query(
        `INSERT INTO artifact_versions (organisation_id, artifact_id, version_no, content, content_hash, size_bytes, mime_type, provenance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          ctx.organisationId,
          artifactId,
          nextVersion,
          parsed.data.content,
          contentHash,
          Buffer.byteLength(parsed.data.content, "utf8"),
          parsed.data.mimeType,
          parsed.data.provenance,
        ],
      );
      await client.query("UPDATE workspace_artifacts SET latest_version_no = $2 WHERE id = $1", [artifactId, nextVersion]);
      return reply.status(201).send({ artifactId, path, versionNo: nextVersion, contentHash, savedAt: new Date().toISOString() });
    });
  });

  /** List artifacts with version heads (works in every state — read is never blocked). */
  app.get<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/artifacts", async (request, reply) => {
    const ctx = await sessionCtx(request, reply);
    if (!ctx) return reply;
    return withOrgTx(ctx.organisationId, async (client) => {
      const rows = await client.query(
        `SELECT wa.id, wa.path, wa.kind, wa.deliverable_slot, wa.latest_version_no, wa.final_version_no,
                av.content_hash AS latest_hash, av.size_bytes, av.provenance, av.created_at AS latest_saved_at
           FROM workspace_artifacts wa
           LEFT JOIN artifact_versions av ON av.artifact_id = wa.id AND av.version_no = wa.latest_version_no
          WHERE wa.session_id = $1 AND wa.deleted_at IS NULL
          ORDER BY wa.path`,
        [ctx.sessionId],
      );
      return { artifacts: rows.rows };
    });
  });

  /** Read one artifact version (candidate reload / recovery). */
  app.get<{ Params: { sessionId: string; "*": string } }>("/v2/sessions/:sessionId/artifacts/*", async (request, reply) => {
    const ctx = await sessionCtx(request as FastifyRequest<{ Params: { sessionId: string } }>, reply);
    if (!ctx) return reply;
    const path = (request.params as { "*": string })["*"];
    return withOrgTx(ctx.organisationId, async (client) => {
      const row = await client.query(
        `SELECT wa.id, wa.path, wa.kind, wa.latest_version_no, av.content, av.content_hash, av.provenance
           FROM workspace_artifacts wa
           JOIN artifact_versions av ON av.artifact_id = wa.id AND av.version_no = wa.latest_version_no
          WHERE wa.session_id = $1 AND wa.path = $2 AND wa.deleted_at IS NULL`,
        [ctx.sessionId, path],
      );
      if (!row.rows[0]) return sendError(reply, 404, "NOT_FOUND", "Artifact not found.", request.id);
      return row.rows[0];
    });
  });

  /**
   * S14 — atomic, idempotent finalisation. One receipt per session regardless
   * of concurrency; validation failures leave the session active and mutable.
   */
  app.post<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/finalise", async (request, reply) => {
    const ctx = await sessionCtx(request, reply);
    if (!ctx) return reply;
    const parsed = FinaliseSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "manifestNonce is required.", request.id);
    }
    return withOrgTx(ctx.organisationId, async (client) => {
      const manifest = await loadManifestForSession(client, ctx.sessionId);
      if (!manifest) return sendError(reply, 404, "SESSION_NOT_FOUND", "No V2 manifest for session.", request.id);

      // Idempotent replay: receipt already exists → return it (same response).
      const existingReceipt = await client.query(
        "SELECT id, support_code, artifact_head, event_head, signature, submitted_at FROM shutdown_receipts WHERE session_id = $1",
        [ctx.sessionId],
      );
      if (existingReceipt.rows[0]) {
        return reply.status(200).send({ receipt: existingReceipt.rows[0], replay: true });
      }

      if (parsed.data.manifestNonce !== manifest.nonce) {
        return sendError(reply, 403, "MANIFEST_NONCE_MISMATCH", "Finalisation nonce does not match the session manifest.", request.id);
      }
      if (!["active", "submitting", "paused_tech"].includes(manifest.state_v2)) {
        return sendError(reply, 409, "STATE_CONFLICT", `Cannot finalise in state "${manifest.state_v2}".`, request.id);
      }

      // Deliverable validation distinguishes missing deliverables from
      // infrastructure failure — nothing is frozen on a validation error.
      const pack = loadPack(manifest.manifest.packCode);
      const artifacts = await client.query<{ id: string; deliverable_slot: string | null; latest_version_no: number; path: string }>(
        "SELECT id, deliverable_slot, latest_version_no, path FROM workspace_artifacts WHERE session_id = $1 AND deleted_at IS NULL FOR UPDATE",
        [ctx.sessionId],
      );
      const presentSlots = new Set(artifacts.rows.map((a) => a.deliverable_slot).filter(Boolean));
      const missing = pack.deliverables.filter((d) => d.required && !presentSlots.has(d.slot)).map((d) => d.slot);
      if (missing.length > 0) {
        return sendError(reply, 422, "DELIVERABLES_INCOMPLETE", `Missing required deliverables: ${missing.join(", ")}.`, request.id);
      }

      if (manifest.state_v2 !== "submitting") await transition(client, manifest, "begin_submit");

      // Freeze final pointers.
      await client.query(
        "UPDATE workspace_artifacts SET final_version_no = coalesce(final_version_no, latest_version_no) WHERE session_id = $1",
        [ctx.sessionId],
      );

      // Hidden acceptance checks (server-side only; results are reviewer-facing).
      const finalVersions = await client.query<{ deliverable_slot: string | null; content: string | null }>(
        `SELECT wa.deliverable_slot, av.content
           FROM workspace_artifacts wa
           JOIN artifact_versions av ON av.artifact_id = wa.id AND av.version_no = wa.final_version_no
          WHERE wa.session_id = $1`,
        [ctx.sessionId],
      );
      const textBySlot = new Map<string, string>();
      for (const v of finalVersions.rows) {
        if (v.deliverable_slot) textBySlot.set(v.deliverable_slot, (textBySlot.get(v.deliverable_slot) ?? "") + "\n" + (v.content ?? ""));
      }
      const { evaluateHiddenCheck } = await import("@cpf/assessment-packs");
      const hiddenResults = loadHiddenChecks(manifest.manifest.packCode).map((check) => ({
        id: check.id,
        passed: evaluateHiddenCheck(check, textBySlot.get(check.target) ?? ""),
      }));
      await client.query("UPDATE session_manifests SET hidden_check_results = $2::jsonb WHERE id = $1", [
        manifest.id,
        JSON.stringify({ results: hiddenResults, declaredLimitations: parsed.data.declaredLimitations }),
      ]);

      // Heads: artifact head over sorted final hashes; event head from proctor chain.
      const finalHashes = await client.query<{ content_hash: string }>(
        `SELECT av.content_hash
           FROM workspace_artifacts wa
           JOIN artifact_versions av ON av.artifact_id = wa.id AND av.version_no = wa.final_version_no
          WHERE wa.session_id = $1 ORDER BY wa.path`,
        [ctx.sessionId],
      );
      const artifactHead = sha256(finalHashes.rows.map((r) => r.content_hash).join("|"));
      // Event head from the proctor behaviour chain (0026). No error
      // swallowing inside the transaction — a failed query aborts the tx and
      // must surface (root-cause discipline learned from the retention job).
      const eventHeadRow = await client.query<{ event_hash: string }>(
        "SELECT event_hash FROM candidate_behavior_events_v2 WHERE session_id = $1 ORDER BY sequence_no DESC LIMIT 1",
        [ctx.sessionId],
      );
      const eventHead = eventHeadRow.rows[0]?.event_hash ?? null;

      const supportCode = `CPF-${randomBytes(4).toString("hex").toUpperCase()}`;
      const receiptPayload = { sessionId: ctx.sessionId, nonce: manifest.nonce, artifactHead, eventHead, supportCode };
      const signature = createHmac("sha256", RUNTIME_SIGNING_KEY).update(JSON.stringify(receiptPayload)).digest("hex");

      let receipt;
      try {
        receipt = await client.query<{ id: string; submitted_at: Date }>(
          `INSERT INTO shutdown_receipts (organisation_id, session_id, manifest_nonce, artifact_head, event_head, support_code, signature)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, submitted_at`,
          [ctx.organisationId, ctx.sessionId, manifest.nonce, artifactHead, eventHead, supportCode, signature],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          const replay = await client.query(
            "SELECT id, support_code, artifact_head, event_head, signature, submitted_at FROM shutdown_receipts WHERE session_id = $1",
            [ctx.sessionId],
          );
          return reply.status(200).send({ receipt: replay.rows[0], replay: true });
        }
        throw error;
      }

      await transition(client, manifest, "confirm_receipt");
      await appendAudit(client, {
        organisationId: ctx.organisationId,
        action: "candidate.v2_submitted",
        entityType: "shutdown_receipts",
        entityId: receipt.rows[0]!.id,
        metadata: { artifactHead, supportCode },
      });
      return reply.status(201).send({
        receipt: {
          id: receipt.rows[0]!.id,
          support_code: supportCode,
          artifact_head: artifactHead,
          event_head: eventHead,
          signature,
          submitted_at: receipt.rows[0]!.submitted_at,
        },
        replay: false,
      });
    });
  });
}

function defaultPackForInvitation(): PackCode {
  return "SWE-FS-01";
}
