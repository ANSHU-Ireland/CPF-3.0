import pg from "pg";
import { randomBytes, createHash } from "node:crypto";

const { Client } = pg;

async function connectAny() {
  const options = [
    { host: "127.0.0.1", port: 5433, user: "postgres", database: "cpf" },
    { host: "127.0.0.1", port: 5432, user: "postgres", database: "cpf" },
    { host: "127.0.0.1", port: 5433, user: "cpf_api", database: "cpf" },
    { host: "127.0.0.1", port: 5432, user: "cpf_api", database: "cpf" },
    { host: "127.0.0.1", port: 5433, user: "cpf", database: "cpf" },
    { host: "127.0.0.1", port: 5432, user: "cpf", database: "cpf" },
  ];

  let lastError;
  for (const cfg of options) {
    const client = new Client(cfg);
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }
  throw lastError ?? new Error("No local postgres connection succeeded");
}

async function main() {
  const client = await connectAny();
  try {
    const orgRes = await client.query("SELECT id, name FROM organisations ORDER BY created_at ASC LIMIT 1");
    if (!orgRes.rows[0]) throw new Error("No organisations found. Seed org data first.");
    const org = orgRes.rows[0];

    let profileRes = await client.query(
      "SELECT id, title FROM job_profiles WHERE organisation_id = $1 ORDER BY created_at DESC LIMIT 1",
      [org.id],
    );
    if (!profileRes.rows[0]) {
      profileRes = await client.query(
        "INSERT INTO job_profiles (organisation_id, title, role_family, description, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, title",
        [org.id, "QA Analyst", "Operations", "Seeded test profile", "open"],
      );
    }
    const profile = profileRes.rows[0];

    const versionRes = await client.query(
      `SELECT v.id
         FROM assessment_template_versions v
         JOIN assessment_templates t ON t.id = v.template_id
        WHERE t.status = 'published'
        ORDER BY v.created_at DESC
        LIMIT 1`,
    );
    if (!versionRes.rows[0]) throw new Error("No published assessment template version found.");

    const templateVersionId = versionRes.rows[0].id;
    const stamp = Date.now();
    const candidateEmail = `candidate.${stamp}@example.test`;
    const candidateName = `Portal Test ${stamp}`;

    const candidateRes = await client.query(
      "INSERT INTO candidates (organisation_id, email, full_name, status) VALUES ($1, $2, $3, 'invited') RETURNING id",
      [org.id, candidateEmail, candidateName],
    );
    const candidateId = candidateRes.rows[0].id;

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

    const inviteRes = await client.query(
      `INSERT INTO invitations
         (organisation_id, candidate_id, job_profile_id, template_version_id, status, token_hash, expires_at, sent_at)
       VALUES ($1, $2, $3, $4, 'sent', $5, now() + interval '14 days', now())
       RETURNING id, expires_at`,
      [org.id, candidateId, profile.id, templateVersionId, tokenHash],
    );
    const invitation = inviteRes.rows[0];

    await client.query(
      "INSERT INTO invitation_lookup (token_hash, invitation_id, organisation_id, expires_at) VALUES ($1, $2, $3, $4)",
      [tokenHash, invitation.id, org.id, invitation.expires_at],
    );

    const link = `http://127.0.0.1:5173/candidate/${encodeURIComponent(token)}`;

    console.log(
      JSON.stringify(
        {
          db: {
            host: client.connectionParameters.host,
            port: client.connectionParameters.port,
            user: client.connectionParameters.user,
            database: client.connectionParameters.database,
          },
          org: { id: org.id, name: org.name },
          profile: { id: profile.id, title: profile.title },
          candidate: { id: candidateId, email: candidateEmail, name: candidateName },
          invitation: { id: invitation.id, expiresAt: invitation.expires_at },
          token,
          link,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
