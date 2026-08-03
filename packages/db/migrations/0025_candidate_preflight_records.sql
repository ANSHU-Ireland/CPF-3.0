BEGIN;

CREATE TABLE IF NOT EXISTS assessment_preflight_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  practice_message text NOT NULL DEFAULT '',
  practice_draft text NOT NULL DEFAULT '',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id)
);

CREATE INDEX IF NOT EXISTS idx_preflight_records_org_updated
  ON assessment_preflight_records (organisation_id, updated_at DESC);

CREATE POLICY assessment_preflight_records_tenant_isolation
  ON assessment_preflight_records
  USING (organisation_id = current_org_id())
  WITH CHECK (organisation_id = current_org_id());

ALTER TABLE assessment_preflight_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_preflight_records FORCE ROW LEVEL SECURITY;

COMMIT;
