# CPF V2 Execution Memory

Authoritative execution state for the 20-step conflict-safe integration plan
(`docs/status/CPF_20_Step_Integration_Execution_Plan.md` — companion spec:
`CPF_AI_Native_Hiring_Blueprint_2026.md`).

## How to use

- `execution-graph.yaml` — dependency source of truth for nodes S01–S20.
- `project-state.yaml` — current status + evidence pointers only. Never duplicates requirements.
- `nodes/SNN-*.md` — one file per execution node (schema in §3.2 of the plan).
- `decisions/` — ADRs. `assumptions.md` — assumption ledger. `risk-register.md` — open risk.
- `contracts/` — generated JSON Schemas for V2 contracts (source of truth is Zod in `packages/v2-contracts`).
- `evidence/` — test output, UAT records, UI review, security notes, per area.
- `runbooks/` — operational procedures for outages/recovery.

## Rules (from plan §1.1 — non-negotiable)

1. V1 endpoints and active sessions never change semantics during S01–S19.
2. V2 lives under `/v2` routes, V2 feature folders and V2 database projections.
3. An invitation is permanently bound to one pack/notice/rubric/manifest version.
4. A session never migrates between V1 and V2.
5. Schema changes are additive until V1 retirement is separately approved.
6. RLS is required on every tenant/candidate table before endpoint access.
7. Performance evidence and integrity evidence stay separated (permissions, projections, tabs, retention).
8. No AI component produces hire/reject/pass/fail/rank/fit or a universal score.
9. No AI/model/prompt/rubric/plugin/policy version change inside an active session.
10. A technical interruption pauses safely; it never auto-invalidates a candidate.

A node may enter `in_progress` only when all dependencies are `complete`.
Completion requires linked evidence, not a prose assertion.
