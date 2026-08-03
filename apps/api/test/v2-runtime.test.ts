/**
 * S08+S14 — V2 runtime end-to-end: flags → invitation (v2) → disclose
 * (manifest issue) → preflight → check-in → start → artifacts (optimistic
 * concurrency, quotas) → pause/resume (time accounting) → finalise (atomic,
 * idempotent, concurrent-safe) → immutability after submit.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { hashPassword } from "@cpf/identity";
import { buildApp } from "../src/app.js";
import { closePool, getPool } from "../src/db/pool.js";

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_ADMIN_URL = process.env.DATABASE_ADMIN_URL;
const run = describe.runIf(Boolean(DATABASE_URL && DATABASE_ADMIN_URL));

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "..", "packages", "db", "migrations");
const SEED_FILE = join(import.meta.dirname, "..", "..", "..", "packages", "db", "seed", "generated", "seed.sql");
const PW = "a-long-test-password-1234";

run("S08 V2 assessment runtime", () => {
  let app: FastifyInstance;
  let admin: pg.Client;
  let orgId: string;
  let candidateToken: string;
  let sessionId: string;
  let nonce: string;

  const h = () => ({ "x-cpf-candidate-token": candidateToken });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DATABASE_ADMIN_URL });
    await admin.connect();
    const exists = await admin.query("SELECT to_regclass('public.organisations') AS t");
    if (!exists.rows[0].t) {
      for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
        await admin.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      }
    }
    const seeded = await admin.query("SELECT count(*)::int AS n FROM assessment_template_versions");
    if (seeded.rows[0].n === 0) await admin.query(readFileSync(SEED_FILE, "utf8"));

    app = buildApp({ databaseUrl: DATABASE_URL! });
    await app.ready();

    await admin.query(
      `TRUNCATE invitation_lookup, session_manifests, shutdown_receipts, workspace_artifacts,
        assessment_sessions, invitations, candidates, job_profiles, org_feature_flags,
        org_memberships CASCADE`,
    );

    // Org + HM + platform admin (to flip flags).
    const org = await admin.query<{ id: string }>(
      `INSERT INTO organisations (slug, name, type) VALUES ('s08-org-' || substr(md5(random()::text),1,8), 'S08 Org', 'employer') RETURNING id`,
    );
    orgId = org.rows[0]!.id;
    const hash = await hashPassword(PW);
    const hm = await admin.query<{ id: string }>(
      `INSERT INTO users (email, display_name, status, password_hash) VALUES ('s08-hm@it.cpf.test', 'HM', 'active', $1)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [hash],
    );
    const pa = await admin.query<{ id: string }>(
      `INSERT INTO users (email, display_name, status, password_hash) VALUES ('s08-pa@it.cpf.test', 'PA', 'active', $1)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [hash],
    );
    await admin.query(
      `INSERT INTO org_memberships (organisation_id, user_id, role) VALUES ($1, $2, 'hiring_manager'), ($1, $3, 'platform_admin') ON CONFLICT DO NOTHING`,
      [orgId, hm.rows[0]!.id, pa.rows[0]!.id],
    );

    const paLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "s08-pa@it.cpf.test", password: PW } });
    expect(paLogin.statusCode, paLogin.body).toBe(200);
    const paToken = paLogin.json().token as string;

    // Enrol tenant in V2 (candidate + runtime flags).
    for (const flag of ["candidate_v2", "assessment_runtime_v2"]) {
      const put = await app.inject({
        method: "PUT",
        url: `/v1/platform/organisations/${orgId}/feature-flags/${flag}`,
        headers: { authorization: `Bearer ${paToken}` },
        payload: { enabled: true, note: "S08 pilot" },
      });
      expect(put.statusCode, put.body).toBe(200);
    }

    const hmLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "s08-hm@it.cpf.test", password: PW } });
    const hmToken = hmLogin.json().token as string;
    const job = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/job-profiles`,
      headers: { authorization: `Bearer ${hmToken}` },
      payload: { title: "V2 Engineer", roleFamily: "software-engineering" },
    });
    expect(job.statusCode, job.body).toBe(201);
    const candidate = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/candidates`,
      headers: { authorization: `Bearer ${hmToken}` },
      payload: { email: "s08-cand@candidate.test", fullName: "V2 Candidate" },
    });
    expect(candidate.statusCode, candidate.body).toBe(201);
    const invitation = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/invitations`,
      headers: { authorization: `Bearer ${hmToken}` },
      payload: { candidateId: candidate.json().id, jobProfileId: job.json().id, templateCode: "SE1" },
    });
    expect(invitation.statusCode, invitation.body).toBe(201);
    expect(invitation.json().experienceVersion).toBe("v2"); // S02 stamping worked
    candidateToken = invitation.json().candidateAccessToken;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await closePool();
    await admin?.end();
  });

  it("serves the V2 landing with candidate-safe pack view (no weights/anchors/hidden checks)", async () => {
    const res = await app.inject({ method: "GET", url: `/v2/candidate/${candidateToken}` });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.experienceVersion).toBe("v2");
    expect(body.state).toBe("invited");
    expect(JSON.stringify(body.pack)).not.toContain("dimensionWeights");
    expect(JSON.stringify(body.pack)).not.toContain("expectedAnchors");
    expect(body.pack.dimensions).toHaveLength(10);
  });

  it("disclosure issues a signed manifest exactly once (idempotent re-ack)", async () => {
    const res = await app.inject({ method: "POST", url: `/v2/candidate/${candidateToken}/disclose`, payload: {} });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    sessionId = body.sessionId;
    nonce = body.manifest.nonce;
    expect(body.state).toBe("disclosed");
    expect(body.manifest.packCode).toBe("SWE-FS-01");
    expect(body.manifest.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(body.manifest.companion.cameraRequired).toBe(false);

    const again = await app.inject({ method: "POST", url: `/v2/candidate/${candidateToken}/disclose`, payload: {} });
    expect(again.statusCode).toBe(200);
    expect(again.json().sessionId).toBe(sessionId);
  });

  it("walks preflight → check-in → start; illegal jumps are rejected", async () => {
    // Cannot start before preflight/check-in.
    const early = await app.inject({ method: "POST", url: `/v2/candidate/${candidateToken}/start` });
    expect(early.statusCode).toBe(409);

    for (const [path, state] of [
      ["preflight/complete", "preflight"],
      ["check-in", "ready"],
      ["start", "active"],
    ] as const) {
      const res = await app.inject({ method: "POST", url: `/v2/candidate/${candidateToken}/${path}` });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().state).toBe(state);
    }
    const state = await app.inject({ method: "GET", url: `/v2/sessions/${sessionId}/state`, headers: h() });
    expect(state.json().state).toBe("active");
    expect(state.json().remainingSeconds).toBeGreaterThan(100 * 60);
  });

  it("saves immutable artifact versions with optimistic concurrency and quotas", async () => {
    const put1 = await app.inject({
      method: "PUT",
      url: `/v2/sessions/${sessionId}/artifacts/plan/change-plan.md`,
      headers: h(),
      payload: { kind: "document", deliverableSlot: "plan", content: "# Plan\nTenancy-safe bulk archive.", baseVersionNo: 0 },
    });
    expect(put1.statusCode, put1.body).toBe(201);
    expect(put1.json().versionNo).toBe(1);

    // Stale base → 409 REVISION_CONFLICT (no lost updates).
    const stale = await app.inject({
      method: "PUT",
      url: `/v2/sessions/${sessionId}/artifacts/plan/change-plan.md`,
      headers: h(),
      payload: { kind: "document", deliverableSlot: "plan", content: "overwrite", baseVersionNo: 0 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("REVISION_CONFLICT");

    const put2 = await app.inject({
      method: "PUT",
      url: `/v2/sessions/${sessionId}/artifacts/plan/change-plan.md`,
      headers: h(),
      payload: { kind: "document", deliverableSlot: "plan", content: "# Plan v2\nWith audit + 50-limit.", baseVersionNo: 1 },
    });
    expect(put2.statusCode).toBe(201);
    expect(put2.json().versionNo).toBe(2);

    // Path traversal refused.
    const traversal = await app.inject({
      method: "PUT",
      url: `/v2/sessions/${sessionId}/artifacts/..%2Fescape.md`,
      headers: h(),
      payload: { kind: "document", content: "x", baseVersionNo: 0 },
    });
    expect([400, 404]).toContain(traversal.statusCode);
  });

  it("pause freezes the scored clock; resume restores it", async () => {
    const before = await app.inject({ method: "GET", url: `/v2/sessions/${sessionId}/state`, headers: h() });
    const remainingBefore = before.json().remainingSeconds as number;

    const pause = await app.inject({ method: "POST", url: `/v2/sessions/${sessionId}/pause`, headers: h() });
    expect(pause.json().state).toBe("paused_tech");
    await new Promise((r) => setTimeout(r, 1100));
    const during = await app.inject({ method: "GET", url: `/v2/sessions/${sessionId}/state`, headers: h() });
    // Paused: remaining must not decrease by the waited second.
    expect(during.json().remainingSeconds).toBeGreaterThanOrEqual(remainingBefore - 1);

    const resume = await app.inject({ method: "POST", url: `/v2/sessions/${sessionId}/resume`, headers: h() });
    expect(resume.json().state).toBe("active");
  });

  it("records a technical incident without touching scores", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v2/sessions/${sessionId}/incidents`,
      headers: h(),
      payload: { category: "network", description: "Wi-Fi dropped for ~40s during stage 2." },
    });
    expect(res.statusCode, res.body).toBe(201);
  });

  it("refuses finalisation while required deliverables are missing (nothing frozen)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v2/sessions/${sessionId}/finalise`,
      headers: h(),
      payload: { manifestNonce: nonce },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("DELIVERABLES_INCOMPLETE");
    // Still active and mutable.
    const state = await app.inject({ method: "GET", url: `/v2/sessions/${sessionId}/state`, headers: h() });
    expect(state.json().state).toBe("active");
  });

  it("finalises atomically once all deliverables exist; concurrent submits yield ONE receipt", async () => {
    for (const [path, slot, kind] of [
      ["code/patch.diff", "code_patch", "code_patch"],
      ["handover/notes.md", "handover", "handover_note"],
    ] as const) {
      const res = await app.inject({
        method: "PUT",
        url: `/v2/sessions/${sessionId}/artifacts/${path}`,
        headers: h(),
        payload: {
          kind,
          deliverableSlot: slot,
          content: slot === "code_patch" ? "WHERE organisation_id = $1 -- audit; limit 50 BATCH_LIMIT" : "Risks: partial-failure semantics; known gap: per-item errors.",
          baseVersionNo: 0,
        },
      });
      expect(res.statusCode, res.body).toBe(201);
    }

    // Wrong nonce refused.
    const bad = await app.inject({
      method: "POST",
      url: `/v2/sessions/${sessionId}/finalise`,
      headers: h(),
      payload: { manifestNonce: "a".repeat(64) },
    });
    expect(bad.statusCode).toBe(403);

    // Concurrent double-submit.
    const [r1, r2] = await Promise.all([
      app.inject({ method: "POST", url: `/v2/sessions/${sessionId}/finalise`, headers: h(), payload: { manifestNonce: nonce } }),
      app.inject({ method: "POST", url: `/v2/sessions/${sessionId}/finalise`, headers: h(), payload: { manifestNonce: nonce } }),
    ]);
    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses[0], `${r1.body} || ${r2.body}`).toBeLessThanOrEqual(201);
    const receipts = new Set([r1.json().receipt?.support_code, r2.json().receipt?.support_code].filter(Boolean));
    expect(receipts.size).toBe(1);

    const count = await admin.query<{ n: number }>("SELECT count(*)::int AS n FROM shutdown_receipts WHERE session_id = $1", [sessionId]);
    expect(count.rows[0]!.n).toBe(1);

    // Replay after the fact returns the same receipt.
    const replay = await app.inject({ method: "POST", url: `/v2/sessions/${sessionId}/finalise`, headers: h(), payload: { manifestNonce: nonce } });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().replay).toBe(true);
  });

  it("after submission artifacts are frozen and hidden checks were evaluated server-side", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `/v2/sessions/${sessionId}/artifacts/late/edit.md`,
      headers: h(),
      payload: { kind: "document", content: "too late", baseVersionNo: 0 },
    });
    expect(put.statusCode).toBe(409);

    const manifest = await admin.query<{ hidden_check_results: { results: Array<{ id: string; passed: boolean }> } }>(
      "SELECT hidden_check_results FROM session_manifests WHERE session_id = $1",
      [sessionId],
    );
    const results = manifest.rows[0]!.hidden_check_results.results;
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.find((r) => r.id === "h-fs01-tenancy")?.passed).toBe(true);
    expect(results.find((r) => r.id === "h-fs01-handover-risk")?.passed).toBe(true);

    // Reads still work after submission (support/export path).
    const list = await app.inject({ method: "GET", url: `/v2/sessions/${sessionId}/artifacts`, headers: h() });
    expect(list.statusCode).toBe(200);
    expect(list.json().artifacts.every((a: { final_version_no: number | null }) => a.final_version_no !== null)).toBe(true);
  });

  it("flag-off org candidates cannot enter the V2 runtime (feature-off equivalence)", async () => {
    const org2 = await admin.query<{ id: string }>(
      `INSERT INTO organisations (slug, name, type) VALUES ('s08-org2-' || substr(md5(random()::text),1,8), 'S08 Org2', 'employer') RETURNING id`,
    );
    const candidate = await admin.query<{ id: string }>(
      `INSERT INTO candidates (organisation_id, email, full_name, status) VALUES ($1, 's08b@c.test', 'B', 'invited') RETURNING id`,
      [org2.rows[0]!.id],
    );
    const job = await admin.query<{ id: string }>(
      `INSERT INTO job_profiles (organisation_id, title, role_family, description, status) VALUES ($1, 'R', 'software-engineering', '', 'open') RETURNING id`,
      [org2.rows[0]!.id],
    );
    const version = await admin.query<{ id: string }>("SELECT id FROM assessment_template_versions LIMIT 1");
    const { createHash, randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const inv = await admin.query<{ id: string; expires_at: Date }>(
      `INSERT INTO invitations (organisation_id, candidate_id, job_profile_id, template_version_id, status, token_hash, expires_at, experience_version)
       VALUES ($1, $2, $3, $4, 'sent', $5, now() + interval '7 days', 'v1') RETURNING id, expires_at`,
      [org2.rows[0]!.id, candidate.rows[0]!.id, job.rows[0]!.id, version.rows[0]!.id, tokenHash],
    );
    await admin.query(
      "INSERT INTO invitation_lookup (token_hash, invitation_id, organisation_id, expires_at) VALUES ($1, $2, $3, $4)",
      [tokenHash, inv.rows[0]!.id, org2.rows[0]!.id, inv.rows[0]!.expires_at],
    );
    const res = await app.inject({ method: "GET", url: `/v2/candidate/${token}` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("WRONG_EXPERIENCE_VERSION");
  });
});

describe.runIf(!DATABASE_URL || !DATABASE_ADMIN_URL)("S08 V2 runtime", () => {
  it.skip("skipped — DATABASE_URL / DATABASE_ADMIN_URL not set", () => {});
});
