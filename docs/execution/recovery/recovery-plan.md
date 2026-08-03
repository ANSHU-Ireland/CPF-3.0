# CPF 3.0 — Recovery Plan (M01 baseline)

> Status model: `not_started` · `in_progress` · `blocked` · `implemented` · `verified`
> A module is `verified` only when acceptance criteria + tests + typecheck + build +
> accessibility/responsive checks pass, evidence paths are recorded, and no known
> P0/P1 engineering defect remains in that module.

## Executive status

**Overall release status: `NOT READY`** (unchanged; recovery in progress).

This ledger tracks the module-by-module recovery defined in the CPF 3.0 recovery
prompt. M01 (Repository Recovery) is the only module being executed in the current
pass. M02–M14 are `not_started` and MUST NOT be reported as complete until their
own acceptance criteria and evidence exist.

## Requirements files

| File | Present | Location |
|---|---|---|
| `CPF_20_Step_Integration_Execution_Plan(2).md` | yes | `docs/status/CPF_20_Step_Integration_Execution_Plan.md` |
| `CPF_AI_Native_Hiring_Blueprint_2026(1).md` | **yes** | `docs/status/CPF_AI_Native_Hiring_Blueprint_2026.md` (99,640 bytes) |

**BLOCKER (B-001): RESOLVED (2026-08-03).** The AI-Native Hiring Blueprint has now
been provided and persisted in the repo. It is the authoritative source for M06/M07
assessment-pack content and M10 AI/copilot boundaries. Note the blueprint's canonical
pack IDs are `SWE-FS-01`, `SWE-PLAT-02`, `DM-PERF-01`, `DM-GTM-02` (the recovery
prompt's shorthand "SE1/SE5/DM1/DM4" maps onto these). M06/M07/M10 are unblocked for
content but remain `not_started` (no implementation performed yet).

## Verified "known broken state" (checked against commit a322ffd)

| Claim | Verified? | Evidence |
|---|---|---|
| Working branch is `chore/cpf3-bootstrap-20260803` | yes | `git branch` / HEAD = a322ffd |
| Commit b96312a introduced V2 backend scaffolding | yes | `git log` |
| Commit a322ffd introduced disconnected `project/` | yes | `git log` |
| Root workspaces exclude `project/` | yes | root `package.json` → `["packages/*","apps/*"]` |
| `project/` has separate lockfile + mismatched React/Router | yes | `project/package-lock.json`; React 18.3, react-router-dom 6.30 |
| `project/` calls `/v1/auth/session` | yes | `project/src/lib/auth.tsx:35` |
| Backend exposes `/v1/auth/me` (not `/session`) | yes | `apps/api/src/modules/auth/routes.ts:187` |
| `project/` calls `/v1/platform/orgs` | yes | `project/src/pages/platform/PlatformOrgsPage.tsx:27` |
| Backend exposes `/v1/platform/organisations` | yes | `apps/api/src/modules/platform/routes.ts:155` |
| `project/` uses `employer_admin` UI role | yes | `project/src/App.tsx`, `lib/types.ts:18` |
| Candidate V2 / Reviewer V2 live inside legacy `apps/web` | yes | `apps/web/src/features/candidate-v2`, `reviewer-v2` |
| `copilot.ts` uses `stubAssist()` in production path | yes | `apps/api/src/modules/v2/copilot.ts:42,149` |
| `apps/proctor-desktop/` is README-only | yes | `apps/proctor-desktop/` contains only `README.md` |
| `apps/candidate-web` / `apps/reviewer-web` do not exist | yes | `apps/` = api, proctor-desktop, web |
| `project/` has no meaningful test suite | yes | no test config/specs under `project/` |

## Authorisation constraints observed

- No `git push`, merge, default-branch change, or deploy performed in M01
  (prompt: "Do not push, merge, change the GitHub default branch or deploy
  without explicit authorisation").
- Recovery branch `recovery/cpf3-role-split` created **locally only**.

## Baseline verification results

See `test-evidence.md` for the recorded commands, outputs and causes.
