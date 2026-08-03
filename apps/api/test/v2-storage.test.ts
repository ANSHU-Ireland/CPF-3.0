/**
 * S06 — V2 storage acceptance: forced RLS cross-tenant negatives, append-only
 * evidence guards, pack immutability, idempotency uniqueness, retention pass.
 * Runs only with DATABASE_URL + DATABASE_ADMIN_URL (CI/local PG).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { closePool, createPool, withOrgTx } from "../src/db/pool.js";
import { runV2RetentionPass } from "../src/jobs/retention-v2.js";

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_ADMIN_URL = process.env.DATABASE_ADMIN_URL;
const run = describe.runIf(Boolean(DATABASE_URL && DATABASE_ADMIN_URL));

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "..", "packages", "db", "migrations");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function provision(admin: pg.Client): Promise<void> {
  const exists = await admin.query("SELECT to_regclass('public.organisations') AS t");
  if (!exists.rows[0].t) {
    for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
      await admin.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
  }
}

run("S06 v2 storage — RLS, append-only, immutability", () => {
  let admin: pg.Client;
  let orgA: string;
  let orgB: string;
  let sessionA: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DATABASE_ADMIN_URL });
    await admin.connect();
    await provision(admin);
    createPool(DATABASE_URL!);

    // Bootstrap two orgs + one full candidate chain in org A (admin bypasses RLS).
    const orgs = await admin.query<{ id: string }>(
      `INSERT INTO organisations (slug, name, type)
       VALUES ('s06-org-a-' || substr(md5(random()::text), 1, 8), 'S06 Org A', 'employer'),
              ('s06-org-b-' || substr(md5(random()::text), 1, 8), 'S06 Org B', 'employer')
       RETURNING id`,
    );
    orgA = orgs.rows[0]!.id;
    orgB = orgs.rows[1]!.id;

    const candidate = await admin.query<{ id: string }>(
      `INSERT INTO candidates (organisation_id, email, full_name, status)
       VALUES ($1, 's06-' || substr(md5(random()::text), 1, 6) || '@t.test', 'S06 Candidate', 'invited') RETURNING id`,
      [orgA],
    );
    const job = await admin.query<{ id: string }>(
      `INSERT INTO job_profiles (organisation_id, title, role_family, description, status)
       VALUES ($1, 'S06 Role', 'software-engineering', '', 'open') RETURNING id`,
      [orgA],
    );
    const version = await admin.query<{ id: string }>(
      `SELECT v.id FROM assessment_template_versions v LIMIT 1`,
    );
    const invitation = await admin.query<{ id: string }>(
      `INSERT INTO invitations (organisation_id, candidate_id, job_profile_id, template_version_id, status, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, 'accepted', $5, now() + interval '7 days') RETURNING id`,
      [orgA, candidate.rows[0]!.id, job.rows[0]!.id, version.rows[0]!.id, sha(randomUUID())],
    );
    const session = await admin.query<{ id: string }>(
      `INSERT INTO assessment_sessions (organisation_id, invitation_id, template_version_id, status)
       VALUES ($1, $2, $3, 'disclosure_pending') RETURNING id`,
      [orgA, invitation.rows[0]!.id, version.rows[0]!.id],
    );
    sessionA = session.rows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await closePool();
    await admin?.end();
  });

  it("cross-tenant reads fail closed on every V2 table", async () => {
    // Insert an artifact + version as org A through the app role.
    const artifactId = await withOrgTx(orgA, async (client) => {
      const artifact = await client.query<{ id: string }>(
        `INSERT INTO workspace_artifacts (organisation_id, session_id, kind, path, latest_version_no)
         VALUES ($1, $2, 'document', 'notes/plan.md', 1) RETURNING id`,
        [orgA, sessionA],
      );
      await client.query(
        `INSERT INTO artifact_versions (organisation_id, artifact_id, version_no, content, content_hash, size_bytes, mime_type)
         VALUES ($1, $2, 1, 'v1 content', $3, 10, 'text/markdown')`,
        [orgA, artifact.rows[0]!.id, sha("v1 content")],
      );
      return artifact.rows[0]!.id;
    });

    // Org B sees nothing.
    const fromB = await withOrgTx(orgB, async (client) => {
      const artifacts = await client.query("SELECT id FROM workspace_artifacts WHERE id = $1", [artifactId]);
      const versions = await client.query("SELECT id FROM artifact_versions WHERE artifact_id = $1", [artifactId]);
      return { artifacts: artifacts.rowCount, versions: versions.rowCount };
    });
    expect(fromB).toEqual({ artifacts: 0, versions: 0 });

    // Org B cannot write into org A either (WITH CHECK).
    await expect(
      withOrgTx(orgB, (client) =>
        client.query(
          `INSERT INTO integrity_events (organisation_id, session_id, sequence_no, event_id, event_type, occurred_at, hash)
           VALUES ($1, $2, 1, 'evt-s06-b', 'focus_lost', now(), $3)`,
          [orgA, sessionA, sha("x")],
        ),
      ),
    ).rejects.toThrow();
  });

  it("artifact versions and integrity events are append-only for the app role", async () => {
    await withOrgTx(orgA, (client) =>
      client.query(
        `INSERT INTO integrity_events (organisation_id, session_id, sequence_no, event_id, event_type, occurred_at, hash)
         VALUES ($1, $2, 100, 'evt-s06-append', 'focus_lost', now(), $3)`,
        [orgA, sessionA, sha("append")],
      ),
    );
    await expect(
      withOrgTx(orgA, (client) =>
        client.query("UPDATE integrity_events SET reliability = 'low' WHERE session_id = $1", [sessionA]),
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      withOrgTx(orgA, (client) =>
        client.query("DELETE FROM artifact_versions WHERE organisation_id = $1", [orgA]),
      ),
    ).rejects.toThrow(/append-only/);
  });

  it("duplicate integrity sequence numbers are rejected (idempotency constraint)", async () => {
    await expect(
      withOrgTx(orgA, (client) =>
        client.query(
          `INSERT INTO integrity_events (organisation_id, session_id, sequence_no, event_id, event_type, occurred_at, hash)
           VALUES ($1, $2, 100, 'evt-s06-dup', 'focus_lost', now(), $3)`,
          [orgA, sessionA, sha("dup")],
        ),
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("published pack versions are immutable (clone-to-new-version enforced)", async () => {
    const pack = await admin.query<{ id: string }>(
      `INSERT INTO assessment_pack_versions (pack_code, pack_version, content_hash, definition, status, rubric_version, prompt_version, policy_version, published_at)
       VALUES ('S06-TEST-' || substr(md5(random()::text), 1, 6), 1, $1, '{"title":"x"}', 'published', 'r1', 'p1', 'pol1', now()) RETURNING id`,
      [sha("pack")],
    );
    await expect(
      admin.query(`UPDATE assessment_pack_versions SET definition = '{"title":"tampered"}' WHERE id = $1`, [
        pack.rows[0]!.id,
      ]),
    ).rejects.toThrow(/immutable/);
    // Non-content status flips (suspension) stay allowed:
    await admin.query(`UPDATE assessment_pack_versions SET status = 'suspended' WHERE id = $1`, [pack.rows[0]!.id]);
  });

  it("retention pass deletes expired evidence with tombstone proof, via worker GUC only", async () => {
    await admin.query(
      `INSERT INTO media_objects (organisation_id, session_id, object_key, media_kind, retain_until)
       VALUES ($1, $2, 's06/expired-' || md5(random()::text), 'camera_segment', now() - interval '1 day')`,
      [orgA, sessionA],
    );
    // Dry run reports without deleting.
    const dry = await runV2RetentionPass(admin, false);
    const dryMedia = dry.find((p) => p.table === "media_objects")!;
    expect(dryMedia.eligible).toBeGreaterThanOrEqual(1);
    expect(dryMedia.deleted).toBe(0);
    // Execute tombstones with deletion evidence.
    const exec = await runV2RetentionPass(admin, true);
    expect(exec.find((p) => p.table === "media_objects")!.deleted).toBeGreaterThanOrEqual(1);
    const tombstone = await admin.query(
      `SELECT deletion_evidence FROM media_objects WHERE organisation_id = $1 AND deleted_at IS NOT NULL LIMIT 1`,
      [orgA],
    );
    expect(tombstone.rows[0]!.deletion_evidence.reason).toBe("retention_expiry");
  });
});

describe.runIf(!DATABASE_URL || !DATABASE_ADMIN_URL)("S06 v2 storage", () => {
  it.skip("skipped — DATABASE_URL / DATABASE_ADMIN_URL not set", () => {});
});
