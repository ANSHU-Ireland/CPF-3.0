# ADR-001 — V2 ships side-by-side with V1

**Status:** accepted (2026-08-03)

## Decision
Candidate V2, Reviewer V2 and the V2 runtime are additive. V1 pages, routes,
endpoints and active sessions keep exact semantics until V2 has two stable
releases and V1 retirement is separately approved (S20). Routing is decided by
`experience_version` bound to the invitation at issue time — never by client
query parameter.

## Consequences
- New code lives in `/v2` API routes, `apps/web/src/features/{candidate-v2,reviewer-v2}`,
  and `NNNN_v2_*.sql` additive migrations.
- A session started in V1 never moves to V2 and vice versa.
- Rollback = stop issuing V2 invitations; active V2 sessions are supported to completion.
