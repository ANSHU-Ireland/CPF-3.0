-- CPF Enterprise Ecosystem — migration 0023
-- Candidate workspace draft store with optimistic revision control.

BEGIN;

CREATE TABLE IF NOT EXISTS assessment_workspace_drafts (
  session_id uuid PRIMARY KEY REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  template_version_id uuid NOT NULL REFERENCES assessment_template_versions(id),
  schema_version integer NOT NULL DEFAULT 1,
  revision integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'candidate',
  finalised_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workspace_drafts_org_updated
  ON assessment_workspace_drafts (organisation_id, updated_at DESC);

CREATE POLICY assessment_workspace_drafts_tenant_isolation
  ON assessment_workspace_drafts
  USING (organisation_id = current_org_id())
  WITH CHECK (organisation_id = current_org_id());

ALTER TABLE assessment_workspace_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_workspace_drafts FORCE ROW LEVEL SECURITY;

COMMIT;
