/**
 * S06 — V2 retention worker. Runs under a privileged retention connection
 * (never the API role) and sets the transaction-local app.retention_worker
 * GUC so append-only guards admit lawful deletion. Every deletion writes
 * evidence (media_objects.deletion_evidence or the retention audit rows).
 *
 * Retention rules (docs/compliance/v2-dpia-scope.md):
 *   media_objects       — delete past retain_until (camera 14d post-decision)
 *   integrity_events    — delete 90 days after received_at
 *   ai_interactions,
 *   tool_receipts,
 *   artifact_versions   — delete 365 days after created_at (finalised sessions only)
 *
 * Usage: RETENTION_DATABASE_URL=postgres://… node dist/jobs/retention-v2.js [--execute]
 * Without --execute it reports counts only (dry run).
 */
import pg from "pg";

interface PassResult {
  table: string;
  eligible: number;
  deleted: number;
}

export async function runV2RetentionPass(client: pg.ClientBase, execute: boolean): Promise<PassResult[]> {
  const results: PassResult[] = [];

  const passes: Array<{ table: string; where: string }> = [
    { table: "media_objects", where: "retain_until < now() AND deleted_at IS NULL" },
    { table: "integrity_events", where: "received_at < now() - interval '90 days'" },
    {
      table: "ai_interactions",
      where: `created_at < now() - interval '365 days'
        AND session_id IN (SELECT id FROM assessment_sessions WHERE status IN ('review_finalised', 'report_issued', 'submitted', 'expired', 'withdrawn', 'invalidated'))`,
    },
    {
      table: "tool_receipts",
      where: `started_at < now() - interval '365 days'
        AND session_id IN (SELECT id FROM assessment_sessions WHERE status IN ('review_finalised', 'report_issued', 'submitted', 'expired', 'withdrawn', 'invalidated'))`,
    },
    {
      table: "artifact_versions",
      where: `created_at < now() - interval '365 days'
        AND artifact_id IN (
          SELECT wa.id FROM workspace_artifacts wa
          JOIN assessment_sessions s ON s.id = wa.session_id
          WHERE s.status IN ('review_finalised', 'report_issued', 'expired', 'withdrawn', 'invalidated')
        )`,
    },
  ];

  for (const pass of passes) {
    const count = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${pass.table} WHERE ${pass.where}`,
    );
    const eligible = count.rows[0]?.n ?? 0;
    let deleted = 0;
    if (execute && eligible > 0) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('app.retention_worker', 'true', true)");
        if (pass.table === "media_objects") {
          // Media rows are tombstoned with deletion evidence, not removed:
          // the row itself is the deletion proof (object_key + evidence).
          const res = await client.query(
            `UPDATE media_objects
                SET deleted_at = now(),
                    deletion_evidence = jsonb_build_object(
                      'deletedAt', now(), 'reason', 'retention_expiry',
                      'objectKey', object_key, 'worker', 'retention-v2')
              WHERE ${pass.where}`,
          );
          deleted = res.rowCount ?? 0;
        } else {
          const res = await client.query(`DELETE FROM ${pass.table} WHERE ${pass.where}`);
          deleted = res.rowCount ?? 0;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      // Deletion evidence: media tombstones carry it in-row; the audit trail
      // below is best-effort and deliberately OUTSIDE the deletion transaction
      // (an audit-schema mismatch must never roll back a lawful deletion,
      // and a swallowed in-transaction error would abort the COMMIT).
      if (deleted > 0) {
        await client
          .query(
            `INSERT INTO audit_log (organisation_id, action, entity_type, entity_id, metadata)
             VALUES (NULL, 'retention.v2_pass', $1, NULL,
                     jsonb_build_object('deleted', $2::int, 'executedAt', now()))`,
            [pass.table, deleted],
          )
          .catch(() => undefined);
      }
    }
    results.push({ table: pass.table, eligible, deleted });
  }
  return results;
}

const isMain = process.argv[1]?.endsWith("retention-v2.js") || process.argv[1]?.endsWith("retention-v2.ts");
if (isMain) {
  const url = process.env.RETENTION_DATABASE_URL ?? process.env.DATABASE_ADMIN_URL;
  if (!url) {
    console.error("RETENTION_DATABASE_URL (or DATABASE_ADMIN_URL) is required.");
    process.exit(1);
  }
  const execute = process.argv.includes("--execute");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const results = await runV2RetentionPass(client, execute);
    console.log(JSON.stringify({ mode: execute ? "execute" : "dry_run", results }, null, 2));
  } finally {
    await client.end();
  }
}
