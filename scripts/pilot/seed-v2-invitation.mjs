// Seeds a fresh V2 invitation (org enrolled in V2 flags) and prints the
// candidate-v2 link for browser UAT.
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";

const admin = new pg.Client({
  connectionString: process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:5433/cpf",
});
await admin.connect();
const org = await admin.query(
  `INSERT INTO organisations (slug, name, type) VALUES ('v2-uat-' || substr(md5(random()::text),1,8), 'V2 UAT Org', 'employer') RETURNING id`,
);
const orgId = org.rows[0].id;
for (const flag of ["candidate_v2", "assessment_runtime_v2", "reviewer_v2"]) {
  await admin.query(
    `INSERT INTO org_feature_flags (organisation_id, flag, enabled, note) VALUES ($1, $2, true, 'browser uat')
     ON CONFLICT (organisation_id, flag) DO UPDATE SET enabled = true`,
    [orgId, flag],
  );
}
const version = await admin.query("SELECT id FROM assessment_template_versions LIMIT 1");
const job = await admin.query(
  `INSERT INTO job_profiles (organisation_id, title, role_family, description, status)
   VALUES ($1, 'V2 UAT Role', 'software-engineering', '', 'open') RETURNING id`,
  [orgId],
);
const candidate = await admin.query(
  `INSERT INTO candidates (organisation_id, email, full_name, status)
   VALUES ($1, 'v2-uat-' || substr(md5(random()::text),1,6) || '@t.test', 'Browser UAT Candidate', 'invited') RETURNING id`,
  [orgId],
);
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
const inv = await admin.query(
  `INSERT INTO invitations (organisation_id, candidate_id, job_profile_id, template_version_id, status, token_hash, expires_at, sent_at, experience_version)
   VALUES ($1, $2, $3, $4, 'sent', $5, now() + interval '14 days', now(), 'v2') RETURNING id, expires_at`,
  [orgId, candidate.rows[0].id, job.rows[0].id, version.rows[0].id, tokenHash],
);
await admin.query(
  `INSERT INTO invitation_lookup (token_hash, invitation_id, organisation_id, expires_at) VALUES ($1, $2, $3, $4)`,
  [tokenHash, inv.rows[0].id, orgId, inv.rows[0].expires_at],
);
await admin.end();
console.log(JSON.stringify({ orgId, token, link: `http://127.0.0.1:5173/candidate-v2/${token}` }, null, 2));
