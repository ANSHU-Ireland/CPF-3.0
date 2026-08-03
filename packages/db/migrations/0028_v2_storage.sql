-- CPF V2 — migration 0028 (S06: V2 storage, RLS, retention)
-- Additive only. Every table: org ownership derived server-side, FORCE RLS,
-- idempotency/uniqueness constraints, indexes from real access paths.
-- No media blobs in PostgreSQL — media_objects stores references + deletion
-- evidence only. Integrity data is separated from performance data (ADR-003).

BEGIN;

-- ---------------------------------------------------------------------------
-- Pack registry (S07 fills content; invited versions are immutable)
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_pack_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_code       text NOT NULL,
  pack_version    integer NOT NULL,
  content_hash    text NOT NULL,
  definition      jsonb NOT NULL,             -- candidate-safe content (no hidden tests)
  hidden_checks   jsonb NOT NULL DEFAULT '[]'::jsonb, -- never enters candidate/model context
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'suspended')),
  rubric_version  text NOT NULL,
  prompt_version  text NOT NULL,
  policy_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  change_log      text NOT NULL DEFAULT '',
  UNIQUE (pack_code, pack_version)
);
-- Platform-level content (not tenant data): readable by all API roles, no RLS.
-- Publishing is platform-admin only at the route layer; immutability is
-- enforced by trigger below.

CREATE OR REPLACE FUNCTION forbid_published_pack_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('published', 'suspended') AND (
    NEW.definition IS DISTINCT FROM OLD.definition OR
    NEW.hidden_checks IS DISTINCT FROM OLD.hidden_checks OR
    NEW.content_hash IS DISTINCT FROM OLD.content_hash OR
    NEW.pack_code IS DISTINCT FROM OLD.pack_code OR
    NEW.pack_version IS DISTINCT FROM OLD.pack_version OR
    NEW.rubric_version IS DISTINCT FROM OLD.rubric_version
  ) THEN
    RAISE EXCEPTION 'published pack versions are immutable — clone to a new version';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_version_immutable
  BEFORE UPDATE ON assessment_pack_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_published_pack_mutation();

-- ---------------------------------------------------------------------------
-- Session manifests (one per V2 session; nonce is single-use)
-- ---------------------------------------------------------------------------
CREATE TABLE session_manifests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL UNIQUE REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  invitation_id    uuid NOT NULL REFERENCES invitations(id),
  pack_version_id  uuid NOT NULL REFERENCES assessment_pack_versions(id),
  nonce            text NOT NULL UNIQUE,
  manifest         jsonb NOT NULL,
  signature        text NOT NULL,
  state_v2         text NOT NULL DEFAULT 'invited',
  scored_seconds_used integer NOT NULL DEFAULT 0 CHECK (scored_seconds_used >= 0),
  issued_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  checked_in_at    timestamptz,
  started_at       timestamptz,
  paused_at        timestamptz,
  submitted_at     timestamptz
);
CREATE INDEX idx_session_manifests_org ON session_manifests (organisation_id, issued_at DESC);

-- ---------------------------------------------------------------------------
-- Workspace artifacts: immutable versions + one logical final pointer
-- ---------------------------------------------------------------------------
CREATE TABLE workspace_artifacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('file', 'document', 'table', 'creative', 'code_patch', 'handover_note')),
  path             text NOT NULL,
  deliverable_slot text,
  latest_version_no integer NOT NULL DEFAULT 0,
  final_version_no integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  UNIQUE (session_id, path)
);
CREATE INDEX idx_workspace_artifacts_session ON workspace_artifacts (session_id, created_at);

CREATE TABLE artifact_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  artifact_id      uuid NOT NULL REFERENCES workspace_artifacts(id) ON DELETE CASCADE,
  version_no       integer NOT NULL,
  content          text,                      -- inline for text artifacts (≤1 MiB enforced in API)
  content_hash     text NOT NULL,
  size_bytes       integer NOT NULL CHECK (size_bytes >= 0),
  mime_type        text NOT NULL,
  provenance       text NOT NULL DEFAULT 'candidate' CHECK (provenance IN ('candidate', 'ai_assisted', 'imported_asset')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version_no)
);
CREATE INDEX idx_artifact_versions_artifact ON artifact_versions (artifact_id, version_no DESC);

-- Append-only: versions are never updated or deleted through the app role.
-- The retention worker (separate connection, admin-adjacent role) sets the
-- transaction-local GUC app.retention_worker = 'true' to perform lawful,
-- evidence-writing deletions — application code paths never set it.
CREATE OR REPLACE FUNCTION forbid_row_mutation() RETURNS trigger AS $$
BEGIN
  IF COALESCE(NULLIF(current_setting('app.retention_worker', true), ''), 'false')::boolean THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_artifact_versions_append_only
  BEFORE UPDATE OR DELETE ON artifact_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

-- ---------------------------------------------------------------------------
-- AI interactions (displayed messages only) + tool receipts
-- ---------------------------------------------------------------------------
CREATE TABLE ai_interactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  turn_no          integer NOT NULL,
  role             text NOT NULL CHECK (role IN ('candidate', 'assistant')),
  displayed_text   text NOT NULL,
  displayed_text_hash text NOT NULL,
  model_pin        text NOT NULL,
  prompt_version   text NOT NULL,
  tokens_in        integer NOT NULL DEFAULT 0,
  tokens_out       integer NOT NULL DEFAULT 0,
  validation_status text NOT NULL DEFAULT 'ok' CHECK (validation_status IN ('ok', 'refused', 'filtered', 'failed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_no, role)
);
CREATE INDEX idx_ai_interactions_session ON ai_interactions (session_id, turn_no);
CREATE TRIGGER trg_ai_interactions_append_only
  BEFORE UPDATE OR DELETE ON ai_interactions
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

CREATE TABLE tool_receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  invocation_id    uuid NOT NULL UNIQUE,
  idempotency_key  text NOT NULL,
  plugin_id        text NOT NULL,
  plugin_version   text NOT NULL,
  operation        text NOT NULL,
  status           text NOT NULL CHECK (status IN ('ok', 'failed', 'timeout', 'denied', 'circuit_open')),
  source_descriptor text NOT NULL DEFAULT '',
  result_hash      text,
  result_bytes     integer NOT NULL DEFAULT 0,
  requested_by     text NOT NULL DEFAULT 'candidate' CHECK (requested_by IN ('candidate', 'assistant_proposal')),
  candidate_confirmed boolean NOT NULL DEFAULT false,
  started_at       timestamptz NOT NULL,
  completed_at     timestamptz NOT NULL,
  UNIQUE (session_id, idempotency_key)
);
CREATE INDEX idx_tool_receipts_session ON tool_receipts (session_id, started_at);
CREATE TRIGGER trg_tool_receipts_append_only
  BEFORE UPDATE OR DELETE ON tool_receipts
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

-- ---------------------------------------------------------------------------
-- Integrity evidence (ADR-003 separation) + media references + incidents
-- ---------------------------------------------------------------------------
CREATE TABLE integrity_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  sequence_no      bigint NOT NULL,
  event_id         text NOT NULL,
  event_type       text NOT NULL,
  rule_id          text,
  state            text,
  reliability      text NOT NULL DEFAULT 'medium' CHECK (reliability IN ('high', 'medium', 'low')),
  candidate_visible boolean NOT NULL DEFAULT true,
  annotation_id    uuid,
  occurred_at      timestamptz NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  hash             text NOT NULL,
  previous_hash    text,
  UNIQUE (session_id, sequence_no),
  UNIQUE (session_id, event_id)
);
CREATE INDEX idx_integrity_events_session ON integrity_events (session_id, sequence_no);
CREATE TRIGGER trg_integrity_events_append_only
  BEFORE UPDATE OR DELETE ON integrity_events
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

CREATE TABLE media_objects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  object_key       text NOT NULL UNIQUE,      -- encrypted object store reference; NEVER a blob
  media_kind       text NOT NULL CHECK (media_kind IN ('camera_segment', 'screen_thumbnail', 'audio_none')),
  size_bytes       bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  retain_until     timestamptz NOT NULL,
  deleted_at       timestamptz,
  deletion_evidence jsonb
);
CREATE INDEX idx_media_objects_retention ON media_objects (retain_until) WHERE deleted_at IS NULL;

CREATE TABLE technical_incidents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  reported_by      text NOT NULL CHECK (reported_by IN ('candidate', 'system', 'support')),
  category         text NOT NULL CHECK (category IN ('network', 'device', 'companion', 'plugin', 'ai_provider', 'platform', 'other')),
  description      text NOT NULL DEFAULT '',
  time_credit_minutes integer NOT NULL DEFAULT 0 CHECK (time_credit_minutes BETWEEN 0 AND 240),
  pause_applied    boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'credited', 'rejected')),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);
CREATE INDEX idx_technical_incidents_session ON technical_incidents (session_id, opened_at);

CREATE TABLE candidate_annotations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  target_kind      text NOT NULL CHECK (target_kind IN ('integrity_event', 'technical_incident', 'submission')),
  target_id        text NOT NULL,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, target_kind, target_id)
);

-- ---------------------------------------------------------------------------
-- Review V2 (dimensions, probes, adjudications, appeals) + receipts
-- ---------------------------------------------------------------------------
CREATE TABLE review_dimensions_v2 (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  review_round     integer NOT NULL DEFAULT 1 CHECK (review_round IN (1, 2)),
  dimension_id     text NOT NULL,
  anchor           text NOT NULL CHECK (anchor IN ('not_observed', 'developing', 'capable', 'strong', 'exemplary')),
  rationale        text NOT NULL,
  confidence       text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  limitations      text NOT NULL DEFAULT '',
  cited_evidence   jsonb NOT NULL DEFAULT '[]'::jsonb,
  counter_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up_probe  text NOT NULL DEFAULT '',
  reviewed_by      uuid NOT NULL REFERENCES users(id),
  reviewed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, review_round, dimension_id)
);
CREATE INDEX idx_review_dimensions_v2_session ON review_dimensions_v2 (session_id, review_round);

CREATE TABLE review_probes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  dimension_id     text NOT NULL,
  probe            text NOT NULL,
  created_by       uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE adjudications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  reason           text NOT NULL CHECK (reason IN ('material_disagreement', 'integrity_dispute', 'sampled_qc', 'appeal')),
  outcome          text,
  rationale        text NOT NULL DEFAULT '',
  adjudicator      uuid REFERENCES users(id),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE TABLE appeal_cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  opened_by        text NOT NULL CHECK (opened_by IN ('candidate', 'employer', 'platform')),
  grounds          text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'upheld', 'not_upheld', 'withdrawn')),
  independent_reviewer uuid REFERENCES users(id),
  opened_at        timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  decision_rationale text
);

CREATE TABLE shutdown_receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  session_id       uuid NOT NULL UNIQUE REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  manifest_nonce   text NOT NULL UNIQUE,
  artifact_head    text NOT NULL,
  event_head       text,
  support_code     text NOT NULL,
  signature        text NOT NULL,
  submitted_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_shutdown_receipts_append_only
  BEFORE UPDATE OR DELETE ON shutdown_receipts
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

-- ---------------------------------------------------------------------------
-- RLS: force tenant isolation on every new tenant table
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'session_manifests', 'workspace_artifacts', 'artifact_versions',
    'ai_interactions', 'tool_receipts', 'integrity_events', 'media_objects',
    'technical_incidents', 'candidate_annotations', 'review_dimensions_v2',
    'review_probes', 'adjudications', 'appeal_cases', 'shutdown_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (organisation_id = current_org_id()) WITH CHECK (organisation_id = current_org_id())',
      t, t
    );
  END LOOP;
END $$;

-- Retention defaults (S03/S06; enforced by the retention worker):
--   media_objects.retain_until = decision + 14 days (camera)
--   integrity_events           90 days   (worker filter)
--   artifacts / ai / tool / review evidence 365 days
--   decision audit             730 days
COMMENT ON TABLE media_objects IS 'References to encrypted external objects only. Camera capture is NOT implemented in the pilot (DPIA gate A4); audio_none is a placeholder kind proving no audio path exists.';

COMMIT;
