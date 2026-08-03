-- CPF V2 — migration 0029 (S08: runtime timing + hidden-check results)
-- Additive. active_since supports server-authoritative scored-time
-- accounting; hidden_check_results is reviewer-facing only (never candidate).

BEGIN;

ALTER TABLE session_manifests
  ADD COLUMN active_since timestamptz,
  ADD COLUMN time_credit_seconds integer NOT NULL DEFAULT 0 CHECK (time_credit_seconds >= 0),
  ADD COLUMN hidden_check_results jsonb;

COMMIT;
