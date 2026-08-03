# Assumption ledger

| ID | Assumption | Evidence | Risk if wrong | Reversible | Validation | Status |
|---|---|---|---|---|---|---|
| A-001 | The current HEAD (a322ffd) is the authoritative recovery baseline containing all V2 + `project/` work | `git log` shows b96312a (V2) + a322ffd (project) | Recovery built on wrong base | yes | Confirm no later authorised commit supersedes it | verified |
| A-002 | Backend V1 auth returns `{token, expiresAt, user, memberships}` and exposes `/v1/auth/me` | `apps/api/src/modules/auth/routes.ts:187` | Admin auth repair targets wrong contract | yes | Read route + integration test | verified |
| A-003 | Backend platform listing endpoint is `/v1/platform/organisations` | `apps/api/src/modules/platform/routes.ts:155` | Admin org list stays broken | yes | Read route | verified |
| A-004 | Backend persisted roles are `org_admin`, `hiring_manager`, `platform_admin`, `reviewer` (not `employer_admin`) | integration.test.ts membership inserts | Authorization model mismatch | yes | Read schema/tests | in_progress |
| A-005 | `CPF_AI_Native_Hiring_Blueprint_2026` is required for pack + AI boundary fidelity | prompt M06/M07/M10 | Fabricated assessment content | no | Obtain file from user | blocked (B-001) |
