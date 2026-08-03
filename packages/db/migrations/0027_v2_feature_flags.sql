-- CPF V2 — migration 0027 (S02: feature flags and V2 route seams)
-- Additive only. V1 behaviour is unchanged: experience_version defaults to
-- 'v1' for every existing and new invitation until a tenant is explicitly
-- enrolled in a V2 flag by a platform administrator.

BEGIN;

-- Server-evaluated V2 feature flags, resolved per organisation.
-- Resolution order (plan §Step 2): environment kill switch → platform
-- allowlist (this table, set by platform admins only) → assessment-pack
-- version binding on the invitation. Never client-controlled.
CREATE TABLE org_feature_flags (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  flag            text NOT NULL CHECK (flag IN ('candidate_v2', 'reviewer_v2', 'assessment_runtime_v2', 'proctor_companion')),
  enabled         boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES users(id),
  note            text,
  PRIMARY KEY (organisation_id, flag)
);

ALTER TABLE org_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_feature_flags FORCE ROW LEVEL SECURITY;
-- Tenant members may read their own flags; writes go through platform-admin
-- routes which run under the org context after an explicit permission check.
CREATE POLICY org_feature_flags_tenant_isolation ON org_feature_flags
  USING (organisation_id = current_org_id() OR platform_read_all())
  WITH CHECK (organisation_id = current_org_id());

-- An invitation is permanently bound to one experience version at issue time
-- (plan rule 1.1.3/1.1.4). A session started in V1 never moves to V2.
ALTER TABLE invitations
  ADD COLUMN experience_version text NOT NULL DEFAULT 'v1'
  CHECK (experience_version IN ('v1', 'v2'));

COMMIT;
