# S02 evidence — feature flags and V2 route seams (2026-08-03)

- Migration `0027_v2_feature_flags.sql` applied: `org_feature_flags` (FORCE RLS,
  tenant isolation + platform read) and `invitations.experience_version`
  (default `'v1'`, CHECK v1|v2) — additive only.
- Server evaluation: [apps/api/src/modules/v2/flags.ts] — resolution is
  env kill switch → platform allowlist (DB) → pack binding. Never client input.
- Kill switches: `V2_KILL_ALL` + per-flag `V2_KILL_<FLAG>` env (restart-free
  alternative: platform PUT endpoint flips the DB flag instantly).
- Routes: `GET /v1/orgs/:orgId/feature-flags` (org members, read-only);
  `PUT /v1/platform/organisations/:orgId/feature-flags/:flag` (platform admin,
  audited via `platform.v2_flag_updated`).
- Invitation issue now stamps `experience_version` from the org's
  `candidate_v2` flag inside the same transaction; response returns it.
  Flag-off orgs keep `'v1'` — byte-identical V1 behaviour.
- Web seams (route-level lazy chunks, zero V1 bundle impact):
  `/candidate-v2/:token`, `/org/:orgId/reviews-v2`, `/org/:orgId/reviews-v2/:reviewId`.
  V1 routes restored and untouched.
- Tests: `apps/api/test/v2-flags.test.ts` 4/4 PASS; API+web typecheck PASS.
- Feature-off equivalence: default flag state is absent/false ⇒ resolver returns
  all-false ⇒ invitations stamp `'v1'` ⇒ no V2 route is ever linked for
  non-pilot tenants.
