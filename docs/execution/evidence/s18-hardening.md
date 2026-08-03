# S18 evidence — cross-system hardening (2026-08-03)

## Verification gates run

- Full workspace typecheck: PASS (8 workspaces incl. 4 new packages).
- Full test suite with live PostgreSQL:
  - design-system 13 ✓ · v2-contracts 17 ✓ · assessment-packs 7 ✓ ·
    proctor-protocol 4 ✓ · identity/framework/ai-gateway suites ✓ ·
    api 222 passed / 5 env-skips (incl. new v2-flags 4, v2-storage 5,
    v2-runtime 10, v2-copilot-tools 10, v2-review 9, authz-matrix 90) ·
    web 105 ✓.
- Authorization matrix extended to every V2 org route (deny-by-default × all
  roles × cross-tenant, 90 assertions) with live-route cross-check so any
  future unlisted route fails CI.
- Security controls verified in tests: forced RLS fail-closed, append-only
  evidence, idempotent finalisation under concurrency, path traversal
  rejection, read-only DB plugin guard, egress-deny by construction,
  forbidden-output filter, PII redaction, no provider keys in clients.
- Live UAT (browser + API): full candidate journey to signed receipt; two
  real defects found and fixed live (workspace overflow blocking tab clicks;
  manifest-nonce loss on reload breaking finalisation recovery) — both now
  covered by the recovery design (state endpoint returns nonce under the
  candidate token).
- Runbooks in docs/execution/runbooks (model outage, plugin outage, companion
  disconnect, submission recovery, pack suspension); retention worker with
  dry-run/execute + tombstone evidence.

## Open items (honest P-status)

- P1 external: independent penetration test (web/API/desktop bridge) — not
  performable in-repo; blocks pilot per risk register R2.
- P1 external: DPO/counsel sign-off on classification + DPIA (S03 records).
- P2: RUM/CI performance budgets not yet enforced (lab-only budgets stated);
  visual regression infra not set up.
- Node status stays **in_progress** until the external gates close.
