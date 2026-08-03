# S05 evidence — V2 contracts (2026-08-03)

- Package `@cpf/v2-contracts` v1.0.0: Zod source of truth, dist ESM build.
- Contracts: session lifecycle (13 states, exhaustive transition table, no
  `failed` state reachable — technical interruptions pause), signed
  assessment manifest (HMAC-SHA256 over canonical JSON; `cameraRequired`
  is type-level `false` until DPIA gate A4), artifact + artifact-version,
  displayed-only AI interaction (no hidden-CoT field exists), plugin
  invocation/receipt, typed integrity event (rule id/state only + hash chain),
  technical incident with time credit, dimension review (human anchors,
  rationale/confidence/limitations required), shutdown receipt, event batch
  (idempotent batchId, ≤200 events).
- ADR-002 enforcement: `violatesForbiddenOutput()` deterministic guard +
  pattern list exported for gateway/review validation.
- Tests: 17/17 PASS — happy path, exhaustive illegal-transition sweep,
  signature tamper detection, strict unknown-field rejection, forbidden-output
  matrix, oversized batch rejection.
- All datetimes UTC ISO-8601; idempotency keys on batches/invocations;
  stable error envelope shared with V1 plus `contractVersion`.
