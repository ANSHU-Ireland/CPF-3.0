# S08 evidence — assessment runtime + artifact engine (2026-08-03)

- Module [apps/api/src/modules/v2/runtime.ts] + migration 0029 (timing columns).
- Server-authoritative state/time: DB stores state_v2, active_since,
  scored_seconds_used, time_credit_seconds; candidate clock is a projection
  via GET /v2/sessions/:id/state; time limit moves active→submitting, never
  a failed state.
- Manifest issue at disclosure: signed (HMAC-SHA256), pins pack version +
  content hash + prompt/model/rubric/policy/tool versions + notice versions;
  idempotent re-acknowledge returns the same session.
- Artifacts: immutable versions, optimistic concurrency (REVISION_CONFLICT),
  path-traversal rejection, quotas (64 artifacts, 500 versions, 1 MiB text),
  reads never blocked by state.
- Atomic idempotent finalisation (S14 core): manifest-nonce check,
  deliverable validation (422 leaves session mutable), final-pointer freeze,
  server-side hidden-check evaluation into reviewer-facing
  hidden_check_results, artifact head + proctor event head, signed receipt,
  UNIQUE(session_id) + FOR UPDATE serialise concurrent submits → exactly one
  receipt; replay returns the same receipt.
- V1 projection: V2 states map onto the V1 session_status enum so employer
  pipeline views stay coherent; V1 flows untouched.
- Tests `apps/api/test/v2-runtime.test.ts` 10/10 PASS incl. concurrent
  double-submit (one receipt), post-submit immutability, flag-off equivalence
  (WRONG_EXPERIENCE_VERSION), candidate-safe pack view.
- Root-caused a swallowed 42703 (`hash` vs `event_hash`) that aborted the
  finalisation transaction — fixed by removing in-transaction error
  swallowing; recorded as a repo lesson.
- Deviation: pure state machine lives in `@cpf/v2-contracts` (single source)
  instead of a separate `packages/assessment-runtime` — one package fewer,
  same isolation; noted in node file.
