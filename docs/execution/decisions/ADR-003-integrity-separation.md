# ADR-003 — Integrity evidence is separated from performance evidence

**Status:** accepted (2026-08-03)

## Decision
Integrity/proctor signals (heartbeats, behaviour events, camera objects) are
stored, permissioned, projected and retained separately from performance
evidence (artifacts, AI interactions, tool receipts). Integrity data is
visible only to a distinct integrity role, in a separate reviewer tab, and can
never modify a performance score.

## Consequences
- Separate tables + policies (`integrity_events`, `media_objects` vs `workspace_artifacts`, `ai_interactions`).
- Reviewer queue shows no integrity severity ordering and no camera state.
- Retention: camera 14 days post-decision; integrity metadata 90 days; performance evidence 365 days.
- No "cheating probability" anywhere in the product.
