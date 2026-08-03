# S09 evidence — controlled assessment copilot (2026-08-03)

- Module [apps/api/src/modules/v2/copilot.ts].
- System prompt built server-side (shared immutable base + pack extension +
  manifest tool list); no client system-prompt field exists; leak test proves
  no rubric/hidden/anchor material in context.
- Storage: displayed messages only (`ai_interactions` append-only; no hidden
  reasoning field exists anywhere); model/prompt pins from the session
  manifest on every row.
- Guards in code: deterministic forbidden-output filter (ADR-002) →
  `validation_status='filtered'` + refusal text; PII redaction (ai-gateway
  `redactPii`) before boundary; budgets (60 turns, 40k tokens/session,
  8k-char input) → 429 COPILOT_BUDGET_EXHAUSTED with explicit "work
  unaffected" messaging; copilot only in `active` state; kill switches
  (V2_KILL_COPILOT + runtime kill) → 503 with candidate-safe message.
- Provider: deterministic stub for the pilot; real provider slots in through
  the existing AI gateway (pinned model, EU region) as a material change with
  re-evaluation (ADR-0005). No provider key can reach client bundles.
- Tests in v2-copilot-tools.test.ts: transcript shape (displayed-only
  columns), redaction applied, key-extraction attempt yields no secret.

# S10 evidence — sandbox plugin broker (same file/date)

- Module [apps/api/src/modules/v2/tool-broker.ts]; 17-plugin catalogue
  (repofs, testrunner, apiclient, dbplan, loglab, tracelab, metricslab,
  featureflaglab, ga4lab, adslab, crmlab, pagelab, searchlab, cmspreview,
  emailpreview, claimschecker, budgetworksheet). MetaLab deferred (no pack
  references it) — registry accepts new plugins without schema change.
- Enforcement: manifest membership (403 TOOL_NOT_IN_MANIFEST), per-tool
  invocation budgets (429), Idempotency-Key required + replay returns the
  original receipt, Zod validation of model-proposed arguments (denied
  receipts), candidate confirmation for assistant-proposed state changes
  (428), circuit breaker after 3 consecutive failures (circuit_open) without
  cross-plugin impact, no live publish/send/spend operation exists.
- Egress deny BY CONSTRUCTION: no network client in the module — asserted by
  test over the module source; all plugin data comes from pack assets +
  session artifacts.
- Receipts: immutable rows citing source descriptor + result hash; visible
  tests never reference hidden checks (asserted).
- Tests: 10/10 PASS (plus env-skip guard).
