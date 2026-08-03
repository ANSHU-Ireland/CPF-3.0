# S01 evidence — baseline (2026-08-03)

- Commit: `46b3b473ee0860d540f3050235b7f725036a5a07` (main), Node v24.11.1, npm 11.6.2.
- Migration head at baseline: `0026_candidate_runtime_proctor_logs.sql`.
- `npm run typecheck`: PASS (all 6 workspaces).
- `npm test` with DATABASE_URL + DATABASE_ADMIN_URL:
  - web: 30 files / 100 tests PASS.
  - api: 181 tests → 173 passed, 1 env-skip; 7 reported failures were all
    vitest 5s default-timeout artifacts on this dev machine (argon2 + live-PG
    fixtures) plus one cascade (`undefined.id` from prior timeout). Fixed by
    raising `testTimeout`/`hookTimeout` in [apps/api/vitest.config.ts] —
    test-infra only, zero behaviour change. Re-run of the three affected files:
    20/20 PASS.
- V1 candidate/reviewer routes restored to `CandidatePortalPage`,
  `ReviewQueuePage`, `ReviewWorkspacePage` (superseded "decommission
  transition" pages removed) — V1 remains fully operational per plan rule 1.1.1.
- Trash removed: `apps/web/src/pages/v2/` transition pages, `project/.bolt/`,
  dead `project/.env` (Supabase scaffolding), `scripts/uat-proctor-runtime-output.json`,
  stale `apps/api/dist/`, one-off `scripts/apply-migration-0026.mjs`.
- Protected modules (do not change semantics): Super Admin, Employer Admin,
  identity, tenancy/RLS, audit, data-rights, V1 assessment flows.
- Ownership map: single-maintainer repo — all P0/P1 areas owned by repo owner;
  specialist review (DPO/counsel/I-O/pen-test) recorded as external gates in
  the risk register.
