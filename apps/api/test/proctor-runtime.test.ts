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

async function provisionDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: DATABASE_ADMIN_URL });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT to_regclass('public.organisations') AS t");
    if (!exists.rows[0].t) {
      for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
        await admin.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      }
    }
    const seeded = await admin.query("SELECT count(*)::int AS n FROM assessment_template_versions");
    if (seeded.rows[0].n === 0) {
      await admin.query(readFileSync(SEED_FILE, "utf8"));
    }
  } finally {
    await admin.end();
  }
}

async function createActiveUser(email: string): Promise<string> {
  const hash = await hashPassword(PW);
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO users (email, display_name, status, password_hash)
     VALUES ($1, $2, 'active', $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active'
     RETURNING id`,
    [email, `Test ${email}`, hash],
  );
  return result.rows[0]!.id;
}

async function createOrg(slug: string): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO organisations (slug, name, type) VALUES ($1, $2, 'employer'::organisation_type)
     ON CONFLICT (slug) DO UPDATE SET updated_at = now() RETURNING id`,
    [slug, `Org ${slug}`],
  );
  return result.rows[0]!.id;
}

async function addMembership(orgId: string, userId: string, role: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
    await client.query(
      `INSERT INTO org_memberships (organisation_id, user_id, role)
       VALUES ($1, $2, $3::org_role)
       ON CONFLICT (organisation_id, user_id, role) DO NOTHING`,
      [orgId, userId, role],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

run("candidate runtime v2 proctor logging", () => {
  let app: FastifyInstance;
  let admin: pg.Client;
  let candidateToken: string;
  let sessionId: string;

  beforeAll(async () => {
    await provisionDatabase();
    app = buildApp({ databaseUrl: DATABASE_URL! });
    await app.ready();

    admin = new pg.Client({ connectionString: DATABASE_ADMIN_URL });
    await admin.connect();

    await admin.query(
      `TRUNCATE invitation_lookup, assessment_sessions, invitations, candidates, job_profiles,
         evidence_events, disclosure_records, org_memberships,
         candidate_session_heartbeats_v2, candidate_behavior_events_v2 CASCADE`,
    );

    const orgId = await createOrg("proctor-runtime-org");
    const hmId = await createActiveUser("proctor-hm@it.cpf.test");
    await addMembership(orgId, hmId, "hiring_manager");

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "proctor-hm@it.cpf.test", password: PW },
    });
    expect(login.statusCode, login.body).toBe(200);
    const hmToken = login.json().token as string;

    const job = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/job-profiles`,
      headers: { authorization: `Bearer ${hmToken}` },
      payload: { title: "Runtime Test Engineer", roleFamily: "software-engineering" },
    });
    expect(job.statusCode, job.body).toBe(201);

    const candidate = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/candidates`,
      headers: { authorization: `Bearer ${hmToken}` },
      payload: { email: "runtime-candidate@candidate.test", fullName: "Runtime Candidate" },
    });
    expect(candidate.statusCode, candidate.body).toBe(201);

    const invitation = await app.inject({
      method: "POST",
      url: `/v1/orgs/${orgId}/invitations`,
      headers: { authorization: `Bearer ${hmToken}` },
      payload: { candidateId: candidate.json().id, jobProfileId: job.json().id, templateCode: "SE1" },
    });
    expect(invitation.statusCode, invitation.body).toBe(201);
    candidateToken = invitation.json().candidateAccessToken;

    const candidatePortal = await app.inject({ method: "GET", url: `/v1/candidate/${candidateToken}` });
    expect(candidatePortal.statusCode, candidatePortal.body).toBe(200);

    const accept = await app.inject({ method: "POST", url: `/v1/candidate/${candidateToken}/accept` });
    expect(accept.statusCode, accept.body).toBe(201);
    sessionId = accept.json().sessionId;

    const ack = await app.inject({ method: "POST", url: `/v1/candidate/${candidateToken}/disclosure/acknowledge` });
    expect(ack.statusCode, ack.body).toBe(200);

    const start = await app.inject({ method: "POST", url: `/v1/candidate/${candidateToken}/start` });
    expect(start.statusCode, start.body).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await closePool();
    await admin?.end();
  });

  it("accepts heartbeat logs with precise timing metadata", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v2/sessions/${sessionId}/heartbeat`,
      headers: { "x-cpf-candidate-token": candidateToken },
      payload: {
        deviceSessionId: "device-session-001",
        companionVersion: "0.2.0",
        helperState: "ok",
        cameraState: "on",
        focusState: "focused",
        internalClipboardState: "contains_data",
        clientOccurredAt: new Date(Date.now() - 800).toISOString(),
        networkRttMs: 64,
        hashChainHead: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        meta: { monitor: "desktop", build: "local" },
      },
    });

    expect(res.statusCode, res.body).toBe(201);
    expect(typeof res.json().computedClockSkewMs).toBe("number");
  });

  it("accepts ordered event batches and rejects sequence conflicts", async () => {
    const batch = await app.inject({
      method: "POST",
      url: `/v2/sessions/${sessionId}/events:batch`,
      headers: { "x-cpf-candidate-token": candidateToken },
      payload: {
        deviceSessionId: "device-session-001",
        batchId: "batch-001",
        events: [
          {
            sequenceNo: 1,
            eventId: "evt-0001",
            eventType: "focus_lost",
            category: "focus",
            severity: "warning",
            source: "companion",
            clientOccurredAt: new Date().toISOString(),
            payload: { reason: "window_blur" },
            payloadRedacted: false,
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          {
            sequenceNo: 2,
            eventId: "evt-0002",
            eventType: "external_clipboard_blocked",
            category: "clipboard",
            severity: "info",
            source: "companion",
            clientOccurredAt: new Date().toISOString(),
            payload: { source: "os_clipboard" },
            payloadRedacted: false,
            hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            previousHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        ],
      },
    });

    expect(batch.statusCode, batch.body).toBe(201);
    expect(batch.json().acceptedCount).toBe(2);

    const conflict = await app.inject({
      method: "POST",
      url: `/v2/sessions/${sessionId}/events:batch`,
      headers: { "x-cpf-candidate-token": candidateToken },
      payload: {
        deviceSessionId: "device-session-001",
        batchId: "batch-002",
        events: [
          {
            sequenceNo: 2,
            eventId: "evt-0003",
            eventType: "network_disconnected",
            category: "network",
            severity: "high",
            source: "companion",
            clientOccurredAt: new Date().toISOString(),
            payload: { reason: "network_drop" },
            payloadRedacted: false,
            hash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            previousHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        ],
      },
    });

    expect(conflict.statusCode, conflict.body).toBe(409);
    expect(conflict.json().error.code).toBe("LOG_SEQUENCE_CONFLICT");
  });

  it("returns analyzable runtime logs with summary counters", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v2/sessions/${sessionId}/logs?limit=20`,
      headers: { "x-cpf-candidate-token": candidateToken },
    });

    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.summary.totalHeartbeats).toBeGreaterThanOrEqual(1);
    expect(body.summary.totalEvents).toBeGreaterThanOrEqual(2);
    expect(body.summary.focusLossCount).toBeGreaterThanOrEqual(1);
    expect(body.summary.clipboardBlockedCount).toBeGreaterThanOrEqual(1);
    expect(body.events[0]).toHaveProperty("client_occurred_at");
    expect(body.events[0]).toHaveProperty("server_received_at");
  });
});
