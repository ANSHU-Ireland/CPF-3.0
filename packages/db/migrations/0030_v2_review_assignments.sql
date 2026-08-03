-- CPF V2 — migration 0030 (S16: review assignments + second-review policy)
-- Additive.

BEGIN;

CREATE TABLE review_assignments_v2 (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  review_round     integer NOT NULL CHECK (review_round IN (1, 2)),
  reviewer_user_id uuid NOT NULL REFERENCES users(id),
  assigned_by      uuid NOT NULL REFERENCES users(id),
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  reason_code      text,                -- reason-coded manual interventions (audited)
  UNIQUE (session_id, review_round)
);
CREATE INDEX idx_review_assignments_v2_reviewer ON review_assignments_v2 (organisation_id, reviewer_user_id) WHERE completed_at IS NULL;

ALTER TABLE review_assignments_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_assignments_v2 FORCE ROW LEVEL SECURITY;
CREATE POLICY review_assignments_v2_tenant_isolation ON review_assignments_v2
  USING (organisation_id = current_org_id())
  WITH CHECK (organisation_id = current_org_id());

-- Pilot policy: every V2 session requires a blind second review.
ALTER TABLE session_manifests
  ADD COLUMN second_review_required boolean NOT NULL DEFAULT true;

COMMIT;
