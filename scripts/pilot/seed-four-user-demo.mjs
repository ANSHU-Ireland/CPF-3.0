import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "@cpf/identity";

const DATABASE_ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:5433/cpf";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://127.0.0.1:5173";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Password-1234";

const EMAILS = {
  orgAdmin: "org-admin@demo.cpf.test",
  hiringManager: "hiring-manager@demo.cpf.test",
  reviewer: "reviewer@demo.cpf.test",
};

const ORG_SLUG = "demo-four-user-org";
const ORG_NAME = "Demo Four User Org";
const JOB_TITLE = "Senior Software Engineer";

async function ensureOrg(client) {
  const org = await client.query(
    `INSERT INTO organisations (slug, name, type)
     VALUES ($1, $2, 'employer')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, slug, name`,
    [ORG_SLUG, ORG_NAME],
  );
  return org.rows[0];
}

async function ensureFeatureFlags(client, organisationId) {
  for (const flag of ["candidate_v2", "assessment_runtime_v2", "reviewer_v2"]) {
    await client.query(
      `INSERT INTO org_feature_flags (organisation_id, flag, enabled, note)
       VALUES ($1, $2, true, 'local demo seed')
       ON CONFLICT (organisation_id, flag) DO UPDATE
       SET enabled = true, note = EXCLUDED.note, updated_at = now()`,
      [organisationId, flag],
    );
  }
}

async function ensureUser(client, email, displayName, passwordHash) {
  const user = await client.query(
    `INSERT INTO users (email, display_name, status, password_hash)
     VALUES ($1, $2, 'active', $3)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       status = 'active',
       password_hash = EXCLUDED.password_hash,
       mfa_enrolled = false,
       totp_secret = NULL
     RETURNING id, email, display_name`,
    [email, displayName, passwordHash],
  );
  return user.rows[0];
}

async function ensureMembership(client, organisationId, userId, role) {
  await client.query(
    `INSERT INTO org_memberships (organisation_id, user_id, role)
     VALUES ($1, $2, $3::org_role)
     ON CONFLICT (organisation_id, user_id, role) DO NOTHING`,
    [organisationId, userId, role],
  );
}

async function ensureJobProfile(client, organisationId) {
  const existing = await client.query(
    `SELECT id, title
     FROM job_profiles
     WHERE organisation_id = $1 AND title = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [organisationId, JOB_TITLE],
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await client.query(
    `INSERT INTO job_profiles (organisation_id, title, role_family, description, status)
     VALUES ($1, $2, 'software-engineering', 'Seeded local demo role.', 'open')
     RETURNING id, title`,
    [organisationId, JOB_TITLE],
  );
  return created.rows[0];
}

async function createCandidateInvitation(client, organisationId, jobProfileId) {
  const template = await client.query(
    `SELECT id
     FROM assessment_template_versions
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  if (!template.rows[0]) {
    throw new Error("No assessment_template_versions found. Seed framework data first.");
  }

  const stamp = Date.now();
  const candidateEmail = `candidate.${stamp}@demo.cpf.test`;
  const candidate = await client.query(
    `INSERT INTO candidates (organisation_id, email, full_name, status)
     VALUES ($1, $2, $3, 'invited')
     RETURNING id, email, full_name`,
    [organisationId, candidateEmail, `Demo Candidate ${stamp}`],
  );

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  const invitation = await client.query(
    `INSERT INTO invitations
       (organisation_id, candidate_id, job_profile_id, template_version_id, status, token_hash, expires_at, sent_at, experience_version)
     VALUES
       ($1, $2, $3, $4, 'sent', $5, now() + interval '14 days', now(), 'v2')
     RETURNING id, expires_at`,
    [organisationId, candidate.rows[0].id, jobProfileId, template.rows[0].id, tokenHash],
  );

  await client.query(
    `INSERT INTO invitation_lookup (token_hash, invitation_id, organisation_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash, invitation.rows[0].id, organisationId, invitation.rows[0].expires_at],
  );

  return {
    candidate: candidate.rows[0],
    token,
    invitationId: invitation.rows[0].id,
    candidateV2Url: `${WEB_BASE_URL}/candidate-v2/${token}`,
  };
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_ADMIN_URL });
  await client.connect();

  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    await client.query("BEGIN");

    const org = await ensureOrg(client);
    await ensureFeatureFlags(client, org.id);

    const orgAdmin = await ensureUser(client, EMAILS.orgAdmin, "Demo Org Admin", passwordHash);
    const hiringManager = await ensureUser(client, EMAILS.hiringManager, "Demo Hiring Manager", passwordHash);
    const reviewer = await ensureUser(client, EMAILS.reviewer, "Demo Reviewer", passwordHash);

    await client.query("SELECT set_config('app.current_org_id', $1, true)", [org.id]);
    await ensureMembership(client, org.id, orgAdmin.id, "org_admin");
    await ensureMembership(client, org.id, hiringManager.id, "hiring_manager");
    await ensureMembership(client, org.id, reviewer.id, "reviewer");

    const jobProfile = await ensureJobProfile(client, org.id);
    const candidateInvite = await createCandidateInvitation(client, org.id, jobProfile.id);

    await client.query("COMMIT");

    const payload = {
      environment: {
        databaseAdminUrl: DATABASE_ADMIN_URL,
        webBaseUrl: WEB_BASE_URL,
      },
      organisation: {
        id: org.id,
        slug: org.slug,
        name: org.name,
      },
      credentials: {
        password: DEMO_PASSWORD,
        users: [
          {
            persona: "Org Admin",
            email: EMAILS.orgAdmin,
            loginUrl: `${WEB_BASE_URL}/login?returnTo=${encodeURIComponent(`/org/${org.id}/sessions`)}`,
          },
          {
            persona: "Hiring Manager",
            email: EMAILS.hiringManager,
            loginUrl: `${WEB_BASE_URL}/login?returnTo=${encodeURIComponent(`/org/${org.id}/job-profiles`)}`,
          },
          {
            persona: "Reviewer",
            email: EMAILS.reviewer,
            loginUrl: `${WEB_BASE_URL}/login?returnTo=${encodeURIComponent(`/org/${org.id}/reviews-v2`)}`,
          },
          {
            persona: "Candidate",
            email: candidateInvite.candidate.email,
            loginUrl: candidateInvite.candidateV2Url,
          },
        ],
      },
      candidateInvitation: {
        invitationId: candidateInvite.invitationId,
        token: candidateInvite.token,
        link: candidateInvite.candidateV2Url,
      },
      note: "Candidate uses tokenized link directly; no password login is required.",
    };

    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
