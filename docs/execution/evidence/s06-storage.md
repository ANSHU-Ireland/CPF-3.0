# S06 evidence — V2 storage, RLS, retention (2026-08-03)

- Migration `0028_v2_storage.sql` applied: 15 additive tables
  (assessment_pack_versions, session_manifests, workspace_artifacts,
  artifact_versions, ai_interactions, tool_receipts, integrity_events,
  media_objects, technical_incidents, candidate_annotations,
  review_dimensions_v2, review_probes, adjudications, appeal_cases,
  shutdown_receipts).
- FORCE RLS + tenant policies on all 14 tenant tables; pack registry is
  platform content with a published-version immutability trigger.
- Append-only triggers on artifact_versions, ai_interactions, tool_receipts,
  integrity_events, shutdown_receipts; retention worker escape hatch via
  transaction-local `app.retention_worker` GUC (never set by API code paths).
- Idempotency/uniqueness: (session,sequence_no), (session,event_id),
  (artifact,version_no), invocation_id, (session,idempotency_key),
  manifest nonce UNIQUE, one receipt per session.
- No media blobs in PG: `media_objects` stores encrypted-object references +
  in-row deletion evidence; camera kind exists but capture is NOT implemented
  (DPIA gate A4).
- Retention worker [apps/api/src/jobs/retention-v2.ts]: dry-run + execute,
  rules camera-14d / integrity-90d / evidence-365d; audit write outside the
  deletion transaction (bug found + fixed: swallowed in-tx audit error was
  aborting COMMIT).
- Tests `apps/api/test/v2-storage.test.ts` 5/5 PASS: cross-tenant reads fail
  closed, cross-tenant writes rejected by WITH CHECK, append-only enforced,
  duplicate sequence 23505, published-pack tamper rejected (suspension still
  allowed), retention dry-run/execute with tombstone evidence.
