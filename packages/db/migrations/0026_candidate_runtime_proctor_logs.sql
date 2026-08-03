BEGIN;

CREATE TABLE IF NOT EXISTS candidate_session_heartbeats_v2 (
  id bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  device_session_id text NOT NULL,
  companion_version text NOT NULL,
  helper_state text NOT NULL CHECK (helper_state IN ('ok', 'degraded', 'offline')),
  camera_state text NOT NULL CHECK (camera_state IN ('on', 'off', 'permission_denied', 'unavailable')),
  focus_state text NOT NULL CHECK (focus_state IN ('focused', 'blurred')),
  internal_clipboard_state text NOT NULL CHECK (internal_clipboard_state IN ('empty', 'contains_data', 'blocked')),
  client_occurred_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  clock_skew_ms integer NOT NULL,
  network_rtt_ms integer,
  hash_chain_head text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (network_rtt_ms IS NULL OR network_rtt_ms BETWEEN 0 AND 60000)
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_v2_session_time
  ON candidate_session_heartbeats_v2 (session_id, server_received_at DESC);

CREATE TABLE IF NOT EXISTS candidate_behavior_events_v2 (
  id bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  device_session_id text NOT NULL,
  batch_id text,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  event_id text NOT NULL,
  event_type text NOT NULL,
  category text NOT NULL CHECK (category IN ('navigation', 'focus', 'clipboard', 'tool', 'ai', 'network', 'camera', 'integrity', 'system')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  source text NOT NULL CHECK (source IN ('companion', 'web_runtime', 'system')),
  client_occurred_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_bytes integer NOT NULL CHECK (payload_bytes >= 0),
  payload_redacted boolean NOT NULL DEFAULT false,
  redaction_reason text,
  event_hash text NOT NULL,
  previous_hash text,
  CHECK ((payload_redacted = true AND redaction_reason IS NOT NULL) OR payload_redacted = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_behavior_events_v2_session_seq
  ON candidate_behavior_events_v2 (session_id, sequence_no);

CREATE UNIQUE INDEX IF NOT EXISTS uq_behavior_events_v2_session_event
  ON candidate_behavior_events_v2 (session_id, event_id);

CREATE INDEX IF NOT EXISTS idx_behavior_events_v2_session_time
  ON candidate_behavior_events_v2 (session_id, client_occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_behavior_events_v2_session_category
  ON candidate_behavior_events_v2 (session_id, category, severity);

CREATE POLICY candidate_session_heartbeats_v2_tenant_isolation
  ON candidate_session_heartbeats_v2
  USING (organisation_id = current_org_id())
  WITH CHECK (organisation_id = current_org_id());

CREATE POLICY candidate_behavior_events_v2_tenant_isolation
  ON candidate_behavior_events_v2
  USING (organisation_id = current_org_id())
  WITH CHECK (organisation_id = current_org_id());

ALTER TABLE candidate_session_heartbeats_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_session_heartbeats_v2 FORCE ROW LEVEL SECURITY;

ALTER TABLE candidate_behavior_events_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_behavior_events_v2 FORCE ROW LEVEL SECURITY;

COMMIT;
