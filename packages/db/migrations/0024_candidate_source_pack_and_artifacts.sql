-- CPF Enterprise Ecosystem — migration 0024
-- Candidate source-pack, artifact metadata lifecycle, and immutable submission manifests.

BEGIN;

CREATE TABLE IF NOT EXISTS assessment_source_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES assessment_template_versions(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  item_type text NOT NULL CHECK (item_type IN ('inline_text', 'file_ref', 'link')),
  content text,
  storage_key text,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'text/plain',
  display_order integer NOT NULL DEFAULT 1,
  availability_state text NOT NULL DEFAULT 'available' CHECK (availability_state IN ('available', 'pending', 'unavailable')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_pack_items_template_order
  ON assessment_source_pack_items (template_version_id, display_order, created_at);

CREATE TABLE IF NOT EXISTS assessment_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  deliverable_type text NOT NULL,
  original_filename text NOT NULL,
  safe_display_filename text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text,
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'rejected', 'failed')),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'uploaded', 'available', 'removed', 'frozen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  frozen_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_assessment_artifacts_session
  ON assessment_artifacts (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assessment_submission_manifests (
  session_id uuid PRIMARY KEY REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  template_version_id uuid NOT NULL REFERENCES assessment_template_versions(id),
  workspace_revision integer NOT NULL,
  workspace_sha256 text NOT NULL,
  artifact_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  notice_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  integrity_policy_version text NOT NULL DEFAULT 'v1',
  submitted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE POLICY assessment_artifacts_tenant_isolation
  ON assessment_artifacts
  USING (organisation_id = current_org_id())
  WITH CHECK (organisation_id = current_org_id());

CREATE POLICY assessment_submission_manifests_tenant_isolation
  ON assessment_submission_manifests
  USING (organisation_id = current_org_id())
  WITH CHECK (organisation_id = current_org_id());

CREATE POLICY assessment_source_pack_items_tenant_isolation
  ON assessment_source_pack_items
  USING (
    template_version_id IN (
      SELECT DISTINCT i.template_version_id
      FROM invitations i
      WHERE i.organisation_id = current_org_id()
    )
  )
  WITH CHECK (
    template_version_id IN (
      SELECT DISTINCT i.template_version_id
      FROM invitations i
      WHERE i.organisation_id = current_org_id()
    )
  );

ALTER TABLE assessment_source_pack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_source_pack_items FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_submission_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_submission_manifests FORCE ROW LEVEL SECURITY;

COMMIT;
