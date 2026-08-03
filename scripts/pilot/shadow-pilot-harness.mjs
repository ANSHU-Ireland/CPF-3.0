/**
 * S19 — shadow-pilot plumbing harness.
 *
 * Drives N synthetic candidate journeys end-to-end through the LIVE API
 * (flags → v2 invitation → disclosure → preflight → start → artifacts →
 * copilot → tools → finalise) and reports the operational metrics the
 * pre-registered pilot gates need (completion rate, receipt integrity,
 * latency). Synthetic data only — this proves plumbing, never validity:
 * reliability/fairness gates require real candidates and human reviewers.
 *
 * Usage:
 *   node scripts/pilot/shadow-pilot-harness.mjs --sessions 5 \
 *     --api http://127.0.0.1:4000 --admin postgresql://postgres@127.0.0.1:5433/cpf
 */
import pg from "pg";
import { randomUUID, createHash, randomBytes } from "node:crypto";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const API = arg("api", "http://127.0.0.1:4000");
const ADMIN_URL = arg("admin", process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:5433/cpf");
const SESSIONS = Number(arg("sessions", "3"));

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function json(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body.error ?? body)}`);
  return body;
}

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();

// Ensure a pilot org with V2 flags directly (admin bootstrap, synthetic tenant).
const org = await admin.query(
  `INSERT INTO organisations (slug, name, type) VALUES ('shadow-pilot-' || substr(md5(random()::text),1,8), 'Shadow Pilot Org', 'employer') RETURNING id`,
);
const orgId = org.rows[0].id;
for (const flag of ["candidate_v2", "assessment_runtime_v2", "reviewer_v2"]) {
  await admin.query(
    `INSERT INTO org_feature_flags (organisation_id, flag, enabled, note) VALUES ($1, $2, true, 'shadow pilot')
     ON CONFLICT (organisation_id, flag) DO UPDATE SET enabled = true`,
    [orgId, flag],
  );
}
const version = await admin.query("SELECT id FROM assessment_template_versions LIMIT 1");
const job = await admin.query(
  `INSERT INTO job_profiles (organisation_id, title, role_family, description, status)
   VALUES ($1, 'Shadow Pilot Role', 'software-engineering', '', 'open') RETURNING id`,
  [orgId],
);

const results = [];
for (let i = 0; i < SESSIONS; i++) {
  const started = Date.now();
  const result = { session: i + 1, ok: false, steps: [], error: null };
  try {
    const candidate = await admin.query(
      `INSERT INTO candidates (organisation_id, email, full_name, status)
       VALUES ($1, 'shadow-' || substr(md5(random()::text),1,8) || '@pilot.test', 'Shadow Candidate ${i + 1}', 'invited') RETURNING id`,
      [orgId],
    );
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const invitation = await admin.query(
      `INSERT INTO invitations (organisation_id, candidate_id, job_profile_id, template_version_id, status, token_hash, expires_at, sent_at, experience_version)
       VALUES ($1, $2, $3, $4, 'sent', $5, now() + interval '14 days', now(), 'v2') RETURNING id, expires_at`,
      [orgId, candidate.rows[0].id, job.rows[0].id, version.rows[0].id, tokenHash],
    );
    await admin.query(
      `INSERT INTO invitation_lookup (token_hash, invitation_id, organisation_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [tokenHash, invitation.rows[0].id, orgId, invitation.rows[0].expires_at],
    );

    const landing = await json(await fetch(`${API}/v2/candidate/${token}`));
    result.steps.push(`landing:${landing.state}`);
    const disclose = await json(await fetch(`${API}/v2/candidate/${token}/disclose`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    const sessionId = disclose.sessionId;
    const nonce = disclose.manifest.nonce;
    result.steps.push("disclosed");
    for (const step of ["preflight/complete", "check-in", "start"]) {
      await json(await fetch(`${API}/v2/candidate/${token}/${step}`, { method: "POST" }));
    }
    result.steps.push("active");
    const h = { "x-cpf-candidate-token": token, "content-type": "application/json" };

    for (const [path, slot, kind, content] of [
      ["plan/plan.md", "plan", "document", "Plan: tenancy-safe bulk archive, audit event, flag rollout."],
      ["code/patch.diff", "code_patch", "code_patch", "WHERE organisation_id = $1 -- audit append; 50 BATCH_LIMIT; idempotency-key honoured; 403 cross-tenant"],
      ["handover/notes.md", "handover", "handover_note", "Shipped bulk archive. Risk: partial-failure copy. Gap: per-item errors. Next: rate limit."],
    ]) {
      await json(
        await fetch(`${API}/v2/sessions/${sessionId}/artifacts/${path}`, {
          method: "PUT",
          headers: h,
          body: JSON.stringify({ kind, deliverableSlot: slot, content, baseVersionNo: 0 }),
        }),
      );
    }
    result.steps.push("artifacts:3");

    await json(await fetch(`${API}/v2/sessions/${sessionId}/copilot/messages`, { method: "POST", headers: h, body: JSON.stringify({ text: "Sanity-check my plan for the bulk archive endpoint." }) }));
    result.steps.push("copilot:1");
    await json(
      await fetch(`${API}/v2/sessions/${sessionId}/tools/testrunner/run`, {
        method: "POST",
        headers: { ...h, "idempotency-key": `pilot-${randomUUID()}` },
        body: JSON.stringify({ arguments: {} }),
      }),
    );
    result.steps.push("tool:testrunner");

    const fin = await json(
      await fetch(`${API}/v2/sessions/${sessionId}/finalise`, { method: "POST", headers: h, body: JSON.stringify({ manifestNonce: nonce, declaredLimitations: "Synthetic shadow run." }) }),
    );
    result.receipt = fin.receipt.support_code;
    result.artifactHead = fin.receipt.artifact_head;
    // Replay must return the identical receipt.
    const replay = await json(
      await fetch(`${API}/v2/sessions/${sessionId}/finalise`, { method: "POST", headers: h, body: JSON.stringify({ manifestNonce: nonce, declaredLimitations: "" }) }),
    );
    result.replayConsistent = replay.receipt.support_code === fin.receipt.support_code;
    result.ok = true;
    result.steps.push("submitted");
  } catch (error) {
    result.error = String(error.message ?? error);
  }
  result.ms = Date.now() - started;
  results.push(result);
}

await admin.end();

const completed = results.filter((r) => r.ok).length;
const summary = {
  sessions: SESSIONS,
  completed,
  completionRate: `${Math.round((completed / SESSIONS) * 100)}%`,
  receiptReplayConsistent: results.every((r) => !r.ok || r.replayConsistent),
  medianMs: results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)],
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (completed !== SESSIONS) process.exit(1);
