// Syncs a CREATE OR REPLACE-safe patch of forbid_row_mutation into a DB where
// 0028 was applied before the retention-worker escape hatch was added.
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:5433/cpf",
});
await client.connect();
await client.query(`
CREATE OR REPLACE FUNCTION forbid_row_mutation() RETURNS trigger AS $$
BEGIN
  IF COALESCE(NULLIF(current_setting('app.retention_worker', true), ''), 'false')::boolean THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
`);
console.log("forbid_row_mutation_patched");
await client.end();
