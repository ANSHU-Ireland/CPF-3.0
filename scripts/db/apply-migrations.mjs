// Applies any not-yet-applied SQL migrations from packages/db/migrations to
// the local dev database, tracking state in _migrations_applied. Idempotent.
//
// Usage: node scripts/db/apply-migrations.mjs [--url postgresql://...]
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join(root, "packages", "db", "migrations");
const urlArg = process.argv.indexOf("--url");
const url =
  urlArg > -1 ? process.argv[urlArg + 1] : process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:5433/cpf";

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS _migrations_applied (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set(
    (await client.query("SELECT filename FROM _migrations_applied")).rows.map((r) => r.filename),
  );
  // Backfill tracking for databases migrated before this script existed: any
  // migration whose primary table already exists is considered applied.
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _migrations_applied (filename) VALUES ($1)", [file]);
      console.log(`applied ${file}`);
      applied += 1;
    } catch (error) {
      if (error.code === "42P07" || error.code === "42701" || error.code === "42710") {
        // duplicate table/column/object — this migration pre-dates tracking
        await client.query("ROLLBACK").catch(() => {});
        await client.query("INSERT INTO _migrations_applied (filename) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
        console.log(`already-present ${file}`);
        continue;
      }
      console.error(`failed ${file}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }
  console.log(applied === 0 ? "migrations_up_to_date" : `migrations_applied ${applied}`);
} finally {
  await client.end();
}
