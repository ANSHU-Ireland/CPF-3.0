# ADR-004 — Secure shell boundaries (runtime, plugins, companion)

**Status:** accepted (2026-08-03)

## Decision
Three enforced boundaries:
1. **Runtime** — DB is authoritative for time/state; manifests are signed and
   version-pinned; finalisation is atomic and idempotent.
2. **Plugin broker** — capability tokens bind session+tool+operation+expiry;
   all external egress denied; model-suggested arguments validated by code;
   receipts immutable.
3. **Companion** — narrow typed bridge, endpoint allowlist, internal clipboard,
   no admin rights, self-termination after verified receipt; no biometric,
   emotion or gaze inference ever.

## Consequences
- No provider/API keys in client or desktop bundles.
- Hidden tests and rubrics never enter candidate or model context.
- Every state-changing sandbox action needs explicit candidate confirmation.
