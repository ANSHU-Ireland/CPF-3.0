/**
 * S16+S17 — reviewer V2: pseudonymous SLA queue, qualification/calibration
 * gating, blind second review, human-only anchored reviews, material
 * disagreement → adjudication, independent appeals.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { hashPassword } from "@cpf/identity";
import { buildApp } from "../src/app.js";
import { closePool } from "../src/db/pool.js";

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_ADMIN_URL = process.env.DATABASE_ADMIN_URL;
const run = describe.runIf(Boolean(DATABASE_URL && DATABASE_ADMIN_URL));

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "..", "packages", "db", "migrations");
const SEED_FILE = join(import.meta.dirname, "..", "..", "..", "packages", "db", "seed", "generated", "seed.sql");
const PW = "a-long-test-password-1234";

const DIMENSIONS = [
  "problem_framing",
  "delegation_to_ai",
  "verification_of_ai_output",
  "correction_and_iteration",
  "tool_orchestration",
  "evidence_grounding",
  "communication_handover",
  "risk_and_safety_judgement",
  "execution_quality",
  "time_and_scope_management",
];

run("S16/S17 reviewer V2", () => {
  let app: FastifyInstance;
  let admin: pg.Client;
  let orgId: string;
  let sessionId: string;
  let adminToken: string;
  let rev1Token: string;
  let rev2Token: string;
  let rev1Id: string;
  let rev2Id: string;
  let rev3Id: string;

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  async function makeUser(email: string, role: string): Promise<{ id: string; token: string }> {
    const hash = await hashPassword(PW);
    const user = await admin.query<{ id: string }>(
      `INSERT INTO users (email, display_name, status, password_hash) VALUES ($1, $2, 'active', $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [email, email, hash],
    );
    await admin.query(
      `INSERT INTO org_memberships (organisation_id, user_id, role) VALUES ($1, $2, $3::org_role) ON CONFLICT DO NOTHING`,
      [orgId, user.rows[0]!.id, role],
    );
    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PW } });
    expect(login.statusCode, login.body).toBe(200);
    return { id: user.rows[0]!.id, token: login.json().token as string };
  }

  async function reviewAllDimensions(token: string, anchors: Record<string, string>): Promise<void> {
    for (const dimension of DIMENSIONS) {
      const res = await app.inject({
        method: "PUT",
        url: `/v2/orgs/${orgId}/reviews/${sessionId}/dimensions/${dimension}`,
        headers: auth(token),
        payload: {
          anchor: anchors[dimension] ?? "capable",
          rationale: `Observed evidence for ${dimension}: cited artifact versions and receipts support this anchor.`,
          confidence: "high",
          citedEvidence: ["EV-1"],
        },
      });
      expect(res.statusCode, res.body).toBe(200);
    }
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DATABASE_ADMIN_URL });
    await admin.connect();
    const exists = await admin.query("SELECT to_regclass('public.organisations') AS t");
    if (!exists.rows[0].t) {
      for (const file of readdirSync(MIGRATIONS_DIR).sort()) await admin.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    const seeded = await admin.query("SELECT count(*)::int AS n FROM assessment_template_versions");
    if (seeded.rows[0].n === 0) await admin.query(readFileSync(SEED_FILE, "utf8"));

    app = buildApp({ databaseUrl: DATABASE_URL! });
    await app.ready();

    await admin.query(
      `TRUNCATE invitation_lookup, review_assignments_v2, review_dimensions_v2, adjudications, appeal_cases,
        session_manifests, shutdown_receipts, workspace_artifacts, ai_interactions, tool_receipts,
        assessment_sessions, invitations, candidates, job_profiles, org_feature_flags, org_memberships,
        reviewer_calibration_records CASCADE`,
    );

    const org = await admin.query<{ id: string }>(
      `INSERT INTO organisations (slug, name, type) VALUES ('s1617-' || substr(md5(random()::text),1,8), 'S1617 Org', 'employer') RETURNING id`,
    );
    orgId = org.rows[0]!.id;

    const adminUser = await makeUser("s1617-admin@it.cpf.test", "org_admin");
    adminToken = adminUser.token;
    const pa = await makeUser("s1617-pa@it.cpf.test", "platform_admin");
    const hm = await makeUser("s1617-hm@it.cpf.test", "hiring_manager");
    const rev1 = await makeUser("s1617-r1@it.cpf.test", "reviewer");
    const rev2 = await makeUser("s1617-r2@it.cpf.test", "reviewer");
    const rev3 = await makeUser("s1617-r3@it.cpf.test", "reviewer");
    rev1Token = rev1.token;
    rev2Token = rev2.token;
    rev1Id = rev1.id;
    rev2Id = rev2.id;
    rev3Id = rev3.id;

    for (const flag of ["candidate_v2", "assessment_runtime_v2", "reviewer_v2"]) {
      const put = await app.inject({
        method: "PUT",
        url: `/v1/platform/organisations/${orgId}/feature-flags/${flag}`,
        headers: auth(pa.token),
        payload: { enabled: true },
      });
      expect(put.statusCode, put.body).toBe(200);
    }

    // Calibrate reviewers 1+2 (rev3 stays uncalibrated for the gating test).
    const fw = await admin.query<{ framework_version: string }>("SELECT framework_version FROM assessment_template_versions LIMIT 1");
    for (const userId of [rev1.id, rev2.id]) {
      await admin.query(
        `INSERT INTO reviewer_calibration_records (organisation_id, reviewer_user_id, framework_version, created_by)
         VALUES ($1, $2, $3, $4)`,
        [orgId, userId, fw.rows[0]!.framework_version, adminUser.id],
      );
    }

    // Candidate journey to submission.
    const job = await app.inject({ method: "POST", url: `/v1/orgs/${orgId}/job-profiles`, headers: auth(hm.token), payload: { title: "V2 Review Role", roleFamily: "software-engineering" } });
    const candidate = await app.inject({ method: "POST", url: `/v1/orgs/${orgId}/candidates`, headers: auth(hm.token), payload: { email: "s1617-c@candidate.test", fullName: "C" } });
    const invitation = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/invitations`,
      headers: auth(hm.token),
      payload: { candidateId: candidate.json().id, jobProfileId: job.json().id, templateCode: "SE1" },
    });
    expect(invitation.statusCode, invitation.body).toBe(201);
    const token = invitation.json().candidateAccessToken as string;
    const h = { "x-cpf-candidate-token": token };

    const disclose = await app.inject({ method: "POST", url: `/v2/candidate/${token}/disclose`, payload: {} });
    sessionId = disclose.json().sessionId;
    const nonce = disclose.json().manifest.nonce as string;
    for (const path of ["preflight/complete", "check-in", "start"]) {
      await app.inject({ method: "POST", url: `/v2/candidate/${token}/${path}` });
    }
    for (const [path, slot, kind] of [
      ["plan/plan.md", "plan", "document"],
      ["code/patch.diff", "code_patch", "code_patch"],
      ["handover/notes.md", "handover", "handover_note"],
    ] as const) {
      await app.inject({
        method: "PUT",
        url: `/v2/sessions/${sessionId}/artifacts/${path}`,
        headers: h,
        payload: { kind, deliverableSlot: slot, content: `organisation_id audit 50 BATCH_LIMIT risk`, baseVersionNo: 0 },
      });
    }
    const fin = await app.inject({ method: "POST", url: `/v2/sessions/${sessionId}/finalise`, headers: h, payload: { manifestNonce: nonce } });
    expect(fin.statusCode, fin.body).toBe(201);
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await closePool();
    await admin?.end();
  });

  it("queue is pseudonymous, SLA-ordered, and shows no candidate identity or integrity severity", async () => {
    const res = await app.inject({ method: "GET", url: `/v2/orgs/${orgId}/reviews/queue`, headers: auth(rev1Token) });
    expect(res.statusCode, res.body).toBe(200);
    const item = res.json().items.find((i: { sessionId: string }) => i.sessionId === sessionId);
    expect(item).toBeDefined();
    expect(item.pseudonym).toMatch(/^P-[0-9A-F]{6}$/);
    expect(item.status).toBe("awaiting_review");
    expect(JSON.stringify(res.json())).not.toContain("s1617-c@candidate.test");
    expect(JSON.stringify(res.json())).not.toMatch(/severity|camera/i);
  });

  it("uncalibrated reviewers cannot be assigned; same reviewer cannot take both rounds", async () => {
    const uncalibrated = await app.inject({
      method: "POST",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/assign`,
      headers: auth(adminToken),
      payload: { reviewerUserId: rev3Id, round: 1 },
    });
    expect(uncalibrated.statusCode).toBe(422);
    expect(uncalibrated.json().error.code).toBe("REVIEWER_NOT_CALIBRATED");

    const assign1 = await app.inject({
      method: "POST",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/assign`,
      headers: auth(adminToken),
      payload: { reviewerUserId: rev1Id, round: 1 },
    });
    expect(assign1.statusCode, assign1.body).toBe(201);

    const sameBoth = await app.inject({
      method: "POST",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/assign`,
      headers: auth(adminToken),
      payload: { reviewerUserId: rev1Id, round: 2 },
    });
    expect(sameBoth.statusCode).toBe(422);
    expect(sameBoth.json().error.code).toBe("BLIND_REVIEW_CONFLICT");

    const assign2 = await app.inject({
      method: "POST",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/assign`,
      headers: auth(adminToken),
      payload: { reviewerUserId: rev2Id, round: 2 },
    });
    expect(assign2.statusCode, assign2.body).toBe(201);
  });

  it("evidence bundle is artifact-first, contains no integrity data, and shows anchors without weights", async () => {
    const res = await app.inject({ method: "GET", url: `/v2/orgs/${orgId}/reviews/${sessionId}`, headers: auth(rev1Token) });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.artifacts.length).toBeGreaterThanOrEqual(3);
    expect(body.pack.dimensions).toHaveLength(10);
    expect(JSON.stringify(body.pack)).not.toContain("weight");
    expect(JSON.stringify(body)).not.toMatch(/focus_lost|camera|behavior_events/);
    expect(body.hiddenCheckResults.results.length).toBeGreaterThanOrEqual(3);

    const unassigned = await app.inject({ method: "GET", url: `/v2/orgs/${orgId}/reviews/${sessionId}`, headers: auth(rev2Token) });
    expect(unassigned.statusCode).toBe(200); // rev2 IS assigned (round 2)
  });

  it("hiring-judgement language is rejected in rationales (ADR-002 in code)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/dimensions/problem_framing`,
      headers: auth(rev1Token),
      payload: { anchor: "strong", rationale: "Great work overall — I would hire this candidate immediately.", confidence: "high" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("FORBIDDEN_LANGUAGE");
  });

  it("round 1 completes only with all ten dimensions; outcome awaits blind second review", async () => {
    const premature = await app.inject({ method: "POST", url: `/v2/orgs/${orgId}/reviews/${sessionId}/finalise`, headers: auth(rev1Token) });
    expect(premature.statusCode).toBe(422);
    expect(premature.json().error.code).toBe("DIMENSIONS_INCOMPLETE");

    await reviewAllDimensions(rev1Token, { execution_quality: "strong" });
    const fin1 = await app.inject({ method: "POST", url: `/v2/orgs/${orgId}/reviews/${sessionId}/finalise`, headers: auth(rev1Token) });
    expect(fin1.statusCode, fin1.body).toBe(200);
    expect(fin1.json().outcome).toBe("awaiting_second_review");
  });

  it("round-2 reviewer cannot see round-1 anchors before completing (blindness enforced server-side)", async () => {
    const res = await app.inject({ method: "GET", url: `/v2/orgs/${orgId}/reviews/${sessionId}`, headers: auth(rev2Token) });
    const rounds = new Set(res.json().dimensionReviews.map((r: { review_round: number }) => r.review_round));
    expect(rounds.has(1)).toBe(false);
  });

  it("material disagreement (≥2 anchor steps) opens an adjudication instead of finalising", async () => {
    await reviewAllDimensions(rev2Token, { execution_quality: "not_observed" }); // r1 said strong → 3 steps apart
    const fin2 = await app.inject({ method: "POST", url: `/v2/orgs/${orgId}/reviews/${sessionId}/finalise`, headers: auth(rev2Token) });
    expect(fin2.statusCode, fin2.body).toBe(200);
    expect(fin2.json().outcome).toBe("adjudication_opened");

    const close = await app.inject({
      method: "POST",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/adjudications/close`,
      headers: auth(adminToken),
      payload: { outcome: "capable_upheld_r1_partial", rationale: "Reviewed both rationales and the artifact evidence; execution quality shows working tests, r2 under-credited them." },
    });
    expect(close.statusCode, close.body).toBe(200);

    const manifest = await admin.query<{ state_v2: string }>("SELECT state_v2 FROM session_manifests WHERE session_id = $1", [sessionId]);
    expect(manifest.rows[0]!.state_v2).toBe("finalised");
  });

  it("appeal reviewers must be independent of both review rounds", async () => {
    const notIndependent = await app.inject({
      method: "POST",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/appeals`,
      headers: auth(adminToken),
      payload: { openedBy: "candidate", grounds: "The technical incident during stage 2 was not credited.", independentReviewerUserId: rev1Id },
    });
    expect(notIndependent.statusCode).toBe(422);
    expect(notIndependent.json().error.code).toBe("APPEAL_REVIEWER_NOT_INDEPENDENT");

    const ok = await app.inject({
      method: "POST",
      url: `/v2/orgs/${orgId}/reviews/${sessionId}/appeals`,
      headers: auth(adminToken),
      payload: { openedBy: "candidate", grounds: "The technical incident during stage 2 was not credited.", independentReviewerUserId: rev3Id },
    });
    expect(ok.statusCode, ok.body).toBe(201);
  });

  it("integrity endpoint is separate, role-gated, and access is audited", async () => {
    const asReviewer = await app.inject({ method: "GET", url: `/v2/orgs/${orgId}/reviews/${sessionId}/integrity`, headers: auth(rev1Token) });
    expect(asReviewer.statusCode).toBe(403);

    const asAdmin = await app.inject({ method: "GET", url: `/v2/orgs/${orgId}/reviews/${sessionId}/integrity`, headers: auth(adminToken) });
    expect(asAdmin.statusCode, asAdmin.body).toBe(200);
    expect(JSON.stringify(asAdmin.json())).not.toMatch(/probability/i);

    const audit = await admin.query(
      "SELECT 1 FROM audit_log WHERE organisation_id = $1 AND action = 'review.v2_integrity_accessed'",
      [orgId],
    );
    expect(audit.rowCount).toBeGreaterThanOrEqual(1);
  });
});

describe.runIf(!DATABASE_URL || !DATABASE_ADMIN_URL)("S16/S17", () => {
  it.skip("skipped — DATABASE_URL / DATABASE_ADMIN_URL not set", () => {});
});
