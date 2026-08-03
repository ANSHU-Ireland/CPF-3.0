# Test evidence

Baseline verification (M01). Commands recorded verbatim with pass/fail and cause.
No unrelated fixes were applied during baseline capture.

## Commands

| # | Command | Result | Notes |
|---|---|---|---|
| 1 | `git fetch cpf3 --prune` | PASS | branches/tags fetched |
| 2 | `git branch -a` / `git log --oneline -5` | PASS | HEAD = a322ffd |
| 3 | `node -v` / `npm -v` | PASS | Node v24.11.1, npm 11.6.2 (repo asks Node >=22) |
| 4 | `npm run typecheck` | PASS | all 8 workspace packages + `@cpf/api` + `@cpf/web` typecheck clean; **`project/` NOT covered** (excluded from root workspaces) |
| 5 | `npm run build` | PASS | builds `assessment-framework, identity, ai-gateway, design-system, v2-contracts, assessment-packs, api`; **does NOT build `@cpf/web` or `project/`** |
| 6 | `npm run test -w @cpf/web` | PASS | 31 files, 105 tests passed (30s); no DB required |

## Not yet run in this pass (honest gaps)

- `npm test` (full) — API integration/RLS suites require `DATABASE_URL` + `DATABASE_ADMIN_URL`; not executed in this baseline.
- `npm run lint` — root has no aggregate `lint` script wired for every workspace yet (M02 action).
- `project/` typecheck/build/test — `project/` is outside root workspaces and has its own lockfile (M02 action).
- `apps/web` production build (`vite build`) — not run; only tsc typecheck verified.

## Baseline conclusion

Workspace packages + API + legacy web typecheck and the packaged build are GREEN.
The material baseline defects are structural, exactly as M02/M03 predict: `project/`
is not part of the workspace graph, the root build omits the web apps, and there is
no aggregate lint/test wiring across all applications. No source was modified to
achieve these results.

## M02 verification (Monorepo & Application Boundaries)

| # | Command | Result | Notes |
|---|---|---|---|
| 7 | `npm install` (root) | PASS | Single root install resolves all web apps; nested `project/package-lock.json` removed; no ERESOLVE/peer failures (React 18→19 alignment of `@cpf/admin-web`). |
| 8 | `npm run typecheck` | PASS | Now covers `@cpf/admin-web` (project/) + new `@cpf/candidate-web` + `@cpf/reviewer-web` + `@cpf/web` + `@cpf/api` + all packages — all clean. First time `project/` is in the workspace typecheck graph. |
| 9 | `npm run admin:build` | PASS | `@cpf/admin-web` Vite production build succeeds. |
| 10 | `npm run candidate:build` | PASS | `@cpf/candidate-web` tsc + Vite build succeeds. |
| 11 | `npm run reviewer:build` | PASS | `@cpf/reviewer-web` tsc + Vite build succeeds. |
| 12 | `npm run candidate:test` | PASS | 1 file / 1 test. |
| 13 | `npm run reviewer:test` | PASS | 1 file / 1 test. |
| 14 | `npm run admin:test` | PASS | `vitest run --passWithNoTests` → exit 0 (no admin tests yet). |
| 15 | `npm run legacy:test` | PASS (assertions) | 31 files / **105 tests passed**; process exits 1 due to a V8 heap OOM at worker teardown (not a test failure) — environmental, matches M01's 105/105. |

### M02 honest gaps / deferrals

- Full `npm test` (API DB/RLS suites) and workspace-wide `npm run lint` still not run.
- `@cpf/web`→`@cpf/legacy-web` rename and removal of embedded Candidate V2 / Reviewer V2
  routes DEFERRED to M14 (see decision-log D-004): replacements (M07/M09) don't exist yet
  and a live demo depends on the current routes.
- `react-router-dom` kept at v6 in `@cpf/admin-web` (v6→v8 is an API rewrite; deferred as a
  separate tested migration — see D-005).
- Legacy `vitest run` exits non-zero on teardown OOM; needs a memory/pool tweak before CI
  can treat it as green (tracked for M13 CI hardening).
