import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { loadPack, type PackCode } from "@cpf/assessment-packs";
import { violatesForbiddenOutput } from "@cpf/v2-contracts";
import { appendAudit } from "../../db/audit.js";
import { withOrgTx, type Queryable } from "../../db/pool.js";
import { requireModuleEntitlement, requireOrgRole, sendError } from "../auth/guards.js";
import { checkReviewerCalibrated } from "../org/calibration.js";

/**
 * S16+S17 — Reviewer V2: pseudonymous SLA-ordered queue, qualification and
 * calibration gating, blind second review, artifact-first evidence bundle,
 * human-only anchored dimension reviews, disagreement adjudication and
 * independent appeals.
 *
 * ADR-002: no aggregate score exists anywhere in these routes.
 * ADR-003: integrity data is served ONLY by the separate integrity endpoint
 * (org_admin as the pilot integrity-role stand-in) and never inside the
 * performance evidence bundle.
 */

const reviewerRole = [requireOrgRole("reviewer", "org_admin"), requireModuleEntitlement("assessments")];
const adminRole = [requireOrgRole("org_admin"), requireModuleEntitlement("assessments")];

const REVIEW_SLA_HOURS = 72;
const ANCHORS = ["not_observed", "developing", "capable", "strong", "exemplary"] as const;

const pseudonym = (sessionId: string) => `P-${createHash("sha256").update(sessionId).digest("hex").slice(0, 6).toUpperCase()}`;

const AssignSchema = z.object({ reviewerUserId: z.string().uuid(), round: z.union([z.literal(1), z.literal(2)]).default(1), reasonCode: z.string().max(120).optional() }).strict();

const DimensionSchema = z
  .object({
    anchor: z.enum(ANCHORS),
    rationale: z.string().min(20).max(8000),
    confidence: z.enum(["low", "medium", "high"]),
    limitations: z.string().max(4000).default(""),
    citedEvidence: z.array(z.string().min(1).max(120)).max(64).default([]),
    counterEvidence: z.array(z.string().min(1).max(120)).max(64).default([]),
    followUpProbe: z.string().max(2000).default(""),
  })
  .strict();

async function loadV2Session(client: Queryable, sessionId: string) {
  const rows = await client.query<{
    session_id: string;
    state_v2: string;
    manifest: { packCode: PackCode; packVersion: number; rubricVersion: string };
    second_review_required: boolean;
    submitted_at: Date | null;
    hidden_check_results: unknown;
  }>(
    `SELECT session_id, state_v2, manifest, second_review_required, submitted_at, hidden_check_results
       FROM session_manifests WHERE session_id = $1 FOR UPDATE`,
    [sessionId],
  );
  return rows.rows[0] ?? null;
}

export function registerReviewV2Routes(app: FastifyInstance): void {
  /** Pseudonymous queue — SLA-ordered, never performance/integrity-ordered. */
  app.get("/v2/orgs/:orgId/reviews/queue", { preHandler: reviewerRole }, async (request) => {
    const orgId = request.orgId!;
    const auth = request.auth!;
    return withOrgTx(orgId, async (client) => {
      const rows = await client.query<{
        session_id: string;
        state_v2: string;
        manifest: { packCode: string; packVersion: number };
        submitted_at: Date | null;
        second_review_required: boolean;
        r1_reviewer: string | null;
        r1_completed: Date | null;
        r2_reviewer: string | null;
        r2_completed: Date | null;
        open_incidents: number;
        open_adjudications: number;
      }>(
        `SELECT m.session_id, m.state_v2, m.manifest, m.submitted_at, m.second_review_required,
                a1.reviewer_user_id::text AS r1_reviewer, a1.completed_at AS r1_completed,
                a2.reviewer_user_id::text AS r2_reviewer, a2.completed_at AS r2_completed,
                (SELECT count(*)::int FROM technical_incidents ti WHERE ti.session_id = m.session_id AND ti.status = 'open') AS open_incidents,
                (SELECT count(*)::int FROM adjudications ad WHERE ad.session_id = m.session_id AND ad.closed_at IS NULL) AS open_adjudications
           FROM session_manifests m
           LEFT JOIN review_assignments_v2 a1 ON a1.session_id = m.session_id AND a1.review_round = 1
           LEFT JOIN review_assignments_v2 a2 ON a2.session_id = m.session_id AND a2.review_round = 2
          WHERE m.state_v2 IN ('submitted', 'reviewing')
          ORDER BY m.submitted_at ASC NULLS LAST
          LIMIT 200`,
      );
      const now = Date.now();
      const items = rows.rows.map((r) => {
        const pack = loadPack(r.manifest.packCode as PackCode);
        const ageHours = r.submitted_at ? (now - new Date(r.submitted_at).getTime()) / 3600_000 : 0;
        return {
          sessionId: r.session_id,
          pseudonym: pseudonym(r.session_id),
          packCode: r.manifest.packCode,
          packVersion: r.manifest.packVersion,
          targetRole: pack.targetRole,
          targetLevel: pack.targetLevel,
          status:
            r.open_adjudications > 0
              ? "adjudication"
              : r.r2_completed || (r.r1_completed && !r.second_review_required)
                ? "finalising"
                : r.r1_completed && r.second_review_required
                  ? "second_review"
                  : r.r1_reviewer
                    ? "in_review"
                    : "awaiting_review",
          submittedAt: r.submitted_at,
          slaHoursRemaining: Math.round((REVIEW_SLA_HOURS - ageHours) * 10) / 10,
          assignedToMe: r.r1_reviewer === auth.userId || r.r2_reviewer === auth.userId,
          secondReviewRequired: r.second_review_required,
          technicalIncidents: r.open_incidents > 0,
        };
      });
      // SLA order: most at-risk first. Never candidate performance.
      items.sort((a, b) => a.slaHoursRemaining - b.slaHoursRemaining);
      return { items, note: "Queue is pseudonymous and SLA-ordered. Candidate identity is not available here." };
    });
  });

  /** Assignment with qualification + calibration + blindness rules. */
  app.post("/v2/orgs/:orgId/reviews/:sessionId/assign", { preHandler: adminRole }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const parsed = AssignSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "reviewerUserId (uuid) and round (1|2) required.", request.id);
    const orgId = request.orgId!;
    const auth = request.auth!;
    const outcome = await withOrgTx(orgId, async (client) => {
      const manifest = await loadV2Session(client, sessionId);
      if (!manifest) return { status: 404 as const, code: "NOT_FOUND", message: "No V2 session." };
      if (!["submitted", "reviewing"].includes(manifest.state_v2)) {
        return { status: 409 as const, code: "STATE_CONFLICT", message: `Cannot assign in state "${manifest.state_v2}".` };
      }
      const membership = await client.query(
        "SELECT 1 FROM org_memberships WHERE organisation_id = $1 AND user_id = $2 AND role = 'reviewer'",
        [orgId, parsed.data.reviewerUserId],
      );
      if (membership.rowCount === 0) return { status: 422 as const, code: "NOT_A_REVIEWER", message: "User does not hold the reviewer role." };

      const fw = await client.query<{ framework_version: string }>(
        `SELECT v.framework_version FROM assessment_sessions s JOIN assessment_template_versions v ON v.id = s.template_version_id WHERE s.id = $1`,
        [sessionId],
      );
      const calibration = await checkReviewerCalibrated(client, orgId, parsed.data.reviewerUserId, fw.rows[0]?.framework_version ?? "");
      if (calibration === "NOT_CALIBRATED") {
        return { status: 422 as const, code: "REVIEWER_NOT_CALIBRATED", message: "Reviewer has no current calibration record." };
      }

      // Blind second review: rounds must have different reviewers.
      const other = await client.query<{ reviewer_user_id: string }>(
        "SELECT reviewer_user_id FROM review_assignments_v2 WHERE session_id = $1 AND review_round <> $2",
        [sessionId, parsed.data.round],
      );
      if (other.rows.some((r) => r.reviewer_user_id === parsed.data.reviewerUserId)) {
        return { status: 422 as const, code: "BLIND_REVIEW_CONFLICT", message: "The same reviewer cannot take both rounds." };
      }
      if (parsed.data.round === 2) {
        const r1 = await client.query("SELECT completed_at FROM review_assignments_v2 WHERE session_id = $1 AND review_round = 1", [sessionId]);
        if (!r1.rows[0]) return { status: 409 as const, code: "STATE_CONFLICT", message: "Round 1 must be assigned first." };
      }

      try {
        await client.query(
          `INSERT INTO review_assignments_v2 (organisation_id, session_id, review_round, reviewer_user_id, assigned_by, reason_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orgId, sessionId, parsed.data.round, parsed.data.reviewerUserId, auth.userId, parsed.data.reasonCode ?? null],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          return { status: 409 as const, code: "ALREADY_ASSIGNED", message: "This round already has a reviewer (deterministic race resolution)." };
        }
        throw error;
      }
      if (manifest.state_v2 === "submitted") {
        await client.query("UPDATE session_manifests SET state_v2 = 'reviewing' WHERE session_id = $1", [sessionId]);
        await client.query("UPDATE assessment_sessions SET status = 'under_review', updated_at = now() WHERE id = $1", [sessionId]);
      }
      await appendAudit(client, {
        organisationId: orgId,
        actorUserId: auth.userId,
        action: "review.v2_assigned",
        entityType: "review_assignments_v2",
        entityId: sessionId,
        metadata: { round: parsed.data.round, reviewerUserId: parsed.data.reviewerUserId, reasonCode: parsed.data.reasonCode ?? null },
      });
      return { status: 201 as const, body: { sessionId, round: parsed.data.round } };
    });
    if ("code" in outcome) return sendError(reply, outcome.status, outcome.code, outcome.message ?? "Request failed.", request.id);
    return reply.status(outcome.status).send(outcome.body);
  });

  /** Artifact-first evidence bundle. Blind: round-2 reviewers never see round-1 anchors until they complete. */
  app.get("/v2/orgs/:orgId/reviews/:sessionId", { preHandler: reviewerRole }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const orgId = request.orgId!;
    const auth = request.auth!;
    return withOrgTx(orgId, async (client) => {
      const manifest = await loadV2Session(client, sessionId);
      if (!manifest) return sendError(reply, 404, "NOT_FOUND", "No V2 session.", request.id);
      const assignments = await client.query<{ review_round: number; reviewer_user_id: string; completed_at: Date | null }>(
        "SELECT review_round, reviewer_user_id, completed_at FROM review_assignments_v2 WHERE session_id = $1",
        [sessionId],
      );
      const mine = assignments.rows.find((a) => a.reviewer_user_id === auth.userId);
      const isAdmin = request.auth!.memberships.some((m) => m.organisationId === orgId && m.role === "org_admin");
      if (!mine && !isAdmin) {
        return sendError(reply, 403, "NOT_ASSIGNED", "You are not assigned to review this session.", request.id);
      }

      const pack = loadPack(manifest.manifest.packCode);
      const artifacts = await client.query(
        `SELECT wa.id, wa.path, wa.kind, wa.deliverable_slot, wa.final_version_no,
                av.content, av.content_hash, av.provenance, av.created_at
           FROM workspace_artifacts wa
           JOIN artifact_versions av ON av.artifact_id = wa.id AND av.version_no = coalesce(wa.final_version_no, wa.latest_version_no)
          WHERE wa.session_id = $1 AND wa.deleted_at IS NULL ORDER BY wa.path`,
        [sessionId],
      );
      const versions = await client.query(
        `SELECT av.artifact_id, av.version_no, av.content_hash, av.provenance, av.created_at, wa.path
           FROM artifact_versions av JOIN workspace_artifacts wa ON wa.id = av.artifact_id
          WHERE wa.session_id = $1 ORDER BY wa.path, av.version_no`,
        [sessionId],
      );
      const aiTranscript = await client.query(
        `SELECT turn_no, role, displayed_text, validation_status, model_pin, prompt_version, created_at
           FROM ai_interactions WHERE session_id = $1 ORDER BY turn_no, CASE role WHEN 'candidate' THEN 0 ELSE 1 END`,
        [sessionId],
      );
      const receipts = await client.query(
        `SELECT invocation_id, plugin_id, plugin_version, operation, status, source_descriptor, result_hash, started_at
           FROM tool_receipts WHERE session_id = $1 ORDER BY started_at`,
        [sessionId],
      );
      const incidents = await client.query(
        `SELECT id, category, description, time_credit_minutes, pause_applied, status, opened_at
           FROM technical_incidents WHERE session_id = $1 ORDER BY opened_at`,
        [sessionId],
      );

      // Blindness: hide other-round dimension reviews from an incomplete round-2 reviewer
      // (and round-1 reviewers never need them). Admins see everything after both rounds.
      const myRound = mine?.review_round ?? null;
      const roundsVisible =
        isAdmin && !mine
          ? [1, 2]
          : myRound === 2 && !mine?.completed_at
            ? [2]
            : [myRound ?? 0];
      const dimensionReviews = await client.query(
        `SELECT review_round, dimension_id, anchor, rationale, confidence, limitations, cited_evidence, counter_evidence, follow_up_probe, reviewed_at
           FROM review_dimensions_v2 WHERE session_id = $1 AND review_round = ANY($2::int[]) ORDER BY review_round, dimension_id`,
        [sessionId, roundsVisible],
      );

      return {
        sessionId,
        pseudonym: pseudonym(sessionId),
        state: manifest.state_v2,
        pack: {
          packCode: pack.packCode,
          packVersion: pack.packVersion,
          title: pack.title,
          targetRole: pack.targetRole,
          targetLevel: pack.targetLevel,
          deliverables: pack.deliverables,
          // Reviewer-facing rubric: anchors WITHOUT weights (no aggregate maths in the UI).
          dimensions: pack.dimensionWeights.map((w) => ({ dimensionId: w.dimensionId, anchors: w.anchors })),
        },
        myRound,
        secondReviewRequired: manifest.second_review_required,
        artifacts: artifacts.rows,
        versionHistory: versions.rows,
        aiTranscript: aiTranscript.rows,
        toolReceipts: receipts.rows,
        technicalIncidents: incidents.rows,
        hiddenCheckResults: manifest.hidden_check_results ?? null,
        dimensionReviews: dimensionReviews.rows,
        note: "Integrity evidence lives behind the separate integrity endpoint and role (ADR-003).",
      };
    });
  });

  /** Human-only anchored dimension review (upsert until round finalised). */
  app.put("/v2/orgs/:orgId/reviews/:sessionId/dimensions/:dimensionId", { preHandler: reviewerRole }, async (request, reply) => {
    const { sessionId, dimensionId } = request.params as { sessionId: string; dimensionId: string };
    const parsed = DimensionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "anchor, rationale (≥20 chars) and confidence are required.", request.id);
    }
    if (violatesForbiddenOutput(parsed.data.rationale)) {
      return sendError(reply, 422, "FORBIDDEN_LANGUAGE", "Rationales describe observed evidence — hiring judgements and universal scores are not accepted.", request.id);
    }
    const orgId = request.orgId!;
    const auth = request.auth!;
    return withOrgTx(orgId, async (client) => {
      const manifest = await loadV2Session(client, sessionId);
      if (!manifest) return sendError(reply, 404, "NOT_FOUND", "No V2 session.", request.id);
      if (manifest.state_v2 !== "reviewing") {
        return sendError(reply, 409, "STATE_CONFLICT", `Reviews are writable only in "reviewing" (state: ${manifest.state_v2}).`, request.id);
      }
      const pack = loadPack(manifest.manifest.packCode);
      if (!pack.dimensionWeights.some((w) => w.dimensionId === dimensionId)) {
        return sendError(reply, 422, "UNKNOWN_DIMENSION", `Dimension "${dimensionId}" is not part of ${pack.packCode}.`, request.id);
      }
      const mine = await client.query<{ review_round: number; completed_at: Date | null }>(
        "SELECT review_round, completed_at FROM review_assignments_v2 WHERE session_id = $1 AND reviewer_user_id = $2",
        [sessionId, auth.userId],
      );
      if (!mine.rows[0]) return sendError(reply, 403, "NOT_ASSIGNED", "You are not assigned to review this session.", request.id);
      if (mine.rows[0].completed_at) return sendError(reply, 409, "ROUND_FINALISED", "Your review round is already finalised.", request.id);

      await client.query(
        `INSERT INTO review_dimensions_v2
           (organisation_id, session_id, review_round, dimension_id, anchor, rationale, confidence, limitations, cited_evidence, counter_evidence, follow_up_probe, reviewed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)
         ON CONFLICT (session_id, review_round, dimension_id)
         DO UPDATE SET anchor = EXCLUDED.anchor, rationale = EXCLUDED.rationale, confidence = EXCLUDED.confidence,
                       limitations = EXCLUDED.limitations, cited_evidence = EXCLUDED.cited_evidence,
                       counter_evidence = EXCLUDED.counter_evidence, follow_up_probe = EXCLUDED.follow_up_probe,
                       reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now()`,
        [
          orgId,
          sessionId,
          mine.rows[0].review_round,
          dimensionId,
          parsed.data.anchor,
          parsed.data.rationale,
          parsed.data.confidence,
          parsed.data.limitations,
          JSON.stringify(parsed.data.citedEvidence),
          JSON.stringify(parsed.data.counterEvidence),
          parsed.data.followUpProbe,
          auth.userId,
        ],
      );
      return reply.status(200).send({ sessionId, round: mine.rows[0].review_round, dimensionId, saved: true });
    });
  });

  /** Round finalisation: all dimensions + rationale required; disagreement → adjudication. */
  app.post("/v2/orgs/:orgId/reviews/:sessionId/finalise", { preHandler: reviewerRole }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const orgId = request.orgId!;
    const auth = request.auth!;
    return withOrgTx(orgId, async (client) => {
      const manifest = await loadV2Session(client, sessionId);
      if (!manifest) return sendError(reply, 404, "NOT_FOUND", "No V2 session.", request.id);
      const mine = await client.query<{ review_round: number; completed_at: Date | null }>(
        "SELECT review_round, completed_at FROM review_assignments_v2 WHERE session_id = $1 AND reviewer_user_id = $2 FOR UPDATE",
        [sessionId, auth.userId],
      );
      if (!mine.rows[0]) return sendError(reply, 403, "NOT_ASSIGNED", "You are not assigned to review this session.", request.id);
      if (mine.rows[0].completed_at) return sendError(reply, 409, "ROUND_FINALISED", "Your review round is already finalised.", request.id);

      const pack = loadPack(manifest.manifest.packCode);
      const myReviews = await client.query<{ dimension_id: string; anchor: string }>(
        "SELECT dimension_id, anchor FROM review_dimensions_v2 WHERE session_id = $1 AND review_round = $2",
        [sessionId, mine.rows[0].review_round],
      );
      const missing = pack.dimensionWeights.map((w) => w.dimensionId).filter((d) => !myReviews.rows.some((r) => r.dimension_id === d));
      if (missing.length > 0) {
        return sendError(reply, 422, "DIMENSIONS_INCOMPLETE", `Every dimension needs a human rationale. Missing: ${missing.join(", ")}.`, request.id);
      }

      await client.query("UPDATE review_assignments_v2 SET completed_at = now() WHERE session_id = $1 AND review_round = $2", [
        sessionId,
        mine.rows[0].review_round,
      ]);

      let outcome: "finalised" | "awaiting_second_review" | "adjudication_opened" = "finalised";
      if (mine.rows[0].review_round === 1 && manifest.second_review_required) {
        outcome = "awaiting_second_review";
      } else if (mine.rows[0].review_round === 2) {
        // Material disagreement: ≥2 anchor steps apart on any dimension.
        const r1 = await client.query<{ dimension_id: string; anchor: string }>(
          "SELECT dimension_id, anchor FROM review_dimensions_v2 WHERE session_id = $1 AND review_round = 1",
          [sessionId],
        );
        const scale = (a: string) => ANCHORS.indexOf(a as (typeof ANCHORS)[number]);
        const disputed = myReviews.rows.filter((r2) => {
          const r1row = r1.rows.find((r) => r.dimension_id === r2.dimension_id);
          return r1row && Math.abs(scale(r1row.anchor) - scale(r2.anchor)) >= 2;
        });
        if (disputed.length > 0) {
          await client.query(
            `INSERT INTO adjudications (organisation_id, session_id, reason, rationale)
             VALUES ($1, $2, 'material_disagreement', $3)`,
            [orgId, sessionId, `Disagreement ≥2 anchor steps on: ${disputed.map((d) => d.dimension_id).join(", ")}`],
          );
          outcome = "adjudication_opened";
        }
      }

      if (outcome === "finalised") {
        await client.query("UPDATE session_manifests SET state_v2 = 'finalised' WHERE session_id = $1", [sessionId]);
        await client.query("UPDATE assessment_sessions SET status = 'review_finalised', updated_at = now() WHERE id = $1", [sessionId]);
      }
      await appendAudit(client, {
        organisationId: orgId,
        actorUserId: auth.userId,
        action: "review.v2_round_finalised",
        entityType: "review_assignments_v2",
        entityId: sessionId,
        metadata: { round: mine.rows[0].review_round, outcome },
      });
      return reply.status(200).send({ sessionId, round: mine.rows[0].review_round, outcome });
    });
  });

  /** Integrity endpoint — separate role path (pilot stand-in: org_admin). Never in the bundle above. */
  app.get("/v2/orgs/:orgId/reviews/:sessionId/integrity", { preHandler: adminRole }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const orgId = request.orgId!;
    return withOrgTx(orgId, async (client) => {
      const exists = await client.query("SELECT 1 FROM session_manifests WHERE session_id = $1", [sessionId]);
      if (exists.rowCount === 0) return sendError(reply, 404, "NOT_FOUND", "No V2 session.", request.id);
      const events = await client.query(
        `SELECT sequence_no, event_type, category, severity, client_occurred_at, server_received_at, payload_redacted
           FROM candidate_behavior_events_v2 WHERE session_id = $1 ORDER BY sequence_no LIMIT 500`,
        [sessionId],
      );
      const annotations = await client.query(
        "SELECT target_kind, target_id, body, created_at FROM candidate_annotations WHERE session_id = $1",
        [sessionId],
      );
      await appendAudit(client, {
        organisationId: orgId,
        actorUserId: request.auth!.userId,
        action: "review.v2_integrity_accessed",
        entityType: "session_manifests",
        entityId: sessionId,
      });
      return {
        events: events.rows,
        candidateAnnotations: annotations.rows,
        note: "Reliability-graded context for authorised eyes. No automated integrity verdict exists; conclusions require a human and never modify performance anchors.",
      };
    });
  });

  /** Adjudication close (admin as adjudicator; audited; unlocks finalisation). */
  app.post("/v2/orgs/:orgId/reviews/:sessionId/adjudications/close", { preHandler: adminRole }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = z.object({ outcome: z.string().min(3).max(200), rationale: z.string().min(20).max(8000) }).strict().safeParse(request.body);
    if (!body.success) return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "outcome and rationale (≥20 chars) required.", request.id);
    const orgId = request.orgId!;
    const auth = request.auth!;
    return withOrgTx(orgId, async (client) => {
      const open = await client.query<{ id: string }>(
        "SELECT id FROM adjudications WHERE session_id = $1 AND closed_at IS NULL FOR UPDATE",
        [sessionId],
      );
      if (!open.rows[0]) return sendError(reply, 404, "NOT_FOUND", "No open adjudication for this session.", request.id);
      await client.query(
        "UPDATE adjudications SET outcome = $2, rationale = $3, adjudicator = $4, closed_at = now() WHERE id = $1",
        [open.rows[0].id, body.data.outcome, body.data.rationale, auth.userId],
      );
      await client.query("UPDATE session_manifests SET state_v2 = 'finalised' WHERE session_id = $1", [sessionId]);
      await client.query("UPDATE assessment_sessions SET status = 'review_finalised', updated_at = now() WHERE id = $1", [sessionId]);
      await appendAudit(client, {
        organisationId: orgId,
        actorUserId: auth.userId,
        action: "review.v2_adjudication_closed",
        entityType: "adjudications",
        entityId: open.rows[0].id,
        metadata: { outcome: body.data.outcome },
      });
      return reply.status(200).send({ sessionId, adjudicationId: open.rows[0].id, closed: true });
    });
  });

  /** Appeals: opened by admin on candidate's behalf or via candidate service desk; independent reviewer enforced. */
  app.post("/v2/orgs/:orgId/reviews/:sessionId/appeals", { preHandler: adminRole }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = z
      .object({ openedBy: z.enum(["candidate", "employer", "platform"]), grounds: z.string().min(10).max(8000), independentReviewerUserId: z.string().uuid() })
      .strict()
      .safeParse(request.body);
    if (!body.success) return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "openedBy, grounds and independentReviewerUserId required.", request.id);
    const orgId = request.orgId!;
    return withOrgTx(orgId, async (client) => {
      const prior = await client.query<{ reviewer_user_id: string }>(
        "SELECT reviewer_user_id FROM review_assignments_v2 WHERE session_id = $1",
        [sessionId],
      );
      if (prior.rows.some((r) => r.reviewer_user_id === body.data.independentReviewerUserId)) {
        return sendError(reply, 422, "APPEAL_REVIEWER_NOT_INDEPENDENT", "The appeal reviewer must not have reviewed this session.", request.id);
      }
      const appeal = await client.query<{ id: string }>(
        `INSERT INTO appeal_cases (organisation_id, session_id, opened_by, grounds, status, independent_reviewer)
         VALUES ($1, $2, $3, $4, 'under_review', $5) RETURNING id`,
        [orgId, sessionId, body.data.openedBy, body.data.grounds, body.data.independentReviewerUserId],
      );
      await appendAudit(client, {
        organisationId: orgId,
        actorUserId: request.auth!.userId,
        action: "review.v2_appeal_opened",
        entityType: "appeal_cases",
        entityId: appeal.rows[0]!.id,
      });
      return reply.status(201).send({ appealId: appeal.rows[0]!.id, status: "under_review" });
    });
  });
}
